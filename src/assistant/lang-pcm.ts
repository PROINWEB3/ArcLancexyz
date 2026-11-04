import type { LangPack } from './pack'

const TESTNET = 'All dis one dey run on Arc Testnet. The tokens no get real value.'
const DOCS = 'For correct info, check the official docs: docs.arc.io and developers.circle.com.'

export const PCM: LangPack = {
  noMatch: `I no too sure about that one. I fit explain Send, Receive, Swap, Bridge, Invoices, Pay Link, Escrow, P2P, Faucet and History, plus wallet, gas, USDC, Layer 1, CCTP, stablecoin and live prices. ${DOCS}`,
  secretStop: '**Hold on: dis one look like private key or seed phrase.** No share am with anybody, even me.',
  keywords: {
    secrets: ['wetin be seed phrase', 'my private key', 'secret words'],
    balance: ['how much i get', 'my balance'],
    rates: ['dollar rate', 'naira rate', 'exchange rate'],
    start: ['how i go start', 'make i start', 'i dey new'],
    arclance: ['wetin be arclance', 'wetin arclance be'],
    wallet: ['wetin be wallet', 'how i go connect', 'connect wallet'],
    gas: ['wetin be gas', 'gas fee', 'network fee'],
    'usdc-eurc': ['wetin be usdc', 'wetin be eurc'],
    stablecoins: ['wetin be stablecoin', 'stable coin'],
    arc: ['wetin be arc', 'arc network'],
    layer1: ['wetin be layer 1', 'wetin be l1', 'layer 2', 'wetin be blockchain'],
    circle: ['wetin be circle', 'circle company'],
    cctp: ['wetin be cctp', 'cross chain'],
    testnet: ['wetin be testnet', 'mainnet'],
    faucet: ['free usdc', 'test usdc', 'where i go get usdc'],
    send: ['how i go send', 'make i send', 'dash money', 'send money'],
    receive: ['how i go collect', 'collect money', 'receive money'],
    'swap-pricing': ['swap price', 'how swap price dey work'],
    swap: ['how i go swap', 'make i swap', 'change usdc'],
    bridge: ['how i go bridge', 'move usdc go'],
    invoice: ['how i go make invoice', 'invoice'],
    paylink: ['pay link', 'payment link'],
    escrow: ['wetin be escrow', 'how escrow dey work'],
    p2p: ['wetin be p2p', 'sell usdc', 'buy usdc', 'naira', 'opay', 'palmpay', 'moniepoint', 'cash out'],
    history: ['my history', 'old transaction'],
    safety: ['419', 'wayo', 'person wan cheat me', 'scam', 'dem fit cheat me'],
    rejected: ['e fail', 'e no work', 'transaction fail', 'wahala'],
    defi: ['wetin be defi'],
    nft: ['wetin be nft'],
    terms: ['wetin dis word mean', 'explain crypto'],
    advice: ['make i buy', 'make i sell', 'e go go up', 'e go pump', 'which coin good', 'invest'],
    'tx-status': ['e don go', 'payment don enter', 'transaction don successful'],
    languages: ['which language', 'language', 'pidgin', 'urdu', 'hindi', 'bengali'],
  },
  replies: {
    secrets:
      '**Never give anybody your private key or seed phrase.**\n• **Seed phrase** (12 or 24 words) na the master key of your wallet. Whoever get am fit carry all your money.\n• ArcLance, Circle or any real support team no go ever ask for am. Anybody wey ask, na scammer.\n• Write am on paper, keep am for safe place offline. No put am for photo, email or chat.\n• No type am for dis chat or any website. Your wallet dey sign for you by itself.',
    balance: (c) => {
      if (!c.connected) return 'Connect your wallet first (top right). Then your real balance go show for Home page. I no dey guess balance.'
      const b = c.balances
      if (!b || b.USDC === null) return 'I no fit read your balance now. Refresh Home or try again small time.'
      return `**Your balance for Arc Testnet (we read am from the chain):**\n• USDC: ${b.USDC}\n• EURC: ${b.EURC ?? 'no dey available'}\n• cirBTC: ${b.cirBTC ?? 'no dey available'}\n\nFor Arc, USDC na gas too, so na one balance.`
    },
    rates:
      '**I no dey quote money rates like dollar to naira.**\n• Ask me live price of crypto coin, like "Bitcoin price".\n• The P2P page dey show reference rate for idea only. Every seller dey set their own price.\n• Always check the final amount before you confirm.',
    start: (c) =>
      `**How to start for 4 steps:**\n1. Install wallet (MetaMask, Rabby or OKX) then press **Connect Wallet**. Allow the switch to Arc Testnet.\n2. Open **Faucet** and claim free test USDC (${c.faucetUrl}).\n3. Try **Send**, **Swap**, **Bridge**, **Invoices**, **Pay Link**, **Escrow** or **P2P** from the sidebar.\n4. Check History for **Payments**.\n\n${TESTNET}`,
    arclance:
      `**Wetin be ArcLance?**\nNa payment app for freelancers. You connect your own wallet, then you fit send and receive USDC or EURC, Swap, Bridge between testnets, make Invoices and Pay Links, use milestone Escrow and P2P (USDC for local money).\nE dey run on Circle's Arc blockchain and e dey **testnet only** for now. ArcLance no dey hold your funds. ${TESTNET}`,
    wallet: (c) =>
      `**Wallet and how to connect:**\n• Wallet na app (MetaMask, Rabby, OKX and others) wey hold your keys and sign payments. Na only you dey control am.\n• Press **Connect Wallet** and choose your wallet.\n• If the badge talk say wrong network, press am to switch go Arc Testnet. If your wallet no know Arc, e go ask to add am (chain ID ${c.chainId}).\n• Connection dey stay after refresh.\n• No ever share seed phrase or private key.`,
    gas:
      '**Gas for simple words:**\n• Gas na the small fee wey network dey take to run your transaction.\n• For Arc, the gas token na **USDC**. You no need ETH.\n• So your USDC na money and gas at the same time, and na one balance.\n• If gas short, claim more test USDC for **Faucet**.\n• For the other networks for Bridge, you go pay gas with that network own token (like ETH for Sepolia).',
    'usdc-eurc': (c) =>
      `**USDC and EURC:**\n• **USDC** na Circle dollar stablecoin. 1 USDC suppose equal 1 US dollar.\n• **EURC** na the euro version.\n• **cirBTC** na Bitcoin-linked test token for Arc Testnet.\n• For Arc, USDC na gas too.\n• Testnet contracts: USDC: ${c.addresses.usdc || 'no dey available'}, EURC: ${c.addresses.eurc || 'no dey available'}.\n• ${TESTNET}`,
    stablecoins:
      '**Stablecoins:** tokens wey dem design make their value stay steady, normally 1 US dollar (USDC, USDT) or 1 euro (EURC).\n• You fit send money cross border fast, and the price no dey jump up and down like normal crypto.\n• Types: fiat-backed (like Circle USDC), crypto-backed, and algorithmic (more risk).\n• Risks: the issuer fit block some addresses, and stablecoin fit lose im peg too.',
    arc: (c) =>
      `**Arc for simple words:**\n• Arc na **Circle own Layer-1 blockchain**, wey dem build for payments and stablecoin finance.\n• Gas dey paid with **USDC**, so fees dey for dollars.\n• E be EVM, so normal wallets dey work.\n• ArcLance dey use dis network.\n• E dey **testnet** now (chain ID ${c.chainId}): practice network with free tokens.\n• Explorer: ${c.explorerUrl}\n• For dates, mainnet plans or new features, check the official docs: docs.arc.io. I no dey guess.`,
    layer1:
      '**Layer 1 (L1) blockchain:** L1 na the main blockchain wey get im own validators and im own security, and e dey record transactions by itself.\n• Examples: **Bitcoin** (digital money), **Ethereum** (smart contracts and apps), **Solana** (fast and cheap apps).\n• **L2** dey build on top of L1 (like Base or Arbitrum on Ethereum). E dey run transactions outside the main chain then send result go L1, so e go cheap and fast, but e still dey depend on L1 for security.\n• Arc na **L1**.',
    circle:
      '**Circle** na US financial technology company. Dem dey issue **USDC** (dollar stablecoin) and **EURC** (euro stablecoin), and dem dey build payment tools like CCTP and the Arc blockchain.\nUSDC suppose stay at 1 dollar and dem dey issue am under financial rules. The rules and reserve details fit change, so check circle.com and developers.circle.com for the latest.',
    cctp:
      '**CCTP (Cross-Chain Transfer Protocol)** na Circle way to move USDC from one blockchain go another without wrapped token:\n1. **Burn:** your USDC dey destroyed for the first network.\n2. **Attestation:** Circle sign proof of that burn.\n3. **Mint:** the same amount of real USDC dey created for the second network.\nArcLance Bridge dey use am: Approve, Send (burn), Circle confirm, Receive (mint). For EURC, Circle get related method. Testnet only here.',
    testnet:
      '**Testnet vs mainnet:**\n• **Testnet** na practice copy of blockchain. The tokens free and no get value.\n• **Mainnet** na the real network where tokens get real value and mistake no fit reverse.\n• ArcLance dey Arc Testnet only for now. No real money dey move, so no put real bank or account details for the demo forms.',
    faucet: (c) =>
      `**How to get free test USDC:**\n1. Open **Faucet** for the sidebar.\n2. Press **Claim Test USDC** (official Circle faucet, ${c.faucetUrl}).\n3. Choose Arc Testnet, put your wallet address and submit.\n4. Come back press **Refresh balance** for Faucet page.\nEach address get limit, so if e talk say wait, try again later. ${TESTNET}`,
    send:
      '**How to send payment:**\n1. Open **Payments** and choose **Send** tab.\n2. Choose the token (USDC, EURC or cirBTC).\n3. Paste the receiver address and put the amount. Your real balance dey show above.\n4. Press Send and approve am for your wallet.\n5. Link to the explorer go show when e finish. Check the address two times: blockchain payment no fit reverse.',
    receive:
      '**How to receive payment:**\n1. Open **Payments** and choose **Receive**.\n2. Copy your wallet address (or show the QR code) give the sender.\n3. Make sure say dem send am for **Arc Testnet**. The money go show for your balance after few seconds.\nFor client wey like link, use **Pay Link**.',
    'swap-pricing':
      'ArcLance dey use Circle StableFX. You go get one fixed-rate quote wey go still valid until e expire. The page dey show the rate, minimum wey you go receive, fee and expiry. If the quote expire, ask for new one.',
    swap:
      '**Swap step by step:**\n1. Open **Swap**. The top box na wetin you dey pay, the bottom box na wetin you go receive.\n2. Choose USDC or EURC and put amount, or use 25 / 50 / 75 / MAX. Na only USDC and EURC fit swap.\n3. You go see the rate, the minimum wey you go receive, the fee and when the quote go expire.\n4. Press the big button: approve first if dem ask, then confirm the swap for your wallet.\n\nIf the button talk say "Swap unavailable", e mean say Circle StableFX no connect for dis site yet. Nothing dey go without your approval.\n**If swap no go through:** check say your wallet dey Arc Testnet, check the amount, then ask for new quote.',
    bridge: (c) =>
      `**Bridge step by step:**\n1. Open **Bridge**. Choose **From** and **To** network (${c.bridgeNetworks.length} testnets dey available).\n2. Choose **USDC** or **EURC** and put amount.\n3. Press the button. Tracker go show 4 steps: **Approve**, **Send** (your tokens dey burn for the first network), **Circle confirms**, **Receive** (the same amount dey created for the second network).\n4. If you leave, come back and press **Resume** for Bridge history.\n\n**EURC** dey move only between: ${c.eurcNetworks.join(', ')}.\n**Gas:** you need small gas token for both networks (the page go tell you).\nTime dey change by route; follow the explorer links make you see the status.\nE dey use Circle CCTP. Testnet.`,
    invoice:
      '**How to make invoice:**\n1. Open **Invoices**.\n2. Put the client, description and amount (USDC or EURC).\n3. Create am, download the PDF and send am to your client.\n4. The invoice get your payment details so the client fit pay you direct.\nYour invoices dey save for dis browser for dis device.',
    paylink:
      '**Pay Link:**\n1. Open **Pay Link**.\n2. Connect your wallet. Your address go fill by itself.\n3. If you want, set default amount and note.\n4. Copy the link or share am for WhatsApp. Anybody wey open am fit pay you with USDC.\nNa the easiest way to collect money from person wey no dey use ArcLance.',
    escrow: (c) =>
      `**Milestone Escrow for simple words:**\nEscrow dey keep the client money for contract until the client release am, the auto-release time pass, or the arbiter decide dispute.\n\n**As client:** **Escrow** > **As Client** > New escrow. Put freelancer address, token (USDC/EURC), title and 1 to 5 milestones. Approve then deposit. When freelancer mark **Delivered**, check am then **Approve** and **Release**, or open **Dispute**.\n**As freelancer:** for **As Freelancer** press **Mark delivered** with note or link.\n\n**Auto-release:** after the auto-release delay (1 to 90 days, wey dem set when dem create am), anybody fit release the payment to the freelancer. The client fit still open dispute before that. No direct refund: refund dey happen only if the arbiter rule for client side. One arbiter address dey decide all disputes. Na test deployment.\nContract: ${c.addresses.escrow || 'no dey configured'}. ${TESTNET}`,
    p2p: (c) =>
      `**P2P (USDC for local money):**\n1. Open **P2P** and choose your **country** (Pakistan, India, Bangladesh or Nigeria). Na only payment methods for that country go show.\n2. **To buy USDC:** choose ad, put amount, create order, pay the seller outside the app (bank or mobile wallet), then press **I have paid**.\n3. **To sell USDC:** your USDC go dey locked until you confirm, cancel or the order expire, or the arbiter decide dispute. When money enter, press **Confirm payment received**. The contract no fit see your bank payment, so confirm only after money don enter.\n4. If buyer no pay for time, the locked USDC go return to the seller. If problem dey after dem mark am paid, any side fit open **Dispute**. One arbiter address dey decide. Na test deployment.\n\n**Testnet demo: no put real account details.** Payment details dey public for blockchain.\nContract: ${c.addresses.p2p || 'no dey configured'}.`,
    history:
      '**History:** open **Payments** to see your transactions with explorer links. Swap and Bridge get their own history for their pages (Bridge get **Resume** too for transfer wey no finish). History dey save for your browser for your wallet address.',
    safety:
      '**How to stay safe for crypto:**\n• No ever share seed phrase or private key. No real person go ask for am.\n• Check the website address before you connect wallet. Bookmark the real one.\n• Read wetin your wallet dey ask you sign. If you no understand, reject am.\n• Beware of "too good to be true" offers, rush messages, and strangers wey message you first.\n• Blockchain payment no fit reverse, so check address and amount two times.\n• For P2P, release USDC only after money really enter your account.\n• Here na testnet everything, so no real money dey at risk.',
    rejected:
      '**If something fail:**\n• **"Rejected" or "denied":** you press reject for your wallet. Nothing go. Try again and press confirm.\n• **Wrong network:** press the red network badge to switch go Arc Testnet.\n• **Gas short:** claim test USDC for Faucet page (USDC na gas).\n• **Pending for long time:** open the explorer link from the toast or history and check the real status.\n• **Balance show error:** press Retry for Home. Your funds dey the chain and nothing happen to dem.',
    'about-gas-token': 'For Arc you **no need** ETH. USDC dey pay gas. For the other networks for Bridge (like Ethereum Sepolia) you need that network own gas token.',
    defi:
      '**DeFi (decentralised finance):** financial services wey smart contracts dey run instead of bank: swapping tokens, lend and borrow, earn yield. Your wallet dey with you and code dey enforce the rules.\n• Risks: contract bugs, scam, and loss from price fall.\n• ArcLance get only Swap, Bridge, Escrow and P2P. No lending or yield farming. Na no be financial advice.',
    nft:
      '**NFT:** non-fungible token, one unique token for blockchain wey prove say you own something (art, ticket and so on). E no be like USDC where every unit the same; every NFT different. ArcLance no support NFT.',
    terms:
      '**Common crypto words:**\n• **Blockchain:** shared record of transactions wey nobody fit change.\n• **Wallet:** app wey hold your keys.\n• **Address:** public number of your wallet.\n• **Gas:** transaction fee.\n• **Token/coin:** digital asset.\n• **Smart contract:** automatic program wey dey run for blockchain.\n• **Validator:** the one wey dey confirm transactions.\n• **DEX:** decentralised exchange.\n• **Testnet/mainnet:** practice/real network.',
    advice:
      'I fit give information, but I no fit tell you wetin to buy or sell. **Na no be financial advice.**\n• Crypto price fit fall fast.\n• Use only money wey you fit afford to lose.\n• Do your own research.\n• ArcLance dey testnet, no real money dey here.',
    'tx-status':
      '**I no fit see your transactions and I no dey ever confirm say e succeed by myself.** To see the real status, open History for Payments, Swap/Bridge history, or the explorer link for the toast. Count "successful" only when the app or explorer show am.',
    languages: 'I fit answer for English, Urdu, Hindi, Bengali (Bangladesh) and Nigerian Pidgin. Write for the language wey you want and I go reply for am.',
  },
}
