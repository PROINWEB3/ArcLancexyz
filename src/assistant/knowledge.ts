/**
 * Built-in knowledge base for the ArcLance assistant. Used when no AI service is configured, and as the safety net
 * when the service is unreachable. Pure function: no network, no wallet access, nothing invented.
 *
 * Rules the answers follow:
 *  - never ask for or accept private keys or seed phrases
 *  - addresses, balances and rates only come from the context passed in (real app state), never typed here
 *  - everything is Arc Testnet: no real money
 */

import type { Lang } from './language'
import { UR } from './lang-ur'
import { HI } from './lang-hi'
import { BN } from './lang-bn'
import { PCM } from './lang-pcm'
import type { LangPack } from './pack'

/** Answers in the other supported languages. English lives in TOPICS below. */
const PACKS: Partial<Record<Lang, LangPack>> = { ur: UR, hi: HI, bn: BN, pcm: PCM }

export interface AssistantContext {
  connected: boolean
  /** Real balances read by the app, or null when not available. */
  balances: { USDC: number | null; EURC: number | null; cirBTC: number | null } | null
  addresses: { usdc: string; eurc: string; escrow: string; p2p: string }
  explorerUrl: string
  faucetUrl: string
  chainId: number
  /** Names of the networks the Bridge offers. */
  bridgeNetworks: string[]
  eurcNetworks: string[]
}

export interface AssistantAnswer {
  text: string
  topic: string
  /** False when nothing matched and the caller may try another source. */
  matched: boolean
}

interface Topic {
  id: string
  keywords: string[]
  /** Broad topics only win when no specific topic matched (for example "usdc" inside "bridge usdc"). */
  generic?: boolean
  /** Higher wins when two topics tie. */
  weight?: number
  reply: (c: AssistantContext) => string
}

const TESTNET = 'Everything here runs on Arc Testnet. The tokens have no real value.'

const addrLine = (label: string, value: string, empty: string) => (value ? `${label}: ${value}` : `${label}: ${empty}`)

const TOPICS: Topic[] = [
  {
    id: 'secrets',
    weight: 100,
    keywords: ['private key', 'seed phrase', 'secret phrase', 'recovery phrase', 'mnemonic', 'secret key', 'keystore', 'password to my wallet', 'wallet password', 'my password'],
    reply: () =>
      '**Never share your private key or seed phrase.**\n• A **seed phrase** (12 or 24 words) is the master key to your wallet. Whoever has it can take everything in it.\n• ArcLance, Circle and every real support team will never ask for it. Anyone who asks (even in a chat that looks official) is a scammer.\n• Store it only on paper, offline, in a safe place. Do not keep it in a photo, an email or a chat.\n• Your wallet signs for you. This site only asks you to approve transactions inside your wallet.\n• Do not type it into this chat or any website.',
  },
  {
    id: 'balance',
    weight: 50,
    keywords: ['my balance', 'how much do i have', 'how much usdc do i have', 'wallet balance', 'check balance', 'my usdc', 'my eurc'],
    reply: (c) => {
      if (!c.connected) return 'Connect your wallet first (top right). Then your real balances show on the Home page. I never guess a balance.'
      const b = c.balances
      if (!b || b.USDC === null) return 'I could not read your balance right now. Open Home and press refresh, or try again in a moment.'
      return `**Your balances on Arc Testnet (read from the chain):**\n• USDC: ${b.USDC}\n• EURC: ${b.EURC ?? 'unavailable'}\n• cirBTC: ${b.cirBTC ?? 'unavailable'}\n\nOn Arc, USDC is also the gas token, so it is one balance, not two.`
    },
  },
  {
    id: 'rates',
    weight: 40,
    keywords: ['exchange rate', 'rate today', 'current rate', 'usd to pkr', 'usd to inr', 'usd to ngn', 'usd to bdt', 'dollar rate', 'price per usdc'],
    reply: () =>
      '**I do not quote currency exchange rates** (like dollars to rupees or naira). I never guess them.\n• For crypto coins I can look up live prices: ask for example "Bitcoin price" or "ETH price in USD".\n• P2P shows a reference rate for orientation only, with its source named. Each seller sets their own price.\n• Always check the final amount before you confirm.',
  },
  {
    id: 'start',
    weight: 5,
    keywords: ['get started', 'how do i start', 'getting started', 'first steps', 'new here', 'how to use', 'what can i do'],
    reply: (c) =>
      `**Getting started in 4 steps:**\n1. Install a wallet (MetaMask, Rabby or OKX) and press **Connect Wallet**. Approve the switch to Arc Testnet.\n2. Open **Faucet** and claim free test USDC at ${c.faucetUrl}.\n3. Try **Send**, **Swap**, **Bridge**, **Invoices**, **Pay Link**, **Escrow** or **P2P** from the sidebar.\n4. Check **History** (on Payments) to see what you did.\n\n**ArcLance** lets freelancers get paid in USDC or EURC with low fees. ${TESTNET}`,
  },
  {
    id: 'wallet',
    keywords: ['wallet', 'metamask', 'rabby', 'okx', 'connect', 'connection', 'disconnect', 'switch network', 'wrong network', 'add network', 'add arc'],
    reply: (c) =>
      `**Wallets and connecting:**\n• A wallet is an app (MetaMask, Rabby, OKX and others) that holds your keys and signs payments. Only you control it.\n• Press **Connect Wallet** and pick yours. ArcLance finds installed wallets automatically.\n• If the badge says wrong network, press it to switch. If the wallet does not know Arc Testnet yet, it will offer to add it (chain ID ${c.chainId}).\n• Your connection is remembered after a refresh. **Disconnect** is in the wallet menu.\n• Never share your seed phrase or private key with anyone.`,
  },
  {
    id: 'gas',
    keywords: ['gas', 'fee', 'fees', 'network fee', 'transaction fee', 'insufficient', 'out of gas', 'cost to send'],
    reply: () =>
      '**Gas on Arc, in plain words:**\n• Gas is the small fee the network charges to process your transaction.\n• On Arc the gas token is **USDC**. You do not need ETH.\n• So your USDC is both your money and your gas. It is one balance, shown once.\n• Fees are small and predictable. If a transaction says you have too little gas, claim more test USDC on the **Faucet** page.\n• On other networks in the Bridge, gas is paid in that network\'s own token (for example ETH on Sepolia).',
  },
  {
    id: 'usdc-eurc',
    generic: true,
    keywords: ['usdc', 'eurc', 'euro coin', 'cirbtc', 'what is usdc', 'what is eurc'],
    reply: (c) =>
      `**USDC and EURC:**\n• **USDC** is a dollar stablecoin from Circle. 1 USDC is meant to equal 1 US dollar.\n• **EURC** is the euro version from Circle.\n• **cirBTC** is a Bitcoin-linked test token on Arc Testnet.\n• ERC-20 balances use 6 decimals (8 for cirBTC). On Arc, USDC is also the gas token.\n• Testnet contracts: ${addrLine('USDC', c.addresses.usdc, 'not available')}, ${addrLine('EURC', c.addresses.eurc, 'not available')}.\n• ${TESTNET}`,
  },
  {
    id: 'arc',
    keywords: ['arc network', 'what is arc', 'arc chain', 'arc testnet', 'about arc', 'arc blockchain', 'finality', 'circle blockchain'],
    reply: (c) =>
      `**Arc in simple words:**\n• Arc is Circle's own **Layer-1 blockchain**, built for payments and stablecoin finance.\n• Its gas token is USDC, so fees are paid in dollars, not a volatile coin.\n• It works with the same tools as Ethereum (EVM), so normal wallets work.\n• ArcLance runs on Arc: your wallet, balances, Send, Swap, Bridge, Escrow and P2P all use Arc Testnet.\n• It is in **testnet** now (chain ID ${c.chainId}): a practice network with free test tokens.\n• Explorer: ${c.explorerUrl}\n• For dates, mainnet plans or new features, check the official docs (docs.arc.io). I do not guess.`,
  },
  {
    id: 'testnet',
    keywords: ['testnet', 'mainnet', 'real money', 'test network', 'test tokens', 'practice'],
    reply: () =>
      '**Testnet vs mainnet:**\n• **Testnet** is a practice copy of a blockchain. Tokens are free and worth nothing.\n• **Mainnet** is the real network where tokens have real value and mistakes cannot be undone.\n• ArcLance runs on Arc Testnet only. Nothing here moves real money, so experiment freely, and never use real bank or account details in the demo forms.',
  },
  {
    id: 'faucet',
    keywords: ['faucet', 'free usdc', 'test usdc', 'get usdc', 'get test', 'free tokens', 'claim'],
    reply: (c) =>
      `**Getting free test USDC:**\n1. Open **Faucet** in the sidebar.\n2. Press **Claim Test USDC** (the official Circle faucet, ${c.faucetUrl}).\n3. Choose Arc Testnet, paste your wallet address, and submit.\n4. Come back and press **Refresh balance** on the Faucet page.\nThe faucet has a limit per address, so if it says wait, try again later. ${TESTNET}`,
  },
  {
    id: 'send',
    keywords: ['send', 'transfer', 'pay someone', 'send money', 'send usdc', 'payment'],
    reply: () =>
      '**Send a payment:**\n1. Open **Payments** and choose the **Send** tab.\n2. Pick the token (USDC, EURC or cirBTC).\n3. Paste the recipient address and enter the amount. Your real balance is shown above the amount.\n4. Press Send and approve it in your wallet.\n5. A link to the explorer appears when it is done. Always double-check the address: blockchain payments cannot be reversed.',
  },
  {
    id: 'receive',
    keywords: ['receive', 'get paid', 'request payment', 'my address', 'qr', 'deposit'],
    reply: () =>
      '**Receive a payment:**\n1. Open **Payments** and choose **Receive**.\n2. Copy your wallet address (or show the QR code) and give it to the sender.\n3. Make sure they send on **Arc Testnet**. The funds appear in your balance after a few seconds.\nFor clients who prefer a link, use **Pay Link**.',
  },
  {
    id: 'swap-pricing',
    keywords: ['swap pricing', 'pricing', 'price impact', 'slippage', 'fixed rate', 'swap quote', 'minimum received'],
    weight: 2,
    reply: () =>
      'ArcLance uses Circle StableFX. You get one fixed-rate quote that stays valid until it expires. The page shows the rate, minimum received, fee and expiry. If the quote expires, request a new one.',
  },
  {
    id: 'swap',
    keywords: ['swap', 'exchange', 'convert', 'trade', 'usdc to eurc'],
    reply: () =>
      '**Swap, step by step:**\n1. Open **Swap**. The top box is what you pay, the bottom box is what you receive.\n2. Pick USDC or EURC and enter an amount, or use 25 / 50 / 75 / MAX. Only USDC and EURC can be swapped.\n3. You see the rate, the minimum you will receive, the fee and when the quote expires.\n4. Press the big button: approve first if asked, then confirm the swap in your wallet.\n\nSwaps are powered by Circle StableFX. If the button says "Swap unavailable", Circle StableFX access is not connected on this site yet. Nothing is ever sent without your approval.\n\n**If a swap does not go through:** check your wallet is on Arc Testnet, check the amount, and request a new quote.',
  },
  {
    id: 'bridge',
    keywords: ['bridge', 'cross chain', 'crosschain', 'move usdc to', 'move tokens', 'another network', 'sepolia', 'base sepolia'],
    reply: (c) =>
      `**Bridge, step by step:**\n1. Open **Bridge**. Choose **From** and **To** networks (${c.bridgeNetworks.length} testnets are available).\n2. Pick **USDC** or **EURC** and enter the amount.\n3. Press the button. The tracker shows 4 steps: **Approve** (allow the transfer), **Send** (your tokens are burned on the first network), **Circle confirms** (timing varies by route; follow the explorer links), **Receive** (the same amount is created on the second network).\n4. If you leave, come back and press **Resume** in Bridge history.\n\n**EURC** only moves between: ${c.eurcNetworks.join(', ')}. Other pairs show a reason and stay on USDC.\n**Gas:** you need a little gas token on both networks (the page tells you which).\n**How it works:** the tokens are burned on the first network and re-created by Circle (CCTP), instead of being locked in a vault.`,
  },
  {
    id: 'invoice',
    keywords: ['invoice', 'bill client', 'billing', 'invoices', 'pdf invoice'],
    reply: () =>
      '**Create an invoice:**\n1. Open **Invoices**.\n2. Enter the client, a description and the amount (USDC or EURC).\n3. Create it, download the PDF, and send it to your client.\n4. The invoice includes your payment details so the client can pay you directly.\nYour invoices are saved in your browser on this device.',
  },
  {
    id: 'paylink',
    keywords: ['pay link', 'paylink', 'payment link', 'share link', 'username', 'my link'],
    reply: () =>
      '**Pay Link:**\n1. Open **Pay Link**.\n2. Connect your wallet. Your address is filled in automatically.\n3. Optionally set a default amount and a note.\n4. Copy the link or share it with your client. Anyone who opens it can pay you in USDC.\nIt is the easiest way to get paid by someone who does not use ArcLance.',
  },
  {
    id: 'escrow',
    keywords: ['escrow', 'milestone', 'milestones', 'freelancer funds', 'hold funds', 'dispute milestone', 'auto release', 'auto-release'],
    reply: (c) =>
      `**Milestone Escrow, in simple words:**\nEscrow holds the client's money in a contract until the client releases it, the auto-release delay passes, or the arbiter rules on a dispute.\n\n**As a client:**\n1. Open **Escrow** > **As Client** > New escrow.\n2. Enter the freelancer's address, token, a title, and 1 to 5 milestones with amounts.\n3. Approve the token, then deposit. The money is locked in the contract.\n4. When the freelancer marks a milestone **Delivered**, check it, then **Approve** and **Release**. You can **Dispute** if something is wrong.\n\n**As a freelancer:** open **As Freelancer**, pick the escrow, and press **Mark delivered** with a note or link.\n\n**Auto-release:** after the auto-release delay, anyone can release the payment to the freelancer. The client can still dispute before that. There is no direct refund: a refund happens only if the arbiter rules for the client. Disputes are decided by a single arbiter address. This is a test deployment.\n${addrLine('Contract', c.addresses.escrow, 'not configured')}. ${TESTNET}`,
  },
  {
    id: 'p2p',
    keywords: ['p2p', 'peer to peer', 'sell usdc', 'buy usdc', 'local currency', 'cash out', 'withdraw', 'jazzcash', 'easypaisa', 'upi', 'bkash', 'opay', 'pkr', 'inr', 'ngn', 'bdt'],
    reply: (c) =>
      `**P2P (USDC for local money), in simple words:**\n1. Open **P2P** and pick your **country** (Pakistan, India, Bangladesh or Nigeria). Only that country's payment methods appear.\n2. **Buying USDC:** choose an ad, enter the amount, create the order, pay the seller outside the app (bank or mobile wallet), then press **I have paid**.\n3. **Selling USDC:** your USDC is locked until you confirm, cancel or the order expires, or the arbiter rules on a dispute. When you receive the money, press **Confirm payment received** and the USDC goes to the buyer. The contract cannot verify off-chain payment, so only confirm after the money has arrived.\n4. If the buyer never pays in time, the locked USDC returns to the seller. If there is a problem after the order is marked paid, either side can open a **Dispute**. Disputes are decided by a single arbiter address. This is a test deployment.\n5. Seller reputation (completed orders and completion rate) comes from the blockchain.\n\n**Testnet demo: do not use real account details.** Payment details are stored publicly on the blockchain.\n${addrLine('Contract', c.addresses.p2p, 'not configured')}.`,
  },
  {
    id: 'arclance',
    keywords: ['what is arclance', 'about arclance', 'what does this site do', 'what does arclance do', 'is arclance a bank'],
    weight: 3,
    reply: () =>
      `**What is ArcLance?**\nArcLance is a payment app for freelancers. You connect your own wallet and can send and receive USDC or EURC, Swap, Bridge between testnets, make Invoices and Pay Links, use milestone Escrow, and trade USDC for local money in P2P.\nIt runs on Circle's Arc blockchain and is **testnet only** for now. ArcLance never holds your funds. ${TESTNET}`,
  },
  {
    id: 'stablecoins',
    keywords: ['stablecoin', 'stablecoins', 'stable coin', 'what is a stablecoin', 'peg', 'depeg'],
    reply: () =>
      '**Stablecoins:** crypto tokens designed to hold a steady value, usually 1 US dollar (USDC, USDT) or 1 euro (EURC).\n• They let you send value across borders quickly without the price swings of normal crypto.\n• Types: fiat-backed (like Circle\'s USDC), crypto-backed, and algorithmic (riskier).\n• Risks: an issuer can block some addresses, and a stablecoin can lose its peg.',
  },
  {
    id: 'layer1',
    weight: 3,
    keywords: ['layer 1', 'layer1', 'l1 blockchain', 'what is l1', 'layer 2', 'layer2', 'l2 blockchain', 'what is l2', 'l1 vs l2', 'l1 and l2', 'what is a layer'],
    reply: () =>
      '**Layer 1 (L1) blockchains:** an L1 is a main blockchain with its own validators and its own security. It records transactions itself.\n• Examples: **Bitcoin** (digital money), **Ethereum** (smart contracts and apps), **Solana** (fast, low-cost apps).\n• **L2** (Layer 2) is built on top of an L1, for example Base or Arbitrum on Ethereum. It runs transactions off the main chain and sends the results back to the L1, which makes it cheaper and faster, but it relies on the L1 for security.\n• Arc is an **L1**.',
  },
  {
    id: 'circle',
    keywords: ['what is circle', 'circle company', 'who is circle', 'who made usdc', 'who issues usdc', 'is usdc regulated', 'usdc regulated', 'about circle'],
    weight: 3,
    reply: () =>
      '**Circle** is a US-based financial technology company. It issues **USDC** (a dollar stablecoin) and **EURC** (a euro stablecoin), and builds payment tools such as CCTP and the Arc blockchain.\nUSDC is designed to stay at 1 US dollar and is issued under financial regulation. Rules and reserve details change over time, so check Circle\'s official site and docs (circle.com, developers.circle.com) for the current facts. I do not guess.',
  },
  {
    id: 'cctp',
    keywords: ['cctp', 'cross-chain transfer protocol', 'cross chain transfer protocol', 'burn and mint', 'attestation', 'what is cctp'],
    weight: 4,
    reply: () =>
      '**CCTP (Cross-Chain Transfer Protocol)** is Circle\'s way to move USDC between blockchains without wrapped tokens:\n1. **Burn:** your USDC is destroyed on the source chain.\n2. **Attestation:** Circle signs a proof of the burn.\n3. **Mint:** the same amount of native USDC is created on the destination chain.\nThe ArcLance Bridge uses it: Approve, Send (burn), Circle confirms (attestation), Receive (mint). EURC uses Circle\'s related transfer for non-USDC tokens. Here it is testnet only. For details see developers.circle.com.',
  },
  {
    id: 'defi',
    keywords: ['defi', 'decentralized finance', 'decentralised finance', 'yield farming', 'liquidity pool', 'lending protocol'],
    reply: () =>
      '**DeFi (decentralised finance):** financial services run by smart contracts instead of banks: swapping tokens, lending and borrowing, earning yield. You keep your own wallet and the code enforces the rules.\n• Risks: smart-contract bugs, scams, and losses when prices fall.\n• ArcLance only offers Swap, Bridge, Escrow and P2P. It has no lending or yield farming. This is information, not financial advice.',
  },
  {
    id: 'nft',
    keywords: ['nft', 'nfts', 'non fungible', 'non-fungible'],
    reply: () =>
      '**NFT:** a non-fungible token. It is a unique token on a blockchain that proves ownership of an item such as art or a ticket. Unlike USDC, where every unit is identical, each NFT is different. ArcLance does not support NFTs.',
  },
  {
    id: 'terms',
    keywords: ['crypto terms', 'glossary', 'crypto basics', 'what is crypto', 'what is a blockchain', 'what is blockchain', 'explain crypto', 'what is web3', 'smart contract', 'what is a token', 'what is a validator', 'what is a dex', 'what is an address'],
    reply: () =>
      '**Common crypto words:**\n• **Blockchain:** a shared record of transactions that nobody can quietly change.\n• **Wallet:** the app that holds your keys.\n• **Address:** the public number of your wallet.\n• **Gas:** the fee for a transaction.\n• **Token / coin:** a digital asset.\n• **Smart contract:** a program that runs on a blockchain by itself.\n• **Validator:** a computer that confirms transactions.\n• **DEX:** a decentralised exchange.\n• **Testnet / mainnet:** the practice / the real network.',
  },
  {
    id: 'advice',
    weight: 60,
    keywords: ['should i buy', 'should i sell', 'what should i buy', 'what to buy', 'what to sell', 'what coin to buy', 'which coin', 'good investment', 'should i invest', 'is it a good time', 'will it go up', 'will it pump', 'buy or sell', 'financial advice', 'make me rich', 'best crypto to buy'],
    reply: () =>
      'I can share information, but I cannot tell you what to buy or sell. **This is not financial advice.**\n• Crypto prices can fall quickly.\n• Only use money you can afford to lose.\n• Do your own research.\n• ArcLance runs on testnet, so nothing here is real money.',
  },
  {
    id: 'tx-status',
    weight: 8,
    keywords: ['did my transaction', 'did it go through', 'was my payment', 'is my transfer done', 'transaction successful', 'payment successful', 'has my payment', 'did my payment', 'is it confirmed'],
    reply: () =>
      '**I cannot see your transactions, and I never confirm that one succeeded.** To see the real status, open History on the Payments page, the Swap or Bridge history, or the explorer link in the toast. Treat a transaction as successful only when the app or the explorer shows it.',
  },
  {
    id: 'languages',
    weight: 6,
    keywords: ['which languages', 'what languages', 'speak urdu', 'speak hindi', 'speak bengali', 'speak pidgin', 'urdu', 'hindi', 'bengali', 'bangla', 'pidgin', 'language'],
    reply: () =>
      'I can answer in **English, Urdu, Hindi, Bengali (Bangladesh) and Nigerian Pidgin**. Write in the language you like and I will reply in it. If I cannot tell which language you use, I answer in English.',
  },
  {
    id: 'history',
    keywords: ['history', 'past transactions', 'my transactions', 'export', 'csv', 'receipt'],
    reply: () =>
      '**History:** open **Payments** to see your transactions with links to the explorer. Swap and Bridge keep their own history on their pages (Bridge also has **Resume** for unfinished transfers). History is stored in your browser for your wallet address.',
  },
  {
    id: 'safety',
    keywords: ['scam', 'safe', 'safety', 'phishing', 'hack', 'trust', 'secure', 'is this safe', 'fraud', 'legit'],
    reply: () =>
      '**Staying safe with crypto:**\n• Never share your seed phrase or private key. No one legitimate will ask.\n• Check the website address before connecting a wallet. Bookmark the real one.\n• Read what your wallet asks you to sign. If you do not understand it, reject it.\n• Be careful with "too good to be true" offers, urgent messages, and strangers who message you first.\n• Blockchain payments cannot be reversed, so double-check addresses and amounts.\n• In P2P, only release USDC after the money is really in your account.\n• Use a separate wallet for testing. Here everything is testnet, so nothing real is at risk.',
  },
  {
    id: 'rejected',
    keywords: ['failed', 'rejected', 'error', 'not working', 'stuck', 'pending', 'problem', 'issue', 'transaction failed'],
    reply: () =>
      '**If something fails:**\n• **"Rejected" or "denied":** you pressed reject in your wallet. Nothing was sent. Try again and press confirm.\n• **Wrong network:** press the red network badge to switch to Arc Testnet.\n• **Not enough gas:** claim test USDC on the Faucet page (USDC is the gas token).\n• **Pending a long time:** open the explorer link from the toast or history and check the status.\n• **Balance shows an error:** press Retry on Home. Your funds are on the chain and are not affected.',
  },
  {
    id: 'about-gas-token',
    keywords: ['why usdc for gas', 'no eth', 'need eth'],
    reply: () => 'On Arc you do **not** need ETH. USDC pays for gas, so you only hold dollars. On other networks you use in the Bridge (like Ethereum Sepolia) you do need that network\'s own gas token.',
  },
]

// Keep letters, combining marks (Devanagari and Bengali vowel signs) and digits in every script; drop punctuation.
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim()

/** A pasted private key (64 hex characters) or a seed-phrase-like list of 12 or more lowercase words. */
export function looksLikeSecret(raw: string): boolean {
  const t = raw.trim()
  if (/\b(0x)?[0-9a-fA-F]{64}\b/.test(t)) return true
  const words = t.split(/\s+/)
  return words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-z]{3,8}$/.test(w))
}

/** "Should I buy ...", "what to sell", "will it pump" and the same ideas in the other languages. */
const ADVICE =
  /\b(should i (buy|sell|invest)|what (should i |to )(buy|sell)|which coin|good investment|will it (go up|pump)|buy or sell|best crypto to buy|make i (buy|sell)|e go (go up|pump)|which coin good)\b|خریدوں|بیچوں|سرمایہ کاری|खरीदूं|खरीदूँ|बेचूं|बेचूँ|निवेश|কিনব|বেচব|বিনিয়োগ/i
export const isAdviceQuestion = (text: string): boolean => ADVICE.test(text)

const isLatinKeyword = (k: string) => /^[a-z0-9\s-]+$/.test(k)

/** Answer a question from the built-in guide in the user's language. `matched` is false when nothing fits. */
export function answer(message: string, ctx: AssistantContext, lang: Lang = 'en'): AssistantAnswer {
  const pack = PACKS[lang]
  if (looksLikeSecret(message)) {
    const t = TOPICS.find((x) => x.id === 'secrets')
    const body = pack?.replies.secrets ?? t?.reply(ctx) ?? ''
    const text = typeof body === 'function' ? body(ctx) : body
    return { text: `${pack?.secretStop ?? '**Stop: that looks like a private key or seed phrase.** Do not share it with anyone, including me.'}\n\n${text}`, topic: 'secrets', matched: true }
  }
  const m = ` ${norm(message)} `
  const scored: { topic: Topic; score: number }[] = []
  for (const topic of TOPICS) {
    let score = 0
    for (const k of [...topic.keywords, ...(pack?.keywords[topic.id] ?? [])]) {
      const key = norm(k)
      if (!key) continue
      if (isLatinKeyword(key)) {
        if (m.includes(` ${key} `) || (key.length > 4 && m.includes(key))) score += key.includes(' ') ? 3 : 2
      } else if (m.includes(key)) {
        score += key.includes(' ') ? 3 : 2 // other scripts have no spaces around suffixes, so match inside words
      }
    }
    if (score > 0) score += topic.weight ?? 0
    if (score > 0) scored.push({ topic, score })
  }
  const specific = scored.filter((x) => !x.topic.generic)
  let best: { topic: Topic; score: number } | null = null
  for (const x of specific.length ? specific : scored) if (!best || x.score > best.score) best = x
  if (!best) return { text: '', topic: 'none', matched: false }
  const localized = pack?.replies[best.topic.id]
  const text = localized === undefined ? best.topic.reply(ctx) : typeof localized === 'function' ? localized(ctx) : localized
  return { text, topic: best.topic.id, matched: true }
}

export const FALLBACK_NOTE = 'AI service is not configured, so this answer comes from the built-in guide.'
export const DOCS_LINE = 'For facts I am not sure about, please check the official docs: docs.arc.io and developers.circle.com, or contact support@arclance.xyz.'
export const NO_MATCH_TEXT = `I am not sure, please contact support@arclance.xyz. I can explain Send, Receive, Swap, Bridge, Invoices, Pay Link, Escrow, P2P, the Faucet and History, plus wallets, gas, USDC and EURC, Layer 1 blockchains, Arc, Circle, CCTP, stablecoins, DeFi, NFTs, swap pricing, testnet vs mainnet and scam safety. I can also look up live crypto prices (for example "Bitcoin price"). ${DOCS_LINE}`

export const noMatchText = (lang: Lang): string => PACKS[lang]?.noMatch ?? NO_MATCH_TEXT

/** Added to an English answer when the language could not be decided. */
export const LANGUAGE_NOTE =
  'I can also answer in Urdu, Hindi, Bengali (Bangladesh) and Nigerian Pidgin. Write your question in that language and I will reply in it.'

/** The assistant's own screen text. English by default, whatever language the user writes in. */
export const ASSISTANT_UI = {
  welcomeHtml:
    "Hey! I'm your <strong>ArcLance AI</strong> assistant, built by 𝐇𝐚𝐬𝐧𝐚𝐢𝐧𝐀𝐈⚡.<br><br>Ask me about crypto, wallets, gas, Arc Testnet, USDC payments, Send, Swap, Bridge, Invoices, Pay Link, Escrow or P2P. I can also explain Web3 basics, look up live crypto prices, and answer in English, Urdu, Hindi, Bengali or Nigerian Pidgin, as well as Roman Urdu, Hausa, Yoruba, and Igbo.",
  chips: [
    { label: 'Bitcoin price', query: 'What is the Bitcoin price?' },
    { label: 'What is Layer 1?', query: 'What is a Layer 1 blockchain?' },
    { label: 'What is CCTP?', query: 'What is CCTP?' },
    { label: 'Languages', query: 'Which languages can you speak?' },
  ],
} as const
