// Circle App Kit swap, run from the browser with the user's own wallet (EIP-1193).
// The SDK is loaded on demand so it never weighs on pages that do not swap.
//
// No key is used anywhere in here: browser swaps run keyless (the SDK itself refuses an API key in a browser), and
// the swap service allows browser origins. Allowance (permit, falling back to approve) is handled by the SDK.
import type { Eip1193Provider } from './evm'
import {
  AK_CHAIN, AK_DEFAULT_SLIPPAGE_BPS, sdkSymbol, summarizeEstimate, summarizeResult,
  type AkEstimate, type AkResult, type AkToken,
} from './appkit-swap'

export interface AkSwapRequest {
  tokenIn: AkToken
  tokenOut: AkToken
  /** Normalised amount string such as "1.00" (see normalizeAmountIn). */
  amount: string
  slippageBps?: number
}

interface KitBundle {
  kit: { estimateSwap: (p: never) => Promise<unknown>; swap: (p: never) => Promise<unknown> }
  adapter: unknown
}

let cached: { provider: Eip1193Provider; bundle: KitBundle } | null = null

async function load(provider: Eip1193Provider): Promise<KitBundle> {
  if (cached && cached.provider === provider) return cached.bundle
  const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
    import('@circle-fin/app-kit'),
    import('@circle-fin/adapter-viem-v2'),
  ])
  const adapter = await createViemAdapterFromProvider({ provider: provider as never })
  const bundle: KitBundle = { kit: new AppKit(), adapter }
  cached = { provider, bundle }
  return bundle
}

function params(b: KitBundle, r: AkSwapRequest): never {
  return {
    from: { adapter: b.adapter, chain: AK_CHAIN },
    tokenIn: sdkSymbol(r.tokenIn),
    tokenOut: sdkSymbol(r.tokenOut),
    amountIn: r.amount,
    config: { slippageBps: r.slippageBps ?? AK_DEFAULT_SLIPPAGE_BPS },
  } as never
}

/** A real estimate from the SDK for the connected wallet. Nothing is sent. */
export async function estimateWithAppKit(provider: Eip1193Provider, r: AkSwapRequest): Promise<AkEstimate> {
  const b = await load(provider)
  return summarizeEstimate(await b.kit.estimateSwap(params(b, r)), r.tokenIn, r.tokenOut)
}

/** Runs the swap: the wallet is asked to sign (permit or approve) and to send the swap transaction. */
export async function swapWithAppKit(provider: Eip1193Provider, r: AkSwapRequest): Promise<AkResult> {
  const b = await load(provider)
  return summarizeResult(await b.kit.swap(params(b, r)))
}
