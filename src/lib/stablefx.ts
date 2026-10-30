/**
 * Browser side of the StableFX swap. Everything that touches Circle goes through /api/stablefx, a server function
 * that holds STABLEFX_API_KEY. Nothing here ever sees a key.
 *
 * Flow (all real, nothing simulated):
 *   1. quote        POST /api/stablefx {action: 'quote'}            tradable quote + Permit2 typed data
 *   2. approve      ERC-20 approve(Permit2, amount)                 on-chain, from the wallet
 *   3. sign         eth_signTypedData_v4 over the quote typed data  wallet signature
 *   4. trade        POST {action: 'trade'}                          rate is locked
 *   5. sign         eth_signTypedData_v4 over the funding data      wallet signature
 *   6. fund         POST {action: 'fund'}                           Circle submits the funding to the escrow
 *   7. status       POST {action: 'tradeStatus'} until settled
 */
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, parseAbiParameters, toBytes } from 'viem'
import { ARC } from '../config/chain-config'
import { ethCall, fromUnits, toUnits } from './evm'

export type SwapToken = 'USDC' | 'EURC'
export const SWAP_TOKENS: readonly SwapToken[] = ['USDC', 'EURC']
export const MIN_SWAP_USDC = 10

export const NOT_ENABLED_MESSAGE = 'Swap is not enabled yet: Circle StableFX access is not configured.'
export const UNREACHABLE_MESSAGE = 'The swap service is unreachable right now. Please try again in a moment.'
export const CIRBTC_REASON = 'StableFX does not list cirBTC, so it cannot be swapped.'

export type ServiceState = 'ready' | 'not_configured' | 'access_denied' | 'unreachable' | 'mainnet_blocked' | 'invalid_format'

/** Short text for the swap page. Always starts with the same sentence when access is missing. */
/** Pairs Circle StableFX can quote on Arc Testnet: USDC <-> EURC, both directions. cirBTC is not listed by StableFX, and ArcLance has no USDT. */
export const SUPPORTED_PAIRS: Record<SwapToken, readonly SwapToken[]> = { USDC: ['EURC'], EURC: ['USDC'] }
export const PAIR_NOT_SUPPORTED = "This pair isn't supported on Arc Testnet yet."
export function pairSupport(from: string, to: string): { ok: boolean; reason: string } {
  const list = (SUPPORTED_PAIRS as Record<string, readonly string[] | undefined>)[from]
  return list && list.includes(to) ? { ok: true, reason: '' } : { ok: false, reason: PAIR_NOT_SUPPORTED }
}

/** Turn a quote failure into one specific, plain sentence. */
export function friendlyQuoteError(code: string, message: string): string {
  // Our own safety checks already say exactly what is wrong; keep their wording.
  if (code === 'bad_quote' || code === 'bad_funding' || code === 'expired') return message
  if (/minimum|too small|less than|below/i.test(message)) return 'The amount is below the minimum swap size. Try a larger amount.'
  if (/liquidity|no (maker|quote|price)|unable to (quote|price)|cannot be quoted|not (currently )?available|unsupported|not supported/i.test(message)) return 'No liquidity for this amount right now. Try a smaller amount.'
  if (code === 'bad_request' && message) return message
  return 'Quote request failed. Retry.'
}

let lastHttpStatus: number | null = null
/** What Circle answered when the server last checked access (null when it has not answered). */
export function serviceHttpStatus(): number | null { return lastHttpStatus }

export function serviceMessage(state: ServiceState, httpStatus: number | null = null): string {
  if (state === 'access_denied' && httpStatus) return `${NOT_ENABLED_MESSAGE} Circle answered HTTP ${httpStatus} for the configured key. Use a TEST key with StableFX "Read and write" access.`
  if (state === 'unreachable') return UNREACHABLE_MESSAGE
  if (state === 'mainnet_blocked' || state === 'invalid_format') return `${NOT_ENABLED_MESSAGE} This app is testnet-only and needs a TEST key.`
  return NOT_ENABLED_MESSAGE
}

export class SwapError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

interface ApiResponse {
  error?: string
  message?: string
  state?: string
  [key: string]: unknown
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  let resp: Response
  try {
    resp = await fetch('/api/stablefx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
  } catch {
    throw new SwapError('unreachable', UNREACHABLE_MESSAGE)
  }
  // No function at this address (for example a static host): treat as "not configured", never crash
  if (resp.status === 404 || resp.status === 405) throw new SwapError('not_configured', NOT_ENABLED_MESSAGE)
  let json: ApiResponse = {}
  try {
    json = (await resp.json()) as ApiResponse
  } catch {
    throw new SwapError('unreachable', UNREACHABLE_MESSAGE)
  }
  if (resp.ok) return json as T
  if (json.error === 'not_configured') throw new SwapError('not_configured', serviceMessage((json.state as ServiceState) || 'not_configured'))
  if (json.error === 'access_denied') throw new SwapError('access_denied', NOT_ENABLED_MESSAGE)
  if (json.error === 'rate_limited') throw new SwapError('rate_limited', 'Too many requests. Wait a few seconds and try again.')
  if (json.error === 'rejected' || json.error === 'bad_request') throw new SwapError('rejected', json.message || 'Circle could not process this request.')
  throw new SwapError('unreachable', UNREACHABLE_MESSAGE)
}

/** Ask the server function whether swapping is available. Never throws. */
let loggedState = ''
function logUnavailable(state: ServiceState): void {
  if (state === 'ready' || state === loggedState) return
  loggedState = state
  console.error(`[swap] StableFX is not ready: state=${state}${lastHttpStatus ? `, circleHttpStatus=${lastHttpStatus}` : ''}`)
}

export async function fetchServiceState(): Promise<ServiceState> {
  try {
    const r = await call<{ configured: boolean; state: string; httpStatus?: number | null }>('status')
    lastHttpStatus = typeof r.httpStatus === 'number' ? r.httpStatus : null
    const state = (r.configured ? r.state : r.state || 'not_configured') as ServiceState
    logUnavailable(state)
    return state
  } catch (e) {
    const state = e instanceof SwapError && e.code === 'unreachable' ? 'unreachable' : 'not_configured'
    logUnavailable(state)
    return state
  }
}

// ── Circle objects (only the fields we use) ──
export interface CurrencyAmount { currency: string; amount: string }
export interface Permit2Message {
  permitted: { token: string; amount: string | number }
  spender: string
  nonce: string | number
  deadline: string | number
  witness: Record<string, unknown>
}
export interface TypedData {
  domain: { name: string; chainId: number | string; verifyingContract: string }
  types: Record<string, { name: string; type: string }[]>
  primaryType: string
  message: Permit2Message
}
export interface Quote {
  id: string
  rate: string
  from: CurrencyAmount
  to: CurrencyAmount
  createdAt?: string
  expiresAt?: string
  fee?: CurrencyAmount
  collateral?: unknown
  typedData: TypedData
}
export interface Trade { id: string; contractTradeId: string; status: string; from?: CurrencyAmount; to?: CurrencyAmount }
export interface TradeStatus { id: string; status: string; settlementTransactionHash?: string | null; contractTradeId?: string }
export interface FundingPresign { typedData: TypedData; deliverables?: CurrencyAmount[]; receivables?: CurrencyAmount[] }

export interface QuoteRequest { from: SwapToken; to: SwapToken; amount: string; address: string }

export const requestQuote = (r: QuoteRequest) => call<Quote>('quote', { ...r })
export const createTrade = (p: { quoteId: string; address: string; message: Permit2Message; signature: string }) =>
  call<Trade>('trade', { idempotencyKey: crypto.randomUUID(), ...p })
export const requestFundingPresign = (contractTradeId: string) => call<FundingPresign>('fundingPresign', { contractTradeId })
export const submitFunding = (p: { signature: string; permit2: Permit2Message }) => call<{ ok: boolean }>('fund', { ...p })
export const getTradeStatus = (tradeId: string) => call<TradeStatus>('tradeStatus', { tradeId })

// ── Safety checks before the wallet is asked to sign anything ──
const lc = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'bigint' ? v.toString() : '').toLowerCase()
const sameAmount = (a: string | number, b: bigint): boolean => {
  try { return BigInt(a) === b } catch { return false }
}

function checkDomain(td: TypedData): void {
  if (td.domain?.name !== 'Permit2') throw new SwapError('bad_quote', 'The signing request is not a Permit2 request. Nothing was signed.')
  if (Number(td.domain.chainId) !== ARC.chainId) throw new SwapError('bad_quote', 'The signing request is for the wrong network. Nothing was signed.')
  if (lc(td.domain.verifyingContract) !== lc(ARC.contracts.permit2)) throw new SwapError('bad_quote', 'The signing request points to an unknown Permit2 contract. Nothing was signed.')
  if (td.primaryType !== 'PermitWitnessTransferFrom') throw new SwapError('bad_quote', 'Unexpected signing request. Nothing was signed.')
  if (!Array.isArray(td.types?.EIP712Domain)) throw new SwapError('bad_quote', 'Unexpected signing request. Nothing was signed.')
}

/** Refuse to sign a quote that does not match what the user asked for. */
export function checkQuote(q: Quote, req: QuoteRequest, nowSeconds = Math.floor(Date.now() / 1000)): void {
  if (!q || typeof q.id !== 'string' || !q.typedData) throw new SwapError('bad_quote', 'Circle returned an incomplete quote. Try again.')
  if (q.from?.currency !== req.from || q.to?.currency !== req.to) throw new SwapError('bad_quote', 'The quote does not match the tokens you chose. Nothing was signed.')
  const fromUnits = toUnits(q.from.amount, 6)
  const toUnitsAmt = toUnits(q.to.amount, 6)
  if (fromUnits !== toUnits(req.amount, 6)) throw new SwapError('bad_quote', 'The quote amount does not match what you entered. Nothing was signed.')
  if (!(toUnitsAmt > 0n)) throw new SwapError('bad_quote', 'Circle returned an empty quote. Try again.')
  if (q.expiresAt && Date.parse(q.expiresAt) / 1000 <= nowSeconds) throw new SwapError('expired', 'This quote has expired. Getting a new one…')
  checkDomain(q.typedData)
  const m = q.typedData.message
  const tokenFrom = ARC.tokens[req.from]
  const tokenTo = ARC.tokens[req.to]
  if (lc(m.permitted?.token) !== lc(tokenFrom)) throw new SwapError('bad_quote', 'The quote would move a different token than the one you chose. Nothing was signed.')
  if (Number(m.deadline) <= nowSeconds) throw new SwapError('expired', 'This quote has expired. Getting a new one…')
  const c = (m.witness as { consideration?: Record<string, unknown>; recipient?: string }).consideration
  const recipient = (m.witness as { recipient?: string }).recipient
  if (!c || lc(c.quote) !== lc(tokenFrom) || lc(c.base) !== lc(tokenTo)) throw new SwapError('bad_quote', 'The quote tokens do not match your choice. Nothing was signed.')
  if (!sameAmount(c.quoteAmount as string, fromUnits) || !sameAmount(c.baseAmount as string, toUnitsAmt)) throw new SwapError('bad_quote', 'The quote amounts do not match. Nothing was signed.')
  if (lc(recipient) !== lc(req.address)) throw new SwapError('bad_quote', 'The quote would pay a different wallet. Nothing was signed.')
}

/** Same idea for the funding signature: it may only move the input token, for the quoted amount. */
export function checkFunding(fp: FundingPresign, q: Quote, contractTradeId: string, nowSeconds = Math.floor(Date.now() / 1000)): void {
  if (!fp?.typedData) throw new SwapError('bad_funding', 'Circle returned incomplete funding data. Nothing was signed.')
  checkDomain(fp.typedData)
  const m = fp.typedData.message
  if (lc(m.permitted?.token) !== lc(ARC.tokens[q.from.currency as SwapToken])) throw new SwapError('bad_funding', 'The funding request would move a different token. Nothing was signed.')
  const amount = BigInt(m.permitted.amount)
  if (amount > toUnits(q.from.amount, 6)) throw new SwapError('bad_funding', 'The funding request is for more than the quoted amount. Nothing was signed.')
  if (String((m.witness as { id?: unknown }).id) !== String(contractTradeId)) throw new SwapError('bad_funding', 'The funding request is for a different trade. Nothing was signed.')
  if (Number(m.deadline) <= nowSeconds) throw new SwapError('expired', 'The funding window has passed. Please start again.')
}

/**
 * How much the Permit2 contract needs to be allowed to pull. Circle's signing steps can each use Permit2: one for the
 * trade (the amount in the quote's signing data) and one for the funding (the quoted amount). Approving both means the
 * trade cannot get stuck half way; the exact figure is shown to the user before they approve.
 */
export function requiredAllowance(q: Quote): bigint {
  return toUnits(q.from.amount, 6) + BigInt(q.typedData.message.permitted.amount)
}

export type SwapStatus = 'pending' | 'confirmed' | 'failed'
export function mapTradeStatus(status: string): SwapStatus {
  if (status === 'complete' || status === 'confirmed') return 'confirmed'
  if (status === 'refunded' || status === 'breached' || status === 'breaching') return 'failed'
  return 'pending'
}

export const formatAmount = (units: bigint): string => fromUnits(units, 6, 6)

// ── Permit2 on Arc Testnet: confirm it is the real contract before any approval ──
const PERMIT2_DOMAIN_ABI = parseAbi(['function DOMAIN_SEPARATOR() view returns (bytes32)'])
const EXPECTED_SEPARATOR = (): `0x${string}` => {
  const typeHash = keccak256(toBytes('EIP712Domain(string name,uint256 chainId,address verifyingContract)'))
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, bytes32, uint256, address'), [typeHash, keccak256(toBytes('Permit2')), BigInt(ARC.chainId), ARC.contracts.permit2 as `0x${string}`]),
  )
}
let permit2Verified: boolean | null = null

export async function verifyPermit2(): Promise<boolean> {
  if (permit2Verified !== null) return permit2Verified
  try {
    const data = encodeFunctionData({ abi: PERMIT2_DOMAIN_ABI, functionName: 'DOMAIN_SEPARATOR' })
    const result = await ethCall(ARC.rpcUrl, ARC.contracts.permit2, data)
    if (result.length < 66) { permit2Verified = false; return false }
    const onchain = decodeFunctionResult({ abi: PERMIT2_DOMAIN_ABI, functionName: 'DOMAIN_SEPARATOR', data: result as `0x${string}` })
    permit2Verified = onchain.toLowerCase() === EXPECTED_SEPARATOR().toLowerCase()
  } catch {
    return false // network problem: do not cache, try again next time
  }
  return permit2Verified
}

// ── Swap history, saved per wallet address ──
export interface SwapRecord {
  id: string
  tokenIn: SwapToken | 'cirBTC'
  tokenOut: SwapToken | 'cirBTC'
  amountIn: string
  amountOut: string
  status: SwapStatus
  /** Last step reached, shown while the swap is in progress. */
  stage: 'approving' | 'signing' | 'trading' | 'funding' | 'settling' | 'done'
  tradeId?: string
  contractTradeId?: string
  approveTx?: string
  settlementTx?: string
  error?: string
  timestamp: number
  /** Which swap route produced this record. Records from before App Kit have none (StableFX). */
  route?: 'appkit' | 'stablefx'
}

const historyKey = (wallet: string) => `arclance_swaps_${wallet.toLowerCase()}`

export function loadSwapRecords(wallet: string): SwapRecord[] {
  if (!wallet) return []
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(historyKey(wallet)) || '[]')
    return Array.isArray(parsed) ? (parsed as SwapRecord[]) : []
  } catch {
    return []
  }
}

export function saveSwapRecord(wallet: string, record: SwapRecord): void {
  const list = loadSwapRecords(wallet).filter((r) => r.id !== record.id)
  list.unshift(record)
  try {
    localStorage.setItem(historyKey(wallet), JSON.stringify(list.slice(0, 50)))
  } catch {
    // history is a convenience; a full or blocked storage must never stop a swap
  }
}
