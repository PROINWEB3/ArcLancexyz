/**
 * Single source of truth for every chain ID, RPC URL, explorer URL, token address and
 * contract address used by ArcLance. TESTNET ONLY: there is no mainnet entry and no network switch.
 *
 * Sources:
 *  - Arc addresses: docs.arc.io/arc/references/contract-addresses
 *  - CCTP V2 contracts and domains: developers.circle.com/cctp/references/contract-addresses
 *  - USDC per testnet: developers.circle.com/stablecoins/usdc-contract-addresses
 *  - Every RPC below was checked live: eth_chainId matches, and the USDC, TokenMessengerV2 and
 *    MessageTransmitterV2 addresses have contract code on that chain.
 *
 * Every env value is optional. Empty or malformed values fall back to "not configured" and never throw.
 */

export type TokenSymbol = 'USDC' | 'EURC' | 'cirBTC'

/** The only tokens ArcLance supports. */
export const TOKEN_SYMBOLS: readonly TokenSymbol[] = ['USDC', 'EURC', 'cirBTC']

export interface ArcConfig {
  name: string
  chainId: number
  /** Hex chain ID exactly as sent to wallet_addEthereumChain / wallet_switchEthereumChain. */
  chainIdHex: string
  rpcUrl: string
  explorerUrl: string
  /** Secondary block explorer (activity feed and receipts). */
  altExplorerUrl: string
  faucetUrl: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  /** Circle CCTP domain of Arc. */
  cctpDomain: number
  /** ERC-20 interface addresses. USDC is the native gas asset: one balance, read once through ERC-20. */
  tokens: Record<TokenSymbol, string>
  /** Decimals of the ERC-20 interface (the native gas side of USDC uses 18 and is never read directly). */
  tokenDecimals: Record<TokenSymbol, number>
  contracts: {
    /** StableFX FxEscrow (docs.arc.io). */
    fxEscrow: string
    /** Permit2 (docs.arc.io). Required by StableFX. */
    permit2: string
    cctpTokenMessengerV2: string
    cctpMessageTransmitterV2: string
  }
  /** How each address was checked. Treat anything other than "docs" as unverified. */
  verification: Record<string, 'docs' | 'unverified'>
}

export const ARC: ArcConfig = {
  name: 'Arc Testnet',
  chainId: 5042002,
  chainIdHex: '0x4CEF52',
  rpcUrl: 'https://rpc.testnet.arc.io',
  explorerUrl: 'https://explorer.testnet.arc.io',
  altExplorerUrl: 'https://testnet.arcscan.app',
  faucetUrl: 'https://faucet.circle.com',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  cctpDomain: 26,
  tokens: {
    USDC: '0x3600000000000000000000000000000000000000',
    EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    // cirBTC uses 8 decimals (docs.arc.io and developers.circle.com/assets/cirbtc-contract-addresses)
    cirBTC: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
  },
  tokenDecimals: { USDC: 6, EURC: 6, cirBTC: 8 },
  contracts: {
    fxEscrow: '0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    cctpTokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    cctpMessageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  verification: {
    USDC: 'docs',
    EURC: 'docs',
    cirBTC: 'docs',
    fxEscrow: 'docs',
    permit2: 'docs',
    cctpTokenMessengerV2: 'docs',
    cctpMessageTransmitterV2: 'docs',
  },
}

/** Circle Iris attestation API (sandbox, matches testnet). */
export const IRIS_API_URL = 'https://iris-api-sandbox.circle.com'

// ── CCTP V2 bridge networks (all testnets, all confirmed by the Circle CCTP docs) ─────────────

export interface BridgeChain {
  key: string
  name: string
  chainId: number
  chainIdHex: string
  rpcUrl: string
  explorerUrl: string
  /** Native USDC on this chain (Circle docs). */
  usdc: string
  /** EURC on this chain. Only set where Circle's CCTP for non-USDC registry lists EURC and the docs confirm the contract. */
  eurc?: string
  usdcDecimals: number
  cctpDomain: number
  tokenMessengerV2: string
  messageTransmitterV2: string
  /** Gas token the user needs on this chain to send or mint. */
  nativeCurrency: { name: string; symbol: string; decimals: number }
  /** Average standard-transfer attestation time when this chain is the source (Circle docs). */
  attestationTime: string
  /** True when the docs say attestation can take hours. */
  slowSource?: boolean
  isArc?: boolean
}

const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'
const MESSAGE_TRANSMITTER_V2 = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'

function chain(
  key: string,
  name: string,
  chainId: number,
  rpcUrl: string,
  explorerUrl: string,
  usdc: string,
  cctpDomain: number,
  native: { name: string; symbol: string },
  attestationTime: string,
  extra: { slowSource?: boolean } = {},
): BridgeChain {
  return {
    key,
    name,
    chainId,
    chainIdHex: '0x' + chainId.toString(16),
    rpcUrl,
    explorerUrl,
    usdc,
    usdcDecimals: 6,
    cctpDomain,
    tokenMessengerV2: TOKEN_MESSENGER_V2,
    messageTransmitterV2: MESSAGE_TRANSMITTER_V2,
    nativeCurrency: { ...native, decimals: 18 },
    attestationTime,
    ...extra,
  }
}

export const BRIDGE_CHAINS: BridgeChain[] = [
  {
    key: 'arc',
    name: ARC.name,
    chainId: ARC.chainId,
    chainIdHex: ARC.chainIdHex,
    rpcUrl: ARC.rpcUrl,
    explorerUrl: ARC.explorerUrl,
    usdc: ARC.tokens.USDC,
    usdcDecimals: 6,
    cctpDomain: ARC.cctpDomain,
    tokenMessengerV2: ARC.contracts.cctpTokenMessengerV2,
    messageTransmitterV2: ARC.contracts.cctpMessageTransmitterV2,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    attestationTime: 'under 1 minute',
    isArc: true,
  },
  chain('sepolia', 'Ethereum Sepolia', 11155111, 'https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.etherscan.io', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 0, { name: 'Ether', symbol: 'ETH' }, '15 to 19 minutes'),
  chain('baseSepolia', 'Base Sepolia', 84532, 'https://sepolia.base.org', 'https://sepolia.basescan.org', '0x036CbD53842c5426634e7929541eC2318f3dCF7e', 6, { name: 'Ether', symbol: 'ETH' }, '15 to 19 minutes'),
  chain('arbitrumSepolia', 'Arbitrum Sepolia', 421614, 'https://sepolia-rollup.arbitrum.io/rpc', 'https://sepolia.arbiscan.io', '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', 3, { name: 'Ether', symbol: 'ETH' }, '15 to 19 minutes'),
  chain('opSepolia', 'OP Sepolia', 11155420, 'https://sepolia.optimism.io', 'https://sepolia-optimism.etherscan.io', '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', 2, { name: 'Ether', symbol: 'ETH' }, '15 to 19 minutes'),
  chain('polygonAmoy', 'Polygon Amoy', 80002, 'https://polygon-amoy.drpc.org', 'https://amoy.polygonscan.com', '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', 7, { name: 'POL', symbol: 'POL' }, 'about 8 seconds'),
  chain('avalancheFuji', 'Avalanche Fuji', 43113, 'https://api.avax-test.network/ext/bc/C/rpc', 'https://testnet.snowtrace.io', '0x5425890298aed601595a70AB815c96711a31Bc65', 1, { name: 'Avalanche', symbol: 'AVAX' }, 'about 8 seconds'),
  chain('unichainSepolia', 'Unichain Sepolia', 1301, 'https://sepolia.unichain.org', 'https://unichain-sepolia.blockscout.com', '0x31d0220469e10c4E71834a79b1f276d740d3768F', 10, { name: 'Ether', symbol: 'ETH' }, '15 to 19 minutes'),
  chain('monadTestnet', 'Monad Testnet', 10143, 'https://testnet-rpc.monad.xyz', 'https://testnet.monadexplorer.com', '0x534b2f3A21130d7a60830c2Df862319e593943A3', 15, { name: 'Monad', symbol: 'MON' }, 'about 5 seconds'),
  chain('lineaSepolia', 'Linea Sepolia', 59141, 'https://rpc.sepolia.linea.build', 'https://sepolia.lineascan.build', '0xFEce4462D57bD51A6A552365A011b95f0E16d9B7', 11, { name: 'Ether', symbol: 'ETH' }, '6 to 32 hours', { slowSource: true }),
  chain('sonicTestnet', 'Sonic Testnet', 14601, 'https://rpc.testnet.soniclabs.com', 'https://testnet.sonicscan.org', '0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51', 13, { name: 'Sonic', symbol: 'S' }, 'about 8 seconds'),
  chain('worldchainSepolia', 'World Chain Sepolia', 4801, 'https://worldchain-sepolia.g.alchemy.com/public', 'https://sepolia.worldscan.org', '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88', 14, { name: 'Ether', symbol: 'ETH' }, '15 to 19 minutes'),
]

// ── EURC bridging: Circle "CCTP for non-USDC" (sandbox) ──────────────────────────────────────
// Source: developers.circle.com/cctp/expanded-assets/references/contract-addresses (CrossChainTokenService, testnet)
// and the Iris sandbox registry GET /v2/cctpx/tokens?tokenid=<EURC token ID>. The token manager and the per-chain
// EURC addresses were also checked on-chain with resolveTokenManager / resolveTokenAddress.
export const CCTPX = {
  crossChainTokenService: '0x63753E722bd2C2A5DF6EE19C5106662208B81077',
  tokenManager: '0xE5D6eacf2eD5A7F81cC89d2a216F004092c0C2E0',
  eurcTokenId: '0x2587821a0ee7daa174b95436b5dab1731cfa1844775b010217d3c0dd02a4eecd',
} as const

/**
 * Networks where the Circle docs and registry confirm a EURC deployment AND the CrossChainTokenService address.
 * World Chain Sepolia is in the Iris registry but its service address is not in the docs, so it is left out.
 * Not listed for EURC at all: Arbitrum, OP, Polygon Amoy, Unichain, Monad, Linea, Sonic.
 */
const EURC_BY_CHAIN: Record<string, string> = {
  arc: ARC.tokens.EURC,
  sepolia: '0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4',
  baseSepolia: '0x808456652fdb597867f38412077A9182bf77359F',
  avalancheFuji: '0x5E44db7996c682E92a960b65AC713a54AD815c6B',
}
for (const c of BRIDGE_CHAINS) {
  const eurc = EURC_BY_CHAIN[c.key]
  if (eurc) c.eurc = eurc
}

export type BridgeToken = 'USDC' | 'EURC'
export const BRIDGE_TOKENS: readonly BridgeToken[] = ['USDC', 'EURC']

export function bridgeTokenAddress(c: BridgeChain, token: BridgeToken): string {
  return token === 'EURC' ? (c.eurc ?? '') : c.usdc
}

/** Whether a token can move between two bridge networks, with a one-line reason when it cannot. */
export function tokenRouteSupport(token: BridgeToken, fromKey: string, toKey: string): { ok: boolean; reason: string } {
  if (token === 'USDC') return { ok: true, reason: '' }
  const from = BRIDGE_CHAINS.find((c) => c.key === fromKey)
  const to = BRIDGE_CHAINS.find((c) => c.key === toKey)
  if (from?.eurc && to?.eurc) return { ok: true, reason: '' }
  const names = BRIDGE_CHAINS.filter((c) => c.eurc).map((c) => c.name).join(', ')
  return { ok: false, reason: `EURC only moves between ${names}.` }
}

export function getBridgeChain(key: string): BridgeChain | undefined {
  return BRIDGE_CHAINS.find((c) => c.key === key)
}

/** Peer chains whose USDC balance is shown next to Arc on the Dashboard. */
export const PEER_CHAINS: BridgeChain[] = BRIDGE_CHAINS.filter((c) => c.key === 'sepolia' || c.key === 'baseSepolia')

// ── Optional contracts (not deployed yet) ─────────────────────────────────────────────────────

function readEnv(name: string): string {
  try {
    const value = (import.meta.env as Record<string, string | undefined>)[name]
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

function readAddress(name: string): string {
  const value = readEnv(name)
  return /^0x[0-9a-fA-F]{40}$/.test(value) ? value : ''
}

/**
 * Optional Circle App Kit key (VITE_CIRCLE_KIT_KEY). Empty string when not set.
 * Nothing in the app needs it right now; when a feature does, check CIRCLE_KIT_KEY_CONFIGURED
 * and show "not configured" instead of calling the SDK with an empty key.
 */
export const CIRCLE_KIT_KEY: string = readEnv('VITE_CIRCLE_KIT_KEY')
export const CIRCLE_KIT_KEY_CONFIGURED: boolean = CIRCLE_KIT_KEY.length > 0
export const KIT_KEY_NOT_CONFIGURED_MESSAGE = 'Not configured: set VITE_CIRCLE_KIT_KEY to enable this feature.'

/** Milestone escrow contract on Arc Testnet. Empty until you set VITE_ESCROW_ADDRESS. */
export const ESCROW_ADDRESS: string = readAddress('VITE_ESCROW_ADDRESS')

/** P2P (USDC to local currency) escrow contract on Arc Testnet. Empty until you set VITE_P2P_ADDRESS. */
export const P2P_ADDRESS: string = readAddress('VITE_P2P_ADDRESS')

export const NOT_DEPLOYED_MESSAGE = 'Contract not deployed on this network'

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────

/** Explorer transaction URL on the primary Arc explorer. */
export const arcTxUrl = (hash: string): string => `${ARC.explorerUrl}/tx/${hash}`

/** Explorer transaction URL on the secondary Arc explorer. */
export const arcAltTxUrl = (hash: string): string => `${ARC.altExplorerUrl}/tx/${hash}`

/** Explorer transaction URL on any bridge chain. */
export const chainTxUrl = (c: BridgeChain, hash: string): string => `${c.isArc ? ARC.altExplorerUrl : c.explorerUrl}/tx/${hash}`
