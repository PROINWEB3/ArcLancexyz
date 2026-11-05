// ABI for contracts/UsernameRegistry.sol.
import { parseAbi } from 'viem'

export const USERNAME_REGISTRY_ABI = parseAbi([
  'function register(string name) external',
  'function release() external',
  'function resolve(string name) external view returns (address)',
  'function nameOf(address account) external view returns (string)',
  'function isReserved(string name) external view returns (bool)',
  'event NameRegistered(address indexed owner, string name)',
  'event NameReleased(address indexed owner, string name)',
  'error InvalidName()',
  'error NameReserved()',
  'error NameTaken()',
  'error AlreadyHasName()',
  'error NoNameRegistered()',
])
