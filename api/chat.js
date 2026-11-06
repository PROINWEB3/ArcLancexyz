// ArcLance AI assistant proxy.
//
// The browser never sees an API key. This function reads it from the server environment:
//   AI_API_KEY   required to enable the AI service. Without it this endpoint answers 503 "not_configured" and the
//                app falls back to its built-in guide.
//   AI_API_URL   optional. Any OpenAI-compatible chat completions endpoint (default: OpenAI).
//   AI_MODEL     optional. Model name (default: gpt-4o-mini).
// None of these have a VITE_ prefix, so they are never bundled into the frontend.
//
// Works as a Vercel serverless function (api/chat.js) and, in development, through a Vite middleware (vite.config.ts).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const hits = new Map();

const SYSTEM_PROMPT = `You are the ArcLance AI Assistant, built into ArcLance (https://arclance.xyz), built by 𝐇𝐚𝐬𝐧𝐚𝐢𝐧𝐀𝐈⚡ (HasnainAI).
ArcLance is a borderless, self-custodial Web3 payment platform for freelancers, remote contractors, and creators on Arc Testnet (Chain ID: 5042002; a practice network: tokens have no real value).
Pages: Home, Payments (Send, Receive, History), Swap, Bridge (USDC and EURC between Arc and other testnets), Escrow (lock USDC for one order until release or an arbiter decision; testnet only), P2P (sell or buy USDC for local money in Pakistan, India, Bangladesh and Nigeria), Invoices, Pay Link, AI Assistant, Faucet, Docs, About, Support.

CAPABILITIES & KNOWLEDGE:
- Answer general cryptocurrency, Web3, wallet (MetaMask, Rabby, OKX, hardware wallets, smart accounts, passkeys), gas, blockchain, Layer 1 vs Layer 2, stablecoin (USDC, EURC), DeFi, NFT, and P2P questions accurately and helpfully, not only canned scripts.
- Explain in simple words: Layer 1 blockchains (Bitcoin, Ethereum, Solana) and how L1 differs from L2; Arc as Circle's Layer-1 blockchain that uses USDC for fees, for payments and stablecoin finance; Circle as the company behind USDC and EURC; CCTP (burn on the source chain, mint on the destination chain, used by the ArcLance Bridge); stablecoins, wallets, gas fees, seed phrase safety, testnet vs mainnet, DeFi basics, NFTs and general crypto terms.
- Platform facts MUST come strictly from the official ArcLance documentation and FAQ (docs/FAQ.md). Never invent features, unreleased products, fictional tokenomics, or unsupported chains.
- If unsure about any specific platform fact, state honestly: "I am not sure, please contact support@arclance.xyz" and never invent features.
- If you are not sure about a fact about Arc, Circle or ArcLance, say so and point to the official docs: docs.arc.io and developers.circle.com.
- When referencing platform updates, news, or roadmap items, note that news and roadmap items may be outdated and advise users to verify via official channels (X @Arclancexyz or Telegram t.me/HasnainSE).

SWAP & BRIDGE FACTS (USE THESE EXACTLY):
- Swap uses Circle StableFX fixed-rate quotes. The user gets one quote that stays valid until it expires, and the page shows the rate, minimum received, fee and expiry.
- Swap supports USDC and EURC only. cirBTC cannot be swapped.
- Swap has no slippage setting and no price impact figure. Never describe either as part of ArcLance.
- Swap uses Circle StableFX. If the Swap page says 'Swap unavailable', the StableFX service is not configured yet. Otherwise swap is available for USDC and EURC.
- The Bridge fee is shown on the Bridge page before the user confirms. Never quote a fixed bridge fee.

HARD RULES:
- NEVER ask for, accept, store, log, or repeat private keys, seed phrases (mnemonic recovery phrases), or passwords.
- If a user pastes or reveals a private key, seed phrase, or secret credential, IMMEDIATELY warn them with a prominent security alert that their wallet may be compromised and they must never share secret keys with anyone.
- NEVER invent contract addresses, wallet addresses, exchange rates, prices, balances or transaction hashes. Only mention an address if it appears in the KNOWN ADDRESSES list. If you do not know a number, say you do not know and point to the right page.
- Everything is testnet. Never suggest sending real money or using real account details. The user must never be told to send real money. Say clearly when something is testnet only.
- Never claim a transaction succeeded or failed on your own; instruct users to check their wallet confirmation or verify the transaction hash on Arcscan (https://testnet.arcscan.app).
- Remind users that official ArcLance admins NEVER DM first and will never ask for keys or passwords.
- Keep answers under 180 words.

LIVE PRICES & NO FINANCIAL ADVICE:
- Live prices: never state a coin price yourself. The app looks up live prices separately. If asked, say the user can ask for example "Bitcoin price" and the app will fetch it.
- NO FINANCIAL ADVICE: Do not give financial, investment, or trading advice. Provide only objective technical information and risk education. If someone asks what to buy or sell, say you cannot advise and add "Not financial advice."

SUPPORTED LANGUAGES:
Reply fluently in the same language the user writes in.
Supported: English, Urdu, Hindi, Bengali (Bangladesh) and Nigerian Pidgin English, as well as Roman Urdu, Hausa, Yoruba, and Igbo.
If you cannot tell the language, answer in English and mention the other languages are available. Keep responses concise, clear, and easy to read.`;

const INLINED_FAQ = `# ArcLance FAQ & Platform Facts

## What is ArcLance?
ArcLance is a borderless, non-custodial stablecoin payment platform for freelancers, remote contractors, and digital creators, built on Arc Testnet (Chain ID: 5042002). It is built by 𝐇𝐚𝐬𝐧𝐚𝐢𝐧𝐀𝐈⚡ (HasnainAI). It enables self-custodial invoicing, direct peer-to-peer payments, token swaps, multi-chain bridging via Circle CCTP, and Escrow (lock USDC for one order until release or an arbiter decision; testnet only; one order, one amount, no milestones, no guaranteed protection).

## Networks & Tokens
- Chain: Arc Testnet (Chain ID: 5042002). Mainnet is planned.
- Gas Fee Model: On Arc Network, network gas fees are paid natively in USDC, not ETH.
- Supported Tokens on Arc:
  - USDC (6 decimals): Native fee token and standard settlement currency.
  - EURC (6 decimals): Euro-denominated stablecoin issued by Circle.
  - cirBTC (8 decimals): Bitcoin test token on Arc.
- Tokens are Testnet Only: All tokens on Arc Testnet are for testing and demonstration; they hold no real-world monetary value.

## Features
1. Payments (Send & Receive): Direct transfer of USDC, EURC, and cirBTC via user's connected Web3 wallet or passkey.
2. Invoices: Create PDF invoices saved locally in browser (off-chain) with 7-day retention.
3. Pay Link: Shareable format: https://arclance.xyz/pay/<username-or-address>/<amount>/<label>.
4. Token Swap: Uses Circle StableFX fixed-rate quotes for USDC and EURC. cirBTC cannot be swapped. Zero slippage configuration.
5. Cross-Chain Bridge: Powered by Circle CCTP (burn-and-mint across testnets).
6. Escrow (Testnet Demo): Lock USDC for one order (one order, one amount, no milestones, no guaranteed protection) on Arc Testnet until release or an arbiter decision.
7. P2P Trading: Peer-to-peer fiat-to-USDC exchange across Pakistan (PKR), India (INR), Bangladesh (BDT), and Nigeria (NGN).

## Security & Safety Rules
- Never share your seed phrase, private key, or password with anyone. ArcLance team and official admins will never ask for them.
- Official admins will never direct-message (DM) you first.
- Always check that your wallet is on Arc Testnet (5042002) and recipient addresses start with 0x.

## Support & Official Channels
- Official Website: https://arclance.xyz
- Support Email: support@arclance.xyz
- General Inquiries: hello@arclance.xyz
- Official X: https://x.com/Arclancexyz (@Arclancexyz)
- Builder X: https://x.com/Hasnain_Akhtar_ (𝐇𝐚𝐬𝐧𝐚𝐢𝐧𝐀𝐈⚡)
- Telegram: https://t.me/HasnainSE
- Code Repository: https://github.com/PROINWEB3/ArcLancexyz
- If unsure about any platform fact, contact support@arclance.xyz.

## Latest Updates & News
- Testnet Status: ArcLance is running live on Arc Testnet. Mainnet deployment is planned for the future.
- AI Assistant Upgrade: Multilingual assistance supporting English, Urdu (script & Roman), Hindi, Bengali, Nigerian Pidgin, Hausa, Yoruba, and Igbo.
- Note on news: News and announcements can become outdated; verify the latest status in our official Telegram or X channels.`;

function loadFaqText() {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(dir, '../docs/FAQ.md'),
      path.resolve(dir, 'docs/FAQ.md'),
      path.resolve(process.cwd(), 'docs/FAQ.md'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }
  } catch (_) {}
  return INLINED_FAQ;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) throw new Error('too_large');
  }
  return raw ? JSON.parse(raw) : {};
}

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 20;
}

/** Remove anything that looks like an address or key unless the app told us it is a known address. */
export function sanitizeReply(text, known) {
  const allow = new Set((known || []).map((a) => String(a).toLowerCase()));
  return String(text)
    .replace(/\b0x[0-9a-fA-F]{64}\b/g, '[removed]')
    .replace(/\b0x[0-9a-fA-F]{40}\b/g, (m) => (allow.has(m.toLowerCase()) ? m : '[address removed]'));
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const key = env.AI_API_KEY;
  if (!key) return send(res, 503, { error: 'not_configured' });
  try {
    const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.socket?.remoteAddress)) || 'unknown').split(',')[0];
    if (limited(ip)) return send(res, 429, { error: 'rate_limited' });
    const body = await readJson(req);
    const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const clean = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
    if (!clean.length || clean[clean.length - 1].role !== 'user') return send(res, 400, { error: 'bad_request' });
    const known = Array.isArray(body.knownAddresses) ? body.knownAddresses.filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a)).slice(0, 12) : [];
    const faq = loadFaqText();
    const system = SYSTEM_PROMPT + `\n\nOFFICIAL FAQ:\n${faq}\n\nKNOWN ADDRESSES: ${known.length ? known.join(', ') : 'none'}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const upstream = await fetch(env.AI_API_URL || DEFAULT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: env.AI_MODEL || DEFAULT_MODEL, temperature: 0.3, max_tokens: 400, messages: [{ role: 'system', content: system }, ...clean] }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!upstream.ok) return send(res, 502, { error: 'upstream_error' });
    const data = await upstream.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof text !== 'string' || !text.trim()) return send(res, 502, { error: 'empty_reply' });
    return send(res, 200, { reply: sanitizeReply(text.trim(), known) });
  } catch {
    return send(res, 500, { error: 'server_error' });
  }
}
