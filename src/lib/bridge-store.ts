/** Bridge history saved per wallet address, so unfinished transfers can be resumed after a refresh. */

export type BridgeStage = 'approve' | 'burn' | 'attestation' | 'mint' | 'complete' | 'failed'

export interface BridgeRecord {
  id: string
  from: string
  to: string
  amount: string
  /** Token bridged. Older records have no value and are USDC. */
  token?: 'USDC' | 'EURC'
  sender: string
  recipient: string
  stage: BridgeStage
  approveTx?: string
  burnTx?: string
  mintTx?: string
  /** Saved once Circle has signed the burn, so the mint can be finished after a refresh. */
  message?: string
  attestation?: string
  eventNonce?: string
  error?: string
  createdAt: number
  updatedAt: number
}

const key = (wallet: string) => `arclance_bridge_history_${wallet.toLowerCase()}`

export function loadBridgeHistory(wallet: string): BridgeRecord[] {
  if (!wallet) return []
  try {
    const raw = localStorage.getItem(key(wallet))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as BridgeRecord[]) : []
  } catch {
    return []
  }
}

export function saveBridgeRecord(wallet: string, record: BridgeRecord): void {
  const list = loadBridgeHistory(wallet).filter((r) => r.id !== record.id)
  list.unshift({ ...record, updatedAt: Date.now() })
  try {
    localStorage.setItem(key(wallet), JSON.stringify(list.slice(0, 50)))
  } catch {
    // storage full or blocked: history is a convenience, never block the transfer
  }
}

export const isUnfinished = (r: BridgeRecord): boolean => r.stage !== 'complete' && r.stage !== 'failed' && !!r.burnTx
