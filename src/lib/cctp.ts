import { decodeFunctionResult, encodeFunctionData, pad, parseAbi } from 'viem'
import { CCTPX, IRIS_API_URL, bridgeTokenAddress, type BridgeChain, type BridgeToken } from '../config/chain-config'
import { ethCall } from './evm'

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])

/** CCTP V2 TokenMessengerV2.depositForBurn takes exactly these 7 parameters. */
const TOKEN_MESSENGER_ABI = parseAbi([
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
])

const MESSAGE_TRANSMITTER_ABI = parseAbi([
  'function receiveMessage(bytes message, bytes attestation) returns (bool success)',
  'function usedNonces(bytes32 nonce) view returns (uint256)',
])

/** Standard transfer: waits for full finality, charges no fast-transfer fee. */
export const STANDARD_FINALITY_THRESHOLD = 2000

const ZERO_BYTES32 = ('0x' + '00'.repeat(32)) as `0x${string}`

export const addressToBytes32 = (address: string): `0x${string}` => pad(address as `0x${string}`, { size: 32 })

export function encodeApprove(spender: string, amount: bigint): `0x${string}` {
  return encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender as `0x${string}`, amount] })
}

export interface BurnParams {
  amount: bigint
  destinationDomain: number
  recipient: string
  burnToken: string
  maxFee: bigint
}

/** The 7-parameter CCTP V2 burn call. destinationCaller is zero so anyone can relay the mint. */
export function encodeDepositForBurn(p: BurnParams): `0x${string}` {
  return encodeFunctionData({
    abi: TOKEN_MESSENGER_ABI,
    functionName: 'depositForBurn',
    args: [p.amount, p.destinationDomain, addressToBytes32(p.recipient), p.burnToken as `0x${string}`, ZERO_BYTES32, p.maxFee, STANDARD_FINALITY_THRESHOLD],
  })
}

export function encodeReceiveMessage(message: string, attestation: string): `0x${string}` {
  return encodeFunctionData({ abi: MESSAGE_TRANSMITTER_ABI, functionName: 'receiveMessage', args: [message as `0x${string}`, attestation as `0x${string}`] })
}

/** Address that must be approved before bridging: TokenMessengerV2 for USDC, the EURC TokenManager for EURC. */
export function spenderFor(chain: BridgeChain, token: BridgeToken = 'USDC'): string {
  return token === 'EURC' ? CCTPX.tokenManager : chain.tokenMessengerV2
}

export async function readBalance(chain: BridgeChain, owner: string, token: BridgeToken = 'USDC'): Promise<bigint> {
  const address = bridgeTokenAddress(chain, token)
  if (!address) throw new Error(`${token} is not available on ${chain.name}`)
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [owner as `0x${string}`] })
  const result = await ethCall(chain.rpcUrl, address, data)
  if (result.length < 66) throw new Error('Empty balance response')
  return decodeFunctionResult({ abi: ERC20_ABI, functionName: 'balanceOf', data: result as `0x${string}` })
}

export async function readAllowance(chain: BridgeChain, owner: string, token: BridgeToken = 'USDC'): Promise<bigint> {
  const address = bridgeTokenAddress(chain, token)
  if (!address) throw new Error(`${token} is not available on ${chain.name}`)
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'allowance', args: [owner as `0x${string}`, spenderFor(chain, token) as `0x${string}`] })
  const result = await ethCall(chain.rpcUrl, address, data)
  if (result.length < 66) throw new Error('Empty allowance response')
  return decodeFunctionResult({ abi: ERC20_ABI, functionName: 'allowance', data: result as `0x${string}` })
}

/**
 * EURC uses Circle's "CCTP for non-USDC": CrossChainTokenService.crossChainTransfer burns on the source network
 * and the mint on the destination is the same MessageTransmitterV2.receiveMessage call as USDC.
 */
const CCTPX_ABI = parseAbi([
  'function crossChainTransfer(bytes32 tokenId, uint256 amount, uint32 destinationDomain, bytes destinationAddress, bytes32 destinationCaller, uint32 minFinalityThreshold, (bytes signedQuote, address refundAddress) claim, bool autoExecuteHookData, bytes hookData) payable',
])

export interface CctpxQuote {
  signedQuote: string
  /** Fee in the source network's native gas token, in wei (18 decimals). Sent as the transaction value. */
  feeTotalAmount: bigint
}

/** Signed fee quote from Circle's Iris API for a standard (finalized) EURC transfer. */
export async function getCctpxQuote(srcDomain: number, dstDomain: number, amount: bigint): Promise<CctpxQuote> {
  const resp = await fetch(`${IRIS_API_URL}/v2/quote/cctpx/${CCTPX.eurcTokenId}/${srcDomain}/${dstDomain}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amount.toString(), feeToken: ZERO_ADDRESS, requests: [] }),
  })
  const json = (await resp.json().catch(() => ({}))) as { signedQuote?: string; feeTotalAmount?: string | number; error?: string; errorCode?: string }
  if (!resp.ok || !json.signedQuote) {
    if (json.errorCode === 'TOKEN_NOT_SUPPORTED_ON_ROUTE') throw new Error('Circle does not support EURC on this route.')
    throw new Error(json.error || `EURC fee quote failed (${resp.status})`)
  }
  return { signedQuote: json.signedQuote, feeTotalAmount: BigInt(json.feeTotalAmount ?? 0) }
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export interface CctpxTransferParams {
  amount: bigint
  destinationDomain: number
  recipient: string
  quote: CctpxQuote
}

/** Standard (finalized) transfer: minFinalityThreshold 2000, anyone can relay the mint, no hook. */
export function encodeCctpxTransfer(p: CctpxTransferParams): `0x${string}` {
  return encodeFunctionData({
    abi: CCTPX_ABI,
    functionName: 'crossChainTransfer',
    args: [
      CCTPX.eurcTokenId as `0x${string}`,
      p.amount,
      p.destinationDomain,
      p.recipient as `0x${string}`,
      ZERO_BYTES32,
      STANDARD_FINALITY_THRESHOLD,
      { signedQuote: p.quote.signedQuote as `0x${string}`, refundAddress: ZERO_ADDRESS },
      false,
      '0x',
    ],
  })
}

/** True when the CCTP message with this event nonce was already minted on the destination chain. */
export async function isNonceUsed(chain: BridgeChain, eventNonce: string): Promise<boolean> {
  const data = encodeFunctionData({ abi: MESSAGE_TRANSMITTER_ABI, functionName: 'usedNonces', args: [eventNonce as `0x${string}`] })
  const result = await ethCall(chain.rpcUrl, chain.messageTransmitterV2, data)
  if (result.length < 66) return false
  return decodeFunctionResult({ abi: MESSAGE_TRANSMITTER_ABI, functionName: 'usedNonces', data: result as `0x${string}` }) > 0n
}

interface FeeEntry {
  finalityThreshold: number
  minimumFee: number
}

/** Standard-transfer fee in basis points, from Circle's Iris API. Throws when it cannot be read. */
export async function getStandardFeeBps(srcDomain: number, dstDomain: number): Promise<number> {
  const resp = await fetch(`${IRIS_API_URL}/v2/burn/USDC/fees/${srcDomain}/${dstDomain}`)
  if (!resp.ok) throw new Error(`Fee lookup failed (${resp.status})`)
  const entries = (await resp.json()) as FeeEntry[]
  const standard = Array.isArray(entries) ? entries.find((e) => e.finalityThreshold === STANDARD_FINALITY_THRESHOLD) : undefined
  if (!standard || typeof standard.minimumFee !== 'number') throw new Error('Fee not available for this route')
  return standard.minimumFee
}

/**
 * Smallest amount (token base units) that a burn can carry: the amount must be larger than the most the burn can cost,
 * which is the protocol fee (feeBps, rounded up) plus any fixed forwarding fee. Both come from live Circle data.
 * Returns null when the protocol fee alone is as large as the amount, so no amount works.
 */
export function minimumBridgeAmount(feeBps: number, forwardFee: bigint = 0n): bigint | null {
  const rate = BigInt(Math.ceil(Math.max(feeBps, 0) * 100)) // 1/100 of a basis point, the same rounding as maxFeeFor
  if (rate >= 1000000n) return null
  // smallest a with a > ceil(a * rate / 1e6) + forwardFee  <=>  a * (1e6 - rate) >= (forwardFee + 1) * 1e6
  const numerator = (forwardFee + 1n) * 1000000n
  const denominator = 1000000n - rate
  return (numerator + denominator - 1n) / denominator
}

export function maxFeeFor(amount: bigint, feeBps: number): bigint {
  if (feeBps <= 0) return 0n
  // round up, in 1/100 bps precision
  const scaled = BigInt(Math.ceil(feeBps * 100))
  return (amount * scaled + 999999n) / 1000000n
}

export interface Attestation {
  status: 'pending' | 'complete'
  message?: string
  attestation?: string
  eventNonce?: string
}

interface IrisMessage {
  status?: string
  message?: string
  attestation?: string
  eventNonce?: string
}

/** Look up the attestation for a burn transaction. Returns pending until Circle has signed it. */
export async function getAttestation(srcDomain: number, burnTxHash: string): Promise<Attestation> {
  const resp = await fetch(`${IRIS_API_URL}/v2/messages/${srcDomain}?transactionHash=${burnTxHash}`)
  if (resp.status === 404) return { status: 'pending' }
  if (!resp.ok) throw new Error(`Attestation lookup failed (${resp.status})`)
  const json = (await resp.json()) as { messages?: IrisMessage[] }
  const m = json.messages && json.messages[0]
  if (!m || m.status !== 'complete' || !m.attestation || m.attestation === 'PENDING' || !m.message) return { status: 'pending' }
  return { status: 'complete', message: m.message, attestation: m.attestation, eventNonce: m.eventNonce }
}
