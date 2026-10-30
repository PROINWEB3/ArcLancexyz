// AI Assistant
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { ARC, ESCROW_ADDRESS, P2P_ADDRESS, BRIDGE_CHAINS } from '../config/chain-config';
import { answer, looksLikeSecret, FALLBACK_NOTE, NO_MATCH_TEXT } from '../assistant/knowledge';
/* ══════════════════════════════════════
   AI CHAT
══════════════════════════════════════ */
const arcKnowledge = {

arc: `**Arc Network — Official Facts:**
- Arc is an open **Layer-1 blockchain** purpose-built for programmable money
- **USDC is the native gas token** — no ETH needed ever
- **Sub-second deterministic finality** — transactions confirmed in under 1 second
- **EVM compatible** — supports Solidity, Hardhat, Foundry, Viem, Ethers
- Chain ID: **5042002**
- RPC: **https://rpc.testnet.arc.io**
- Explorer: **https://testnet.arcscan.app**
- Built and maintained by **Circle**
- Currently on **Testnet** — Mainnet coming soon
- Supports opt-in privacy and post-quantum security roadmap`,

usdc: `**USDC — USD Coin:**
- Issued by **Circle** — US regulated financial company
- Always = **$1.00 USD** — fully pegged stablecoin
- Backed 1:1 by USD in US regulated bank accounts
- Reserves are attested by independent accountants
- On Arc: USDC is the **native gas token** with 18 decimals
- ERC-20 interface uses **6 decimals**
- Arc Testnet Contract: **0x3600000000000000000000000000000000000000**
- Get free testnet USDC: **https://faucet.circle.com**
- Works in any country where you can hold a wallet`,

eurc: `**EURC — Euro Coin:**
- Issued by **Circle** — euro-denominated stablecoin
- Always = **1.00 EUR**. Rates change daily. Check Binance P2P or the live rate shown in the app.
- Arc Testnet Contract: **0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a**
- Uses **6 decimals**
- Get testnet EURC free: **https://faucet.circle.com**
- Perfect for EU client payments`,

circle: `**Circle — The Company Behind ArcLance:**
- Founded **2013** — US financial technology company
- Headquarters: **Boston, Massachusetts, USA**
- Issues **USDC** and **EURC** stablecoins
- Regulated by US financial authorities
- Partners: **Coinbase, BlackRock, Visa, Mastercard**
- Products: USDC, EURC, Circle Wallets, CCTP, Arc Network, App Kit
- Website: **circle.com**
- Developer docs: **developers.circle.com**`,

arclance: `**ArcLance — Get Paid Globally in USDC:**
- Borderless payment platform for **freelancers worldwide**
- Built on **Arc Network** (Layer-1 by Circle)
- Powered by **Circle USDC**
- No ArcLance fee. You pay only the network fee, in USDC
- **Settles in seconds** (SWIFT can take days)
- Works in **Pakistan, India, Bangladesh, Nigeria** and anywhere you can hold a wallet
- Features: Send, Receive, Swap, Bridge, Invoices, Pay Link, AI Assistant
- Self-custodial — **only you control your funds**
- No bank account needed
- Alternative to PayPal, Payoneer, Wise for developing countries`,

bridge: `**Bridge Assets via Circle CCTP:**
- Bridge USDC between any two of these ${BRIDGE_CHAINS.length} testnets: **${BRIDGE_CHAINS.map((c) => c.name).join(', ')}**
- Uses **Circle CCTP** (Cross-Chain Transfer Protocol)
- Bridge fee: shown on the Bridge page before you confirm
- Time: **~15 minutes**
- CCTP Contract: **0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA**
- Bridge EURC between any two of: **${BRIDGE_CHAINS.filter((c) => c.eurc).map((c) => c.name).join(', ')}**
- Route shown in Bridge tab`,

swap: `**Swap Tokens on Arc:**
- Swap USDC ↔ EURC on Arc Testnet (USDC and EURC only)
- Powered by **Circle StableFX**
- You get one fixed-rate quote that stays valid until it expires
- The page shows the rate, minimum received, fee and expiry
- The swap itself needs no gas; the approval costs a little USDC`,

wallet: `**Wallet Setup for Arc Testnet:**
- Supported: **MetaMask, Rabby, OKX, Phantom, SubWallet**
- Network Name: Arc Testnet
- Chain ID: **5042002**
- RPC URL: **https://rpc.testnet.arc.io**
- Currency Symbol: **USDC**
- Explorer: **https://testnet.arcscan.app**
- Click CONNECT in ArcLance — network adds automatically
- Get free USDC: **https://faucet.circle.com**`,

fees: `**Fee Comparison:**
- **ArcLance: no percentage cut**, only the flat network fee in USDC
- PayPal, Payoneer and marketplaces: a percentage plus fixed fees
- Wise: a percentage fee
- SWIFT bank transfer: a flat fee per transfer, often $25 or more

Check each provider for its current fees. ArcLance takes no cut:
- ArcLance takes **no cut**, only the network fee `,

pakistan: `**Pakistan Freelancer Guide:**
- PayPal is restricted in Pakistan — ArcLance solves this!
- Receive USDC from any client globally
- **Withdraw to PKR:**
  1. Receive USDC in ArcLance wallet
  2. Send to Binance or OKX exchange
  3. Sell via P2P trading
  4. Receive PKR to EasyPaisa, JazzCash, or bank
- Rates move daily. Check Binance P2P for current prices
- No bank account required to receive payment
- Works for Upwork, Fiverr, and direct clients`,

india: `**India Freelancer Complete Guide:**
- PayPal works but has high fees — ArcLance is better!
- Receive USDC from US, UK, EU clients instantly

**Withdraw USDC to INR:**
Step 1: Receive USDC in ArcLance wallet
Step 2: Send USDC to WazirX, CoinDCX, or Binance India
Step 3: Sell USDC on P2P or exchange
Step 4: Withdraw INR to bank account or UPI

**Popular exchanges for India:**
- WazirX — most popular in India
- CoinDCX — easy KYC
- Binance P2P — best rates

**Rates:** move daily, check P2P for current prices
**Fees saved:** PayPal charges 4.4% → ArcLance charges no percentage, only the flat network fee
**Settlement:** seconds, no holding period
**Works with:** Upwork, Fiverr, direct clients
**Supported banks:** All Indian banks, UPI, PhonePe, GPay`,

bangladesh: `**Bangladesh Freelancer Complete Guide:**
- Payoneer works but slow — ArcLance is instant!
- Useful for freelancers in Bangladesh

**Withdraw USDC to BDT:**
Step 1: Receive USDC in ArcLance wallet
Step 2: Send USDC to Binance P2P
Step 3: Sell to local P2P trader
Step 4: Receive BDT via bKash, Nagad, or bank

**Popular methods for Bangladesh:**
- Binance P2P — most used
- OKX P2P — good rates
- Local crypto traders — fastest

Rates change daily. Check Binance P2P or the live rate shown in the app.
**Fees saved:** Payoneer charges 2% → ArcLance charges no percentage, only the flat network fee
**Settlement:** seconds
**Works with:** Upwork, Fiverr, 99designs, direct clients
**Supported:** bKash, Nagad, Dutch Bangla, all banks`,

nigeria: `**Nigeria Freelancer Complete Guide:**
- PayPal is heavily restricted in Nigeria — ArcLance is the solution!
- Millions of Nigerian freelancers face payment problems — not anymore!

**Withdraw USDC to NGN:**
Step 1: Receive USDC in ArcLance wallet
Step 2: Send USDC to Binance P2P or Quidax
Step 3: Sell to local P2P buyer
Step 4: Receive NGN to GTBank, Access, Zenith, or any bank

**Popular exchanges for Nigeria:**
- Binance P2P — best rates and most traders
- Quidax — Nigerian exchange, easy KYC
- Yellow Card — popular in West Africa
- Bybit P2P — alternative option

Rates change daily. Check Binance P2P or the live rate shown in the app.
**Fees saved:** PayPal not available → ArcLance works perfectly!
**Settlement:** seconds
**Languages supported:** English, Yoruba, Igbo, Hausa
**Works with:** Upwork, Fiverr, Toptal, direct clients
**Supported banks:** GTBank, Access, Zenith, UBA, First Bank`,

security: `**Why ArcLance is Safe:**
- **Self-custodial** — only you hold your private keys
- ArcLance never holds your funds and cannot freeze them. USDC itself is issued by Circle, which can blacklist addresses under its own policies.
- Built on **Arc Network** — EVM Layer-1 blockchain
- Powered by **Circle regulated USDC** — reserves attested by independent accountants
- All transactions visible on **testnet.arcscan.app**
- Open source blockchain — fully transparent
- No middleman between you and your client`,

howto: `**Getting Started — Step by Step:**
1. Install **MetaMask** from metamask.io
2. Click **CONNECT** in ArcLance — Arc Testnet adds automatically
3. Get free test USDC: **https://faucet.circle.com**
4. Go to **Invoices** — create your first invoice
5. Share **Pay Link** with your client
6. Client clicks link, connects wallet, pays USDC
7. USDC arrives in seconds
8. Withdraw via Binance P2P to local currency`,

faucet: `**Get Free Test USDC:**
- Official faucet: **https://faucet.circle.com**
- Select: **Arc Testnet** as network
- Select: **USDC** as token
- Enter your wallet address
- Click Send — USDC arrives instantly!
- Also get free EURC from same faucet
- Use for testing Send, Swap, Bridge, Invoice features`,

invoice: `**Create & Send Invoices:**
1. Go to **INVOICES** tab
2. Fill: Client Name, Your Name, Invoice #, Amount
3. Add service description and due date
4. Wallet address auto-fills when connected
5. Click **CREATE INVOICE** — sign in wallet
6. **Download PDF** or copy payment link
7. Share via **WhatsApp** or email
8. Client clicks PAY — USDC sent instantly!`,

failed: `**Transaction Failed? Fix It:**
1. Check USDC balance — need a little USDC for gas
2. Verify recipient address — must be **0x... 42 characters**
3. Confirm **Arc Testnet** in wallet (Chain ID: 5042002)
4. Check transaction: **https://testnet.arcscan.app**
5. Disconnect wallet → reconnect → try again
6. Refresh page if stuck on loading
7. Need help? **discord.gg/buildonarc**`
};

let lastTopic = null;

const arcElaborations = {
  arc: `\n\n**Deep Dive into Arc L1 Protocol:**
- **Consensus Mech:** Fast finality Tendermint-based core.
- **Gas Model:** Protocol-level fee conversion where USDC is native, making user experience incredibly smooth.
- **EVM Layer:** Full opcode equivalence. You can deploy any Ethereum contract without modifications.`,
  usdc: `\n\n**USDC Security & Regulatory Status:**
- USDC reserves are stored strictly in cash and short-term US Treasury bills, managed under the supervision of US regulators.
- Monthly reserve reports are fully public, giving complete confidence of solvency.`,
  eurc: `\n\n**EURC Multi-currency invoices:**
- EURC is fully MiCA-compliant and operates perfectly across the entire eurozone.
- Issuing EURC invoices allows European clients to pay from any SEPA-linked or Euro stablecoin account with zero currency markup.`,
  circle: `\n\n**Circle's Vision:**
- Circle aims to raise global economic prosperity through the frictionless exchange of value.
- Their developer platform includes Programmable Wallets, Smart Contract Platform, and Cross-Chain Transfer Protocol (CCTP).`,
  arclance: `\n\n**The Future of ArcLance:**
- ArcLance aims to integrate native cryptocurrency off-ramps directly into the app dashboard.
- This allows freelancers to go from direct client billing to local fiat currency in easy, secure clicks without ever leaving the platform.`,
  bridge: `\n\n**CCTP Mechanics Details:**
- Unlike custodial multi-sig bridges that lock funds in smart contracts, Circle CCTP has zero systemic smart contract vault risk.
- Since tokens are burnt on the source chain and minted fresh on the destination chain, there are no locked pools that can be hacked.`,
  swap: `\n\n**If a swap does not go through:**
- Check your wallet is on Arc Testnet.
- Check the amount and your balance.
- Request a new quote.`,
  wallet: `\n\n**Supported Web3 features:**
- EIP-6963 multi-wallet detection standard prevents wallet extensions from hijacking one another.
- Make sure to keep the RPC URL configured correctly for smooth testnet transactions.`,
  fees: `\n\n**Saving Hundreds per Month:**
- Marketplaces and payment services charge a percentage of each payment.
- ArcLance takes no cut. You pay only the network fee, in USDC.`,
  pakistan: `\n\n**Pakistan Cash Out Walkthrough:**
- Binance P2P supports bank transfer (Meezan, HBL, Allied), EasyPaisa, and JazzCash.
- P2P buyers are verified, and Binance acts as an escrow agent to ensure you get your PKR before the USDC is transferred.`,
  india: `\n\n**UPI Cash Out Walkthrough:**
- UPI transfer via CoinDCX or WazirX P2P is fast and widely supported in India.
- Keep in mind Indian tax regulations regarding Virtual Digital Assets (VDA) when off-ramping to fiat.`,
  bangladesh: `\n\n**Bangladesh bKash Walkthrough:**
- Binance P2P offers verified bKash and Nagad agents who transfer BDT directly.
- The transaction usually takes less than 5 minutes to fully reflect in your bKash wallet.`,
  nigeria: `\n\n**Nigeria Naira Walkthrough:**
- P2P is the main channel for Nigerian freelancers due to local banking restrictions.
- Binance P2P and Quidax are highly reliable and offer instant NGN bank transfers.`,
  security: `\n\n**Self-Custody vs Centralized Exchanges:**
- Centralized platforms (FTX, banks, etc.) can freeze your accounts or go bankrupt.
- With self-custody on ArcLance, you hold your own private keys. Even if the ArcLance website goes down, your funds are permanently safe on the blockchain.`,
  howto: `\n\n**Pro Freelancer Tips:**
- Send direct payment links on your social media profiles or email signature.
- Use Swap to convert a portion of USDC to EURC if you want to hedge against specific currencies.`,
  faucet: `\n\n**Faucet Troubleshooting:**
- If the faucet says "Rate limited", try again in 24 hours or ask in the Discord.
- Ensure your wallet address is copied exactly.`,
  invoice: `\n\n**Invoice PDF details:**
- Every invoice generated on ArcLance has a cryptographic signature hash attached.
- This creates permanent proof of invoice terms that cannot be forged.`,
  failed: `\n\n**Gas Troubleshooting:**
- Since Arc Network uses USDC for gas, native USDC must be present in the wallet address.
- Standard Ethereum MetaMask wallets might show 'Insufficient ETH' if not configured to the Arc Testnet RPC correctly.`
};

function getLocalReply(msg) {
  const l = msg.toLowerCase().trim();

  // 1. ADD URDU RESPONSES (WALLETS, SEND, FAUCET, BALANCE)
  if (l.includes('والٹ') || l.includes('کنیکٹ')) {
    return "**والٹ کنیکٹ کرنے کا طریقہ:**\n• MetaMask یا Rabby انسٹال کریں\n• CONNECT بٹن دبائیں\n• Arc Testnet خود سیٹ ہو جائے گا\n• فری USDC لیں: faucet.circle.com";
  }
  if (l.includes('بھیجیں') || l.includes('سینڈ')) {
    return "**USDC بھیجنے کا طریقہ:**\n• PAYMENTS پیج پر جائیں\n• SEND ٹیب کھولیں\n• ایڈریس اور امونٹ ڈالیں\n• SEND TOKEN دبائیں\n• 2 سیکنڈ میں پہنچ جائے گا";
  }
  if (l.includes('فری') || l.includes('usdc ملے') || l.includes('فاسیٹ')) {
    return "**فری USDC لینے کا طریقہ:**\n• جائیں: faucet.circle.com\n• Arc Testnet سیلیکٹ کریں\n• اپنا والٹ ایڈریس ڈالیں\n• USDC فوری مل جائے گا!";
  }

  // Urdu balance / status response
  if (l.includes('بیلنس') || l.includes('میرا')) {
    const bal = WalletState.getTokenBal('USDC', 'ARC').toFixed(2);
    const addr = WalletState.getAddr();
    return addr ? 
      "آپ کا بیلنس: **" + bal + " USDC**\nوالٹ: " + addr.slice(0, 8) + "..." :
      "پہلے اپنا والٹ کنیکٹ کریں";
  }

  // 2. ADD URDU & ENGLISH CALCULATOR (Check this before generic 'کتنا' balance/Urdu check)
  const numMatch = l.match(/(\d+(?:\.\d+)?)/);
  if (numMatch && (l.includes('کتنے') || l.includes('کتنا') || l.includes('برابر') || l.includes('تبدیل') || l.includes('کو') || l.includes('میں')) && (l.includes('pkr') || l.includes('inr') || l.includes('bdt') || l.includes('ngn') || l.includes('usdc') || l.includes('usd') || l.includes('روپے') || l.includes('ٹکا') || l.includes('نائرا'))) {
    const amount = parseFloat(numMatch[1]);
    if (!ExchangeRates.PKR || !ExchangeRates.INR || !ExchangeRates.BDT || !ExchangeRates.NGN) return 'Live rates are unavailable right now, so I cannot convert. Try again in a moment.';
    const f = (r) => (amount * r).toLocaleString(undefined, {maximumFractionDigits: 2});
    const pkr = f(ExchangeRates.PKR), inr = f(ExchangeRates.INR), bdt = f(ExchangeRates.BDT), ngn = f(ExchangeRates.NGN);
    return `**${amount} USDC = PKR ${pkr} / INR ${inr} / BDT ${bdt} / NGN ${ngn}**`;
  }

  // Urdu 'کتنا' check fallback for balance if no number/calculator matched
  if (l.includes('کتنا')) {
    const bal = WalletState.getTokenBal('USDC', 'ARC').toFixed(2);
    const addr = WalletState.getAddr();
    return addr ? 
      "آپ کا بیلنس: **" + bal + " USDC**\nوالٹ: " + addr.slice(0, 8) + "..." :
      "پہلے اپنا والٹ کنیکٹ کریں";
  }

  // 3. ADD GREETINGS
  if (l === 'hi' || l === 'hello' || l === 'hey' || l === 'salam' || l === 'assalam' || l.startsWith('hi ') || l.startsWith('hello ') || l.startsWith('hey ') || l.startsWith('salam ') || l.startsWith('assalam ')) {
    if (WalletState.connected()) {
      const short = WalletState.getAddr().slice(0, 6) + '...' + WalletState.getAddr().slice(-4);
      return `Hey there, user **${short}**! Welcome back to ArcLance! How can I help you today?`;
    } else {
      return `Hello! Welcome to ArcLance! Please connect your wallet to view your personalized dashboard, or ask me any questions about the platform!`;
    }
  }

  // 4. ADD WALLET STATUS RESPONSE (ENGLISH)
  if (l.includes('my balance') || l.includes('how much usdc') || l.includes('my wallet')) {
    return "Your current balance: " + WalletState.getTokenBal('USDC', 'ARC').toFixed(2) + " USDC\n"
      + "Wallet: " + (WalletState.getAddr() || "Not connected") + "\n"
      + "Total USD value: $" + WalletState.getTotalUSD().toFixed(2) + (typeof eurcApprox === 'function' && eurcApprox() ? " (approximate, live rate unavailable)" : "");
  }

  // 5. ENGLISH CALCULATOR (Fallback in case it wasn't matched above)
  const calcMatch = l.match(/(\d+(?:\.\d+)?)\s*(?:usdc|usd)?\s*(?:to|in|into|for|is|equals)\s*(pkr|inr|bdt|ngn)/) || l.match(/(?:convert|change|how much is)\s*(\d+(?:\.\d+)?)\s*(?:usdc|usd)?\s*(?:to|in|into|for|is|equals)?\s*(pkr|inr|bdt|ngn)/);
  if (calcMatch) {
    const amount = parseFloat(calcMatch[1]);
    if (!ExchangeRates.PKR || !ExchangeRates.INR || !ExchangeRates.BDT || !ExchangeRates.NGN) return 'Live rates are unavailable right now, so I cannot convert. Try again in a moment.';
    const f = (r) => (amount * r).toLocaleString(undefined, {maximumFractionDigits: 2});
    const pkr = f(ExchangeRates.PKR), inr = f(ExchangeRates.INR), bdt = f(ExchangeRates.BDT), ngn = f(ExchangeRates.NGN);
    return amount + " USDC = PKR " + pkr + " / INR " + inr + " / BDT " + bdt + " / NGN " + ngn;
  }

  // 6. TRANSACTION HISTORY RESPONSE
  if (l.includes('last transaction') || l.includes('recent payment') || l.includes('my transactions') || l.includes('transaction history') || l.includes('what did i send')) {
    const txs = WalletState.getTxHistory().slice(0, 3);
    if (txs.length > 0) {
      return "Your recent transactions:\n" + txs.map(t => "• " + t.label + " → " + t.display).join("\n");
    } else {
      return "No transactions yet. Make your first payment!";
    }
  }

  // 7. FOLLOW-UP DETECTION
  if (l.includes('tell me more') || l.includes('explain') || l.includes('more details') || l.includes('elaborate')) {
    if (lastTopic && arcKnowledge[lastTopic]) {
      return arcKnowledge[lastTopic] + (arcElaborations[lastTopic] || "\n\nLet me know if you want to know about any other specific feature!");
    } else {
      return "I can elaborate on any topic! Try asking about *fees*, *security*, *Pakistan*, or *how to start* first.";
    }
  }

  // 8. IMPROVED KEYWORD MATCHING
  if (l.includes('how to send') || l.includes('send money') || l.includes('transfer') || l.includes('payment')) {
    lastTopic = 'invoice';
    return arcKnowledge.invoice;
  }
  if (l.includes('how to receive') || l.includes('get paid') || l.includes('receive money')) {
    lastTopic = 'howto';
    return arcKnowledge.howto;
  }
  if (l.includes('what is arc') || l.includes('arc network') || l.includes('arc blockchain')) {
    lastTopic = 'arc';
    return arcKnowledge.arc;
  }
  if (l.includes('mainnet') || l.includes('when mainnet') || l.includes('live when')) {
    return "Arc is currently on Testnet. Mainnet is coming soon! All your testing now will work on Mainnet too.";
  }
  if (l.includes('discord') || l.includes('support') || l.includes('help') || l.includes('contact')) {
    return "Need support? Join our Discord: discord.gg/buildonarc or check docs at docs.arc.io";
  }
  if (l.includes('thanks') || l.includes('thank you') || l.includes('شکریہ') || l.includes('جزاک اللہ')) {
    return "You're welcome! Let me know if you need anything else. Happy earning with ArcLance! ";
  }

  // Specific company/app
  if (l.includes('circle') || l.includes('who made') || l.includes('company')) {
    lastTopic = 'circle';
    return arcKnowledge.circle;
  }
  if (l.includes('arclance') || l.includes('this app') || l.includes('this platform') || l.includes('about')) {
    lastTopic = 'arclance';
    return arcKnowledge.arclance;
  }

  // Regional Guides
  if (l.includes('pakistan') || l.includes('pkr') || l.includes('easypaisa') || l.includes('jazzcash')) {
    lastTopic = 'pakistan';
    return arcKnowledge.pakistan;
  }
  if (l.includes('india') || l.includes('inr') || l.includes('upi') || l.includes('wazirx') || l.includes('coindcx') || l.includes('rupee')) {
    lastTopic = 'india';
    return arcKnowledge.india;
  }
  if (l.includes('bangladesh') || l.includes('bdt') || l.includes('bkash') || l.includes('nagad') || l.includes('taka') || l.includes('dhaka')) {
    lastTopic = 'bangladesh';
    return arcKnowledge.bangladesh;
  }
  if (l.includes('nigeria') || l.includes('ngn') || l.includes('naira') || l.includes('gtbank') || l.includes('quidax') || l.includes('lagos') || l.includes('yoruba') || l.includes('igbo') || l.includes('hausa') || l.includes('abuja')) {
    lastTopic = 'nigeria';
    return arcKnowledge.nigeria;
  }

  // General Questions
  if (l.includes('fee') || l.includes('cost') || l.includes('cheaper') || l.includes('paypal') || l.includes('fiverr') || l.includes('wise') || l.includes('compare')) {
    lastTopic = 'fees';
    return arcKnowledge.fees;
  }
  if (l.includes('safe') || l.includes('secure') || l.includes('trust') || l.includes('custodial') || l.includes('freeze')) {
    lastTopic = 'security';
    return arcKnowledge.security;
  }
  if (l.includes('start') || l.includes('begin') || l.includes('how to use') || l.includes('new') || l.includes('getting started')) {
    lastTopic = 'howto';
    return arcKnowledge.howto;
  }
  if (l.includes('bridge') || l.includes('cctp') || l.includes('cross chain')) {
    lastTopic = 'bridge';
    return arcKnowledge.bridge;
  }
  if (l.includes('eurc') || l.includes('euro')) {
    lastTopic = 'eurc';
    return arcKnowledge.eurc;
  }

  // Other topics
  if (l.includes('swap') || l.includes('convert') || l.includes('exchange')) {
    lastTopic = 'swap';
    return arcKnowledge.swap;
  }
  if (l.includes('wallet') || l.includes('setup') || l.includes('connect')) {
    lastTopic = 'wallet';
    return arcKnowledge.wallet;
  }
  if (l.includes('faucet') || l.includes('free usdc')) {
    lastTopic = 'faucet';
    return arcKnowledge.faucet;
  }
  if (l.includes('invoice') || l.includes('pdf') || l.includes('bill')) {
    lastTopic = 'invoice';
    return arcKnowledge.invoice;
  }
  if (l.includes('fail') || l.includes('error') || l.includes('problem') || l.includes('stuck')) {
    lastTopic = 'failed';
    return arcKnowledge.failed;
  }
  if (l.includes('usdc')) {
    lastTopic = 'usdc';
    return arcKnowledge.usdc;
  }
  if (l.includes('arc') || l.includes('chain')) {
    lastTopic = 'arc';
    return arcKnowledge.arc;
  }

  // 9. DEFAULT INTERACTIVE TOPIC BUTTONS
  return `I can help you with these topics:<br><br>
<button class="btn btn-sm btn-ghost" onclick="sendSuggested('getting started')" style="margin: 4px; display: inline-block;">Get Started</button>
<button class="btn btn-sm btn-ghost" onclick="sendSuggested('compare fees')" style="margin: 4px; display: inline-block;">Compare Fees</button>
<button class="btn btn-sm btn-ghost" onclick="sendSuggested('is it safe')" style="margin: 4px; display: inline-block;">Security</button>
<button class="btn btn-sm btn-ghost" onclick="sendSuggested('pakistan guide')" style="margin: 4px; display: inline-block;">🇵🇰 Pakistan Guide</button>
<button class="btn btn-sm btn-ghost" onclick="sendSuggested('wallet setup')" style="margin: 4px; display: inline-block;">Wallet Setup</button>`;
}

// MEMORY SYSTEM
const ChatMemory = (() => {
  const KEY = 'arclance_chat_history';

  function saveMessage(role, content) {
    let history = getHistory();
    history.push({
      role: role,
      content: content,
      timestamp: new Date().toISOString()
    });
    if (history.length > 50) history = history.slice(-50);
    localStorage.setItem(KEY, JSON.stringify(history));
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function restoreHistory() {
    const history = getHistory().slice(-10);
    const msgs = document.getElementById('chat-messages');
    if (!msgs) return;
    
    if (history.length > 0) {
      msgs.innerHTML = '';
      history.forEach(msg => {
        const isBot = msg.role === 'assistant' || msg.role === 'bot';
        const msgDiv = document.createElement('div');
        msgDiv.className = isBot ? 'msg bot' : 'msg user';
        if (isBot) {
          msgDiv.innerHTML = msg.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        } else {
          msgDiv.textContent = msg.content;
        }
        msgs.appendChild(msgDiv);
      });
      msgs.scrollTop = msgs.scrollHeight;
    }
  }

  function clearHistory() {
    localStorage.removeItem(KEY);
    showToast('Chat history cleared!');
  }

  return { saveMessage, getHistory, restoreHistory, clearHistory };
})();

function getCurrentPage() {
  const activePage = document.querySelector('.page.active');
  return activePage ? activePage.id.replace('page-', '') : 'home';
}

async function streamText(element, fullText, msgsContainer) {
  const words = fullText.split(/(\s+)/);
  let currentText = "";
  for (let i = 0; i < words.length; i++) {
    currentText += words[i];
    const formatted = currentText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    element.innerHTML = formatted;
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
    await new Promise(r => setTimeout(r, 20));
  }
}

function saveChatHistory() {
  const msgs = document.getElementById('chat-messages');
  if(msgs) localStorage.setItem('arclance_chat', msgs.innerHTML);
}
function loadChatHistory() {
  const saved = localStorage.getItem('arclance_chat');
  const msgs = document.getElementById('chat-messages');
  if(saved && msgs) msgs.innerHTML = saved;
}

// ── Assistant brain: AI service when configured (server-side key), built-in guide otherwise ──
function assistantContext() {
  const ws = typeof WalletState !== 'undefined' ? WalletState : null;
  const connected = !!(ws && ws.connected());
  return {
    connected,
    balances: connected ? { USDC: ws.getUSDC(), EURC: ws.getEURC(), cirBTC: ws.getCIRBTC() } : null,
    addresses: { usdc: ARC.tokens.USDC, eurc: ARC.tokens.EURC, escrow: ESCROW_ADDRESS, p2p: P2P_ADDRESS },
    explorerUrl: ARC.explorerUrl,
    faucetUrl: ARC.faucetUrl,
    chainId: ARC.chainId,
    bridgeNetworks: BRIDGE_CHAINS.map((c) => c.name),
    eurcNetworks: BRIDGE_CHAINS.filter((c) => c.eurc).map((c) => c.name),
  };
}

const aiHistory = [];
let aiMode = sessionStorage.getItem('arclance_ai_mode') || 'unknown'; // 'service' | 'local' | 'unknown'

async function askService(text) {
  const ctx = assistantContext();
  const known = [ctx.addresses.usdc, ctx.addresses.eurc, ctx.addresses.escrow, ctx.addresses.p2p].filter(Boolean);
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [...aiHistory.slice(-8), { role: 'user', content: text }], knownAddresses: known }),
  });
  if (resp.status === 503 || resp.status === 404 || resp.status === 405) { aiMode = 'local'; sessionStorage.setItem('arclance_ai_mode', 'local'); throw new Error('not_configured'); }
  if (!resp.ok) throw new Error('service_error');
  const json = await resp.json();
  if (!json || typeof json.reply !== 'string') throw new Error('service_error');
  aiMode = 'service';
  return json.reply;
}

// Local answers are app-written content (trusted HTML). Service answers are escaped before display.
function localReply(text) {
  if (/[\u0600-\u06ff]/.test(text)) return getLocalReply(text); // Urdu answers from the original guide
  const a = answer(text, assistantContext());
  if (a.matched) return a.text;
  // Country guides and the fee comparison still come from the original guide
  if (/pakistan|india|bangladesh|nigeria|compare fees|fees comparison|paypal|fiverr/i.test(text)) return getLocalReply(text);
  return NO_MATCH_TEXT;
}

async function getReply(text) {
  // Secrets, balances and rates are always answered locally: nothing sensitive leaves the browser and nothing is guessed.
  const first = looksLikeSecret(text) ? { topic: 'secrets', matched: true } : answer(text, assistantContext());
  if (first.matched && ['secrets', 'balance', 'rates'].includes(first.topic)) return { text: first.text ?? answer(text, assistantContext()).text, note: '', trusted: true };
  if (aiMode !== 'local') {
    try {
      const reply = await askService(text);
      aiHistory.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
      return { text: reply, note: '', trusted: false };
    } catch { /* fall through to the built-in guide */ }
  }
  return { text: localReply(text), note: FALLBACK_NOTE, trusted: true };
}

let chatBusy = false;
async function sendChat() {
  const input = document.getElementById('chat-input');
  const msgs = document.getElementById('chat-messages');
  const text = input.value.trim();
  if (!text || chatBusy) return;
  chatBusy = true;
  const sendBtn = document.querySelector('.btn-chat-send');
  if (sendBtn) sendBtn.disabled = true;
  const userMsg = document.createElement('div');
  userMsg.className = 'msg user';
  userMsg.textContent = text.length > 600 ? text.slice(0, 600) + '…' : text;
  msgs.appendChild(userMsg);
  input.value = '';
  msgs.scrollTop = msgs.scrollHeight;
  const thinking = document.createElement('div');
  thinking.className = 'msg bot';
  thinking.innerHTML = '<span class="spinner"></span> Thinking...';
  msgs.appendChild(thinking);
  msgs.scrollTop = msgs.scrollHeight;
  try {
    const { text: reply, note, trusted } = await getReply(text);
    const safe = trusted ? String(reply) : String(reply).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    thinking.innerHTML = safe
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      + (note ? `<div style="font-size:10px;color:var(--text2);margin-top:8px;opacity:.8">${note}</div>` : '');
  } catch {
    thinking.textContent = 'Something went wrong. Please try again.';
  }
  msgs.scrollTop = msgs.scrollHeight;
  saveChatHistory();
  chatBusy = false;
  if (sendBtn) sendBtn.disabled = false;
}

function sendSuggested(text) {
  document.getElementById('chat-input').value = text;
  navigate('ai', document.querySelector('.nav-item[onclick*="\'ai\'"]'));
  setTimeout(sendChat, 100);
}

function clearChat() {
  document.getElementById('chat-messages').innerHTML='<div class="msg bot">Hey! I\'m your <strong>ArcLance AI</strong> assistant.<br><br>Ask me anything about wallet setup, Arc Testnet, USDC payments, swaps, bridges, or invoices.</div>';
}

function clearChatHistory() {
  ChatMemory.clearHistory();
  clearChat();
}


publish({ arcKnowledge, arcElaborations, getLocalReply, ChatMemory, getCurrentPage, streamText, saveChatHistory, loadChatHistory, sendChat, sendSuggested, clearChat, clearChatHistory });
