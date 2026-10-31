import { formatUnits, parseUnits } from 'viem'

/** Minimal EIP-1193 provider shape used by the wallet. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

export interface WalletChainParams {
  chainIdHex: string
  name: string
  rpcUrl: string
  explorerUrl: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
}

interface JsonRpcResponse {
  result?: unknown
  error?: { message?: string }
}

/** JSON-RPC call straight to a public RPC, independent of the wallet's own network settings. */
export async function rpcCall(url: string, method: string, params: unknown[], timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: ctrl.signal,
    })
    const json = (await resp.json()) as JsonRpcResponse
    if (json.error) throw new Error(json.error.message || 'RPC error')
    return json.result
  } finally {
    clearTimeout(timer)
  }
}

export async function ethCall(url: string, to: string, data: string, from?: string): Promise<string> {
  const tx: Record<string, string> = { to, data }
  if (from) tx.from = from
  const result = await rpcCall(url, 'eth_call', [tx, 'latest'])
  return typeof result === 'string' ? result : '0x'
}

export interface ReceiptInfo {
  status: 'success' | 'reverted'
  blockNumber: number
}

/** Poll a public RPC until the transaction is mined. Resolves null on timeout. */
export async function waitForReceipt(rpcUrl: string, hash: string, timeoutMs = 180000): Promise<ReceiptInfo | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = (await rpcCall(rpcUrl, 'eth_getTransactionReceipt', [hash])) as { status?: string; blockNumber?: string } | null
      if (receipt && receipt.blockNumber) {
        return { status: receipt.status === '0x1' ? 'success' : 'reverted', blockNumber: parseInt(receipt.blockNumber, 16) }
      }
    } catch {
      // keep polling: a transient RPC error must not fail a transaction that may already be mined
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return null
}

/** Timestamp (ms) of a block, from a public RPC. Resolves null when the block cannot be read. */
export async function getBlockTimestampMs(rpcUrl: string, blockNumber: number): Promise<number | null> {
  try {
    const block = (await rpcCall(rpcUrl, 'eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false])) as { timestamp?: string } | null
    return block && block.timestamp ? parseInt(block.timestamp, 16) * 1000 : null
  } catch {
    return null
  }
}

/** Switch the wallet to a chain, adding it first when the wallet does not know it. */
export async function switchWalletChain(provider: Eip1193Provider, chain: WalletChainParams): Promise<void> {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chain.chainIdHex }] })
  } catch (err) {
    const code = (err as { code?: number }).code
    if (code === 4902 || code === -32603 || code === undefined) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chain.chainIdHex,
          chainName: chain.name,
          rpcUrls: [chain.rpcUrl],
          nativeCurrency: chain.nativeCurrency,
          blockExplorerUrls: [chain.explorerUrl],
        }],
      })
      return
    }
    throw err
  }
}

export async function walletChainId(provider: Eip1193Provider): Promise<string> {
  const id = await provider.request({ method: 'eth_chainId' })
  return typeof id === 'string' ? id.toLowerCase() : ''
}

/** Decimal string to base units without floating point. */
export function toUnits(amount: string, decimals: number): bigint {
  const clean = amount.trim()
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') return 0n
  const [whole, frac = ''] = clean.split('.')
  return parseUnits(`${whole || '0'}.${frac.slice(0, decimals)}`, decimals)
}

export function fromUnits(value: bigint, decimals: number, maxDigits = 6): string {
  const full = formatUnits(value, decimals)
  const [whole, frac = ''] = full.split('.')
  const trimmed = frac.slice(0, maxDigits).replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole
}

export function shortAddress(address: string): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''
}

export function errorMessage(err: unknown): string {
  const e = err as { code?: number; message?: string; shortMessage?: string }
  const text = (e && (e.shortMessage || e.message)) || ''
  if (e && (e.code === 4001 || (e.code === -32603 && /reject|denied/i.test(text)) || /user (rejected|denied)|rejected the request/i.test(text))) return 'You rejected the request in your wallet. Nothing was sent.'
  if (/insufficient funds|exceeds (the )?balance|gas required exceeds/i.test(text)) return 'Not enough gas. Get test USDC on the Faucet page and try again.'
  if (/transfer amount exceeds balance|insufficient balance/i.test(text)) return 'Your balance is too low for this amount.'
  if (/exceeds allowance|insufficient allowance/i.test(text)) return 'The token approval is missing or too small. Approve it first, then try again.'
  if (/network request failed|failed to fetch|fetch failed/i.test(text)) return 'Network problem. Check your connection and try again.'
  return text || 'Something went wrong.'
}
