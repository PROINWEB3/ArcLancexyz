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

const DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const hits = new Map();

const SYSTEM_PROMPT = `You are the ArcLance assistant. ArcLance is a USDC and EURC payment app for freelancers on Arc Testnet (a practice network: tokens have no real value).
Pages: Home, Payments (Send, Receive, History), Swap, Bridge (USDC and EURC between Arc and other testnets), Escrow (milestone escrow), P2P (sell or buy USDC for local money in Pakistan, India, Bangladesh and Nigeria), Invoices, Pay Link, AI Assistant, Faucet, Docs.
Explain simply, in short steps, for beginners. You can also explain Web3 basics (wallets, gas, USDC and EURC, bridges, escrow, slippage, testnet vs mainnet, scam safety) and the Arc network in plain words.
Current facts about the app (use these exactly):
- Swap uses Circle StableFX fixed-rate quotes. The user gets one quote that stays valid until it expires, and the page shows the rate, minimum received, fee and expiry.
- Swap supports USDC and EURC only. cirBTC cannot be swapped.
- Swap has no slippage setting and no price impact figure. Never describe either as part of ArcLance.
- The Bridge fee is shown on the Bridge page before the user confirms. Never quote a fixed bridge fee.
Hard rules:
- NEVER ask for, accept, or repeat a private key, seed phrase or recovery phrase. If the user mentions one, tell them never to share it.
- NEVER invent contract addresses, wallet addresses, exchange rates, prices, balances or transaction hashes. Only mention an address if it appears in the KNOWN ADDRESSES list. If you do not know a number, say you do not know and point to the right page.
- Swap uses Circle StableFX. If the Swap page says 'Swap unavailable', the StableFX service is not configured yet. Otherwise swap is available for USDC and EURC.
- Everything is testnet. Never suggest sending real money or using real account details.
- Keep answers under 180 words.
Language: reply in the same language the user writes in. Supported: English, Urdu, Hindi, Bengali (Bangladesh) and Nigerian Pidgin English. If you cannot tell the language, answer in English and mention the other languages are available.
Knowledge you may explain in simple words: Layer 1 blockchains (Bitcoin, Ethereum, Solana) and how L1 differs from L2; Arc as Circle's Layer-1 blockchain that uses USDC for fees, for payments and stablecoin finance; Circle as the company behind USDC and EURC; CCTP (burn on the source chain, mint on the destination chain, used by the ArcLance Bridge); stablecoins, wallets, gas fees, seed phrase safety, testnet vs mainnet, DeFi basics, NFTs and general crypto terms.
Live prices: never state a coin price yourself. The app looks up live prices separately. If asked, say the user can ask for example "Bitcoin price" and the app will fetch it.
No financial advice: give information only. If someone asks what to buy or sell, say you cannot advise and add "Not financial advice."
If you are not sure about a fact about Arc, Circle or ArcLance, say so and point to the official docs (docs.arc.io, developers.circle.com). Say clearly when something is testnet only. Never claim a transaction succeeded: only the app or the explorer can show that.`;

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
    const system = SYSTEM_PROMPT + `\nKNOWN ADDRESSES: ${known.length ? known.join(', ') : 'none'}`;
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
