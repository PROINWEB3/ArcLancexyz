/**
 * Built-in knowledge base for the ArcLance assistant. Used when no AI service is configured, and as the safety net
 * when the service is unreachable. Pure function: no network, no wallet access, nothing invented.
 *
 * Rules the answers follow:
 *  - never ask for or accept private keys or seed phrases
 *  - addresses, balances and rates only come from the context passed in (real app state), never typed here
 *  - everything is Arc Testnet: no real money
 */

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
    keywords: ['private key', 'seed phrase', 'secret phrase', 'recovery phrase', 'mnemonic', 'secret key', 'keystore', 'password to my wallet'],
    reply: () =>
      '**Never share your private key or seed phrase.**\n• ArcLance, Circle and every real support team will never ask for it.\n• Anyone who asks (even in a chat that looks official) is a scammer.\n• Your wallet signs for you. This site only asks you to approve transactions inside your wallet.\n• Do not type it into this chat or any website.',
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
    keywords: ['exchange rate', 'price of', 'rate today', 'current rate', 'how much is 1', 'usd to pkr', 'usd to inr', 'usd to ngn', 'usd to bdt', 'price per usdc'],
    reply: () =>
      '**I do not quote live rates.** Prices change all the time and I do not want to guess.\n• Swap shows an indicative market rate when its data source answers.\n• P2P shows a reference rate for orientation only, with its source named. Each seller sets their own price.\n• Always check the final amount before you confirm.',
  },
  {
    id: 'start',
    weight: 5,
    keywords: ['get started', 'how do i start', 'getting started', 'first steps', 'new here', 'how to use', 'what can i do', 'what is arclance', 'about arclance', 'what does this site do'],
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
    keywords: ['usdc', 'eurc', 'stablecoin', 'stable coin', 'euro coin', 'cirbtc', 'what is usdc', 'what is eurc'],
    reply: (c) =>
      `**USDC and EURC:**\n• **USDC** is a dollar stablecoin from Circle. 1 USDC is meant to equal 1 US dollar.\n• **EURC** is the euro version from Circle.\n• **cirBTC** is a Bitcoin-linked test token on Arc Testnet.\n• ERC-20 balances use 6 decimals (8 for cirBTC). On Arc, USDC is also the gas token.\n• Testnet contracts: ${addrLine('USDC', c.addresses.usdc, 'not available')}, ${addrLine('EURC', c.addresses.eurc, 'not available')}.\n• ${TESTNET}`,
  },
  {
    id: 'arc',
    keywords: ['arc network', 'what is arc', 'arc chain', 'arc testnet', 'about arc', 'arc blockchain', 'layer 1', 'finality'],
    reply: (c) =>
      `**Arc in simple words:**\n• Arc is a blockchain built by Circle for payments in stablecoins.\n• Its gas token is USDC, so fees are paid in dollars, not a volatile coin.\n• Transactions confirm very fast and stay final.\n• It works with the same tools as Ethereum (EVM), so normal wallets work.\n• It is in **testnet** now (chain ID ${c.chainId}): a practice network with free test tokens.\n• Explorer: ${c.explorerUrl}`,
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
    keywords: ['bridge', 'cross chain', 'crosschain', 'cctp', 'move usdc to', 'move tokens', 'another network', 'sepolia', 'base sepolia', 'attestation'],
    reply: (c) =>
      `**Bridge, step by step:**\n1. Open **Bridge**. Choose **From** and **To** networks (${c.bridgeNetworks.length} testnets are available).\n2. Pick **USDC** or **EURC** and enter the amount.\n3. Press the button. The tracker shows 4 steps: **Approve** (allow the transfer), **Send** (your tokens are burned on the first network), **Circle confirms** (about a few minutes on most networks), **Receive** (the same amount is created on the second network).\n4. If you leave, come back and press **Resume** in Bridge history.\n\n**EURC** only moves between: ${c.eurcNetworks.join(', ')}. Other pairs show a reason and stay on USDC.\n**Gas:** you need a little gas token on both networks (the page tells you which).\n**Why it is safe:** the tokens are burned and re-created by Circle (CCTP). There is no vault that can be drained.`,
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
      '**Pay Link:**\n1. Open **Pay Link**.\n2. Connect your wallet. Your address is filled in automatically.\n3. Optionally set a default amount and a note.\n4. Copy the link or share it on WhatsApp. Anyone who opens it can pay you in USDC.\nIt is the easiest way to get paid by someone who does not use ArcLance.',
  },
  {
    id: 'escrow',
    keywords: ['escrow', 'milestone', 'milestones', 'freelancer funds', 'hold funds', 'dispute milestone', 'auto release', 'auto-release'],
    reply: (c) =>
      `**Milestone Escrow, in simple words:**\nEscrow holds the client's money safely until the work is done.\n\n**As a client:**\n1. Open **Escrow** > **As Client** > New escrow.\n2. Enter the freelancer's address, token, a title, and 1 to 5 milestones with amounts.\n3. Approve the token, then deposit. The money is locked in the contract.\n4. When the freelancer marks a milestone **Delivered**, check it, then **Approve** and **Release**. You can **Dispute** if something is wrong.\n\n**As a freelancer:** open **As Freelancer**, pick the escrow, and press **Mark delivered** with a note or link.\n\n**Auto-release:** if the client does nothing for the set number of days after delivery, anyone can release the payment to the freelancer.\n${addrLine('Contract', c.addresses.escrow, 'not configured')}. ${TESTNET}`,
  },
  {
    id: 'p2p',
    keywords: ['p2p', 'peer to peer', 'sell usdc', 'buy usdc', 'local currency', 'cash out', 'withdraw', 'jazzcash', 'easypaisa', 'upi', 'bkash', 'opay', 'pkr', 'inr', 'ngn', 'bdt'],
    reply: (c) =>
      `**P2P (USDC for local money), in simple words:**\n1. Open **P2P** and pick your **country** (Pakistan, India, Bangladesh or Nigeria). Only that country's payment methods appear.\n2. **Buying USDC:** choose an ad, enter the amount, create the order, pay the seller outside the app (bank or mobile wallet), then press **I have paid**.\n3. **Selling USDC:** your USDC is locked in a contract. When you receive the money, press **Confirm payment received** and the USDC goes to the buyer.\n4. If the buyer never pays in time, the locked USDC returns to the seller. If there is a problem, either side can open a **Dispute**.\n5. Seller reputation (completed orders and completion rate) comes from the blockchain.\n\n**Testnet demo: do not use real account details.** Payment details are stored publicly on the blockchain.\n${addrLine('Contract', c.addresses.p2p, 'not configured')}.`,
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff\s-]/g, ' ').replace(/\s+/g, ' ').trim()

/** A pasted private key (64 hex characters) or a seed-phrase-like list of 12 or more lowercase words. */
export function looksLikeSecret(raw: string): boolean {
  const t = raw.trim()
  if (/\b(0x)?[0-9a-fA-F]{64}\b/.test(t)) return true
  const words = t.split(/\s+/)
  return words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-z]{3,8}$/.test(w))
}

/** Answer a question from the built-in guide. `matched` is false when nothing fits. */
export function answer(message: string, ctx: AssistantContext): AssistantAnswer {
  if (looksLikeSecret(message)) {
    const t = TOPICS.find((x) => x.id === 'secrets')
    return { text: '**Stop: that looks like a private key or seed phrase.** Do not share it with anyone, including me.\n\n' + (t ? t.reply(ctx) : ''), topic: 'secrets', matched: true }
  }
  const m = ` ${norm(message)} `
  let best: { topic: Topic; score: number } | null = null
  const scored: { topic: Topic; score: number }[] = []
  for (const topic of TOPICS) {
    let score = 0
    for (const k of topic.keywords) {
      if (m.includes(` ${k} `) || (k.length > 4 && m.includes(k))) score += k.includes(' ') ? 3 : 2
    }
    if (score > 0) score += topic.weight ?? 0
    if (score > 0) scored.push({ topic, score })
  }
  const specific = scored.filter((s) => !s.topic.generic)
  for (const s of specific.length ? specific : scored) if (!best || s.score > best.score) best = s
  if (!best) return { text: '', topic: 'none', matched: false }
  return { text: best.topic.reply(ctx), topic: best.topic.id, matched: true }
}

export const FALLBACK_NOTE = 'AI service is not configured, so this answer comes from the built-in guide.'
export const NO_MATCH_TEXT =
  "I'm not sure about that one. I can explain Send, Receive, Swap, Bridge, Invoices, Pay Link, Escrow, P2P, the Faucet and History, plus wallets, gas, USDC and EURC, bridges, escrow, swap pricing, testnet vs mainnet, scam safety and the Arc network. Try one of the suggested questions."
