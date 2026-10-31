// Circle App Kit swap: pure helpers (no SDK import, no network). The SDK calls live in appkit-sdk.ts.
//
// How this route is wired (verified in the SDK source and Circle docs):
// - Chain name is exactly "Arc_Testnet". amountIn is a decimal string such as "1.00".
// - The swap runs from the browser with the user's own wallet (EIP-1193). It is keyless: the SDK refuses to send an API
//   key from a browser, so no key is ever used or needed here.
// - Allowance is handled inside the SDK (permit signature, falling back to approve). We never write approve calls.

export const AK_CHAIN = 'Arc_Testnet' as const

export type AkToken = 'USDC' | 'EURC' | 'cirBTC'
export const AK_TOKENS: readonly AkToken[] = ['USDC', 'EURC', 'cirBTC']
export const AK_DECIMALS: Record<AkToken, number> = { USDC: 6, EURC: 6, cirBTC: 8 }

/** Slippage presets in basis points (50 = 0.5%). The SDK default is 300 (3%); we default tighter. */
export const AK_SLIPPAGE_PRESETS: readonly number[] = [50, 100, 300]
export const AK_DEFAULT_SLIPPAGE_BPS = 100

/** USDC kept back by MAX, because USDC is also the gas token on Arc. */
export const AK_USDC_GAS_RESERVE = 0.1

export const sdkSymbol = (t: AkToken): string => (t === 'cirBTC' ? 'CIRBTC' : t)

/**
 * Turn what the user typed into the string the SDK expects ("1.00"): at least two decimals, never more than the token has.
 * Returns null for anything that is not a positive amount.
 */
export function normalizeAmountIn(input: string, decimals: number): string | null {
  const v = String(input ?? '').trim().replace(',', '.')
  if (!/^\d{1,12}(\.\d{1,18})?$/.test(v)) return null
  const parts = v.split('.')
  const intPart = (parts[0] ?? '0').replace(/^0+(?=\d)/, '')
  let frac = (parts[1] ?? '').slice(0, decimals)
  while (frac.length < 2) frac += '0'
  if (!/[1-9]/.test(intPart + frac)) return null
  return `${intPart}.${frac}`
}

export interface AkFee { type: string; token: string; amount: string }

export interface AkEstimate {
  tokenIn: AkToken
  tokenOut: AkToken
  amountIn: string
  /** Estimated output, straight from the SDK. */
  out: string
  /** The SDK's stop limit for the slippage chosen: the least the user should receive. */
  minOut: string | null
  fees: AkFee[]
  gas: AkFee | null
  providerFee: AkFee | null
  /** Swap provider reported by the route (for example "lifi"), when the SDK returns one. */
  provider: string | null
  tool: string | null
}

export interface AkResult {
  txHash: string | null
  amountOut: string | null
  status: 'confirmed' | 'pending' | 'failed'
  explorerUrl: string | null
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

function readFee(v: unknown): AkFee | null {
  if (!isRecord(v)) return null
  const amount = str(v.amount)
  const token = str(v.token)
  return amount && token ? { type: str(v.type) ?? 'fee', token, amount } : null
}

/** Read the SDK's estimate defensively. Throws when there is no estimated output, so nothing is ever invented. */
export function summarizeEstimate(raw: unknown, tokenIn: AkToken, tokenOut: AkToken): AkEstimate {
  if (!isRecord(raw)) throw new Error('The swap service returned no estimate.')
  const out = isRecord(raw.estimatedOutput) ? str(raw.estimatedOutput.amount) : null
  if (!out) throw new Error('The swap service returned no estimated output.')
  const stop = isRecord(raw.stopLimit) ? str(raw.stopLimit.amount) : null
  const fees = Array.isArray(raw.fees) ? raw.fees.map(readFee).filter((f): f is AkFee => f !== null) : []
  const route = isRecord(raw.route) ? raw.route : null
  const step = route && Array.isArray(route.steps) && isRecord(route.steps[0]) ? route.steps[0] : null
  return {
    tokenIn,
    tokenOut,
    amountIn: str(raw.amountIn) ?? '',
    out,
    minOut: stop,
    fees,
    gas: fees.find((f) => f.type === 'gas') ?? null,
    providerFee: fees.find((f) => f.type === 'provider') ?? null,
    provider: route ? str(route.provider) : null,
    tool: step ? str(step.toolName) : null,
  }
}

/** Read the SDK's swap result. DONE = confirmed on-chain; PENDING = submitted; anything else = failed. */
export function summarizeResult(raw: unknown): AkResult {
  if (!isRecord(raw)) throw new Error('The swap service returned no result.')
  const progress = isRecord(raw.progress) ? str(raw.progress.status) : null
  const status: AkResult['status'] = progress === 'DONE' ? 'confirmed' : progress === 'PENDING' ? 'pending' : 'failed'
  return { txHash: str(raw.txHash), amountOut: str(raw.amountOut), status, explorerUrl: str(raw.explorerUrl) }
}

/** The estimated rate (output per 1 input), derived from the SDK's own estimate. Null when it cannot be computed. */
export function estimatedRate(est: AkEstimate): string | null {
  const a = Number(est.amountIn)
  const o = Number(est.out)
  if (!(a > 0) || !(o > 0)) return null
  const r = o / a
  const digits = r >= 1000 ? 2 : r >= 1 ? 4 : 8
  return r.toFixed(digits).replace(/\.?0+$/, '')
}

/**
 * Arc pays gas in USDC. Returns a plain sentence when the wallet cannot cover the gas of this swap
 * (plus the swap amount itself when USDC is what is being sold), otherwise null.
 */
export function gasShortfall(est: AkEstimate | null, usdcBalance: number, tokenIn: AkToken, amountIn: number): string | null {
  const gasNeeded = est && est.gas && est.gas.token === 'USDC' ? Number(est.gas.amount) : null
  if (gasNeeded === null) {
    if (tokenIn !== 'USDC' && usdcBalance <= 0) return 'Arc pays network fees in USDC and your wallet has none. Get test USDC from the Faucet first.'
    return null
  }
  const needed = gasNeeded + (tokenIn === 'USDC' ? amountIn : 0)
  if (usdcBalance + 1e-9 >= needed) return null
  const fmt = (n: number) => n.toFixed(4).replace(/\.?0+$/, '')
  return tokenIn === 'USDC'
    ? `Not enough USDC: this swap needs ${fmt(needed)} USDC (the amount plus about ${fmt(gasNeeded)} for network fees) and you have ${fmt(usdcBalance)}.`
    : `Not enough USDC for network fees: Arc pays gas in USDC. You need about ${fmt(gasNeeded)} USDC and have ${fmt(usdcBalance)}. Get test USDC from the Faucet.`
}

export type AkErrorKind = 'rejected' | 'chain' | 'balance' | 'gas' | 'no-route' | 'minimum' | 'slippage' | 'reverted' | 'network' | 'token' | 'other'
export interface AkErrorInfo { kind: AkErrorKind; message: string; code: number | null }

function dig(err: unknown, key: string): unknown {
  let cur: unknown = err
  for (let i = 0; i < 4 && isRecord(cur); i += 1) {
    if (key in cur && cur[key] !== undefined) return cur[key]
    cur = cur.cause ?? cur.rawError
  }
  return undefined
}

/** One plain sentence for every failure the swap can hit. */
export function explainAkError(err: unknown): AkErrorInfo {
  const kitCode = dig(err, 'code')
  const code = typeof kitCode === 'number' ? kitCode : null
  const nameRaw = dig(err, 'name')
  const name = typeof nameRaw === 'string' ? nameRaw : ''
  const msgRaw = dig(err, 'message')
  const msg = (typeof msgRaw === 'string' ? msgRaw : typeof err === 'string' ? err : '').split('\n')[0] ?? ''
  const walletCode = dig(err, 'code')
  if (walletCode === 4001 || walletCode === 'ACTION_REJECTED' || code === 1099 || /user rejected|rejected the request|user denied/i.test(msg))
    return { kind: 'rejected', code, message: 'You rejected the request in your wallet. Nothing was swapped.' }
  if (code === 1011 || code === 1001 || /INPUT_CHAIN_SWITCH_REJECTED|INPUT_NETWORK_MISMATCH/.test(name))
    return { kind: 'chain', code, message: 'Switch your wallet to Arc Testnet, then try again.' }
  if (code === 9001) return { kind: 'balance', code, message: 'Your balance is too low for this amount.' }
  if (code === 9002) return { kind: 'gas', code, message: 'Not enough USDC for network fees. Arc pays gas in USDC. Get test USDC from the Faucet.' }
  if (code === 9003) return { kind: 'balance', code, message: 'The token allowance is too low. Try the swap again and approve when your wallet asks.' }
  if (code === 1003 || /no route available/i.test(msg))
    return { kind: 'no-route', code, message: 'No liquidity or route for this amount right now. Try a smaller amount.' }
  if (code === 1007) return { kind: 'minimum', code, message: 'The amount is too small to swap. Try a larger amount.' }
  if (code === 1009) return { kind: 'slippage', code, message: 'The price moved more than your slippage limit. Request a new estimate and try again.' }
  if (code === 1006) return { kind: 'token', code, message: "This token isn't supported on Arc Testnet by the swap service." }
  if (code === 5001 || code === 5002 || code === 5003 || code === 5004)
    return { kind: 'reverted', code, message: 'The swap would fail or failed on Arc Testnet. Testnet pools can be unbalanced: try a smaller amount or request a new estimate.' }
  if (code === 3002 || code === 3001 || /timeout|timed out|failed to fetch|network/i.test(msg))
    return { kind: 'network', code, message: 'The swap service did not respond. Check your connection and try again.' }
  const short = msg.length > 140 ? msg.slice(0, 137) + '...' : msg
  return { kind: 'other', code, message: short ? `Swap failed: ${short}` : 'Swap failed. Try again.' }
}
