import { decodeFunctionResult, encodeFunctionData, parseAbi, type Abi } from 'viem'
import { ARC } from '../config/chain-config'
import { ethCall, rpcCall } from './evm'

/** Read a view function through Arc's public RPC (does not depend on the wallet's network). */
export async function readContract(address: string, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<unknown> {
  const data = encodeFunctionData({ abi, functionName, args })
  const result = await ethCall(ARC.rpcUrl, address, data)
  if (result === '0x') throw new Error(`No data returned by ${functionName}. Is the contract deployed at this address?`)
  return decodeFunctionResult({ abi, functionName, data: result as `0x${string}` })
}

export function encodeCall(abi: Abi, functionName: string, args: readonly unknown[] = []): `0x${string}` {
  return encodeFunctionData({ abi, functionName, args })
}

/** True when the address has contract code on Arc Testnet. */
export async function hasCode(address: string): Promise<boolean> {
  const code = await rpcCall(ARC.rpcUrl, 'eth_getCode', [address, 'latest'])
  return typeof code === 'string' && code.length > 4
}

const ERC20_READ_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
])

export async function readErc20Allowance(token: string, owner: string, spender: string): Promise<bigint> {
  return (await readContract(token, ERC20_READ_ABI, 'allowance', [owner, spender])) as bigint
}
