// ArcLance StableFX proxy.
//
// Circle's StableFX API needs a secret API key, so the browser never talks to Circle directly. This function reads
// the key from the SERVER environment only and forwards a small, validated set of requests (quote, trade, funding
// presign, fund, trade status):
//
//   STABLEFX_API_KEY  required. Circle API key in the format  TEST_API_KEY:<id>:<secret>  (StableFX read and write).
//   STABLEFX_ENV      optional. Only "sandbox" (the default) is accepted: this app is testnet-only, so a LIVE key or
//                     any production setting is refused. Sandbox executes against Arc Testnet.
//
// Neither name has a VITE_ prefix, so neither is ever bundled into the frontend. The key is never logged or returned.
// Runs as a Vercel serverless function (api/stablefx.js) and, in development, through a Vite middleware.

const SANDBOX_URL = 'https://api-sandbox.circle.com';
const BASE_PATH = '/v1/exchange/stablefx';
const CURRENCIES = new Set(['USDC', 'EURC']);
const KEY_FORMAT = /^(TEST_API_KEY|LIVE_API_KEY):([A-Za-z0-9._-]+):([A-Za-z0-9._-]+)$/;
const hits = new Map();
let probeCache = { at: 0, result: null, httpStatus: null, keyTag: '' };

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 40000) throw new Error('too_large');
  }
  return raw ? JSON.parse(raw) : {};
}

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 60;
}

/** Work out what the environment allows. Never returns the key itself except to the upstream call. */
export function resolveConfig(env) {
  const key = String(env.STABLEFX_API_KEY || '').trim();
  if (!key) return { state: 'not_configured' };
  if (env.STABLEFX_ENV && String(env.STABLEFX_ENV).trim().toLowerCase() !== 'sandbox') return { state: 'mainnet_blocked' };
  const m = KEY_FORMAT.exec(key);
  if (!m) return { state: 'invalid_format' };
  if (m[1] === 'LIVE_API_KEY') return { state: 'mainnet_blocked' };
  return { state: 'ready', key, baseUrl: SANDBOX_URL, environment: 'sandbox' };
}

const isAddress = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
const isUuid = (v) => typeof v === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
const isAmount = (v) => typeof v === 'string' && /^\d{1,12}(\.\d{1,6})?$/.test(v) && Number(v) > 0;
const isSignature = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{130,}$/.test(v) && v.length < 400;
const isDigits = (v) => typeof v === 'string' && /^\d{1,30}$/.test(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A Permit2 message must have the documented shape before we forward it. */
function isPermit2Message(m) {
  return isObject(m) && isObject(m.permitted) && isAddress(m.permitted.token) && m.permitted.amount !== undefined
    && isAddress(m.spender) && m.nonce !== undefined && m.deadline !== undefined && isObject(m.witness);
}

async function upstream(cfg, fetchImpl, method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const resp = await fetchImpl(`${cfg.baseUrl}${BASE_PATH}${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.key}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let json = null;
    const text = await resp.text();
    if (text) { try { json = JSON.parse(text); } catch { json = null; } }
    return { status: resp.status, json };
  } catch {
    return { status: 599, json: null }; // network failure or timeout: reported as "unreachable", with no details
  } finally { clearTimeout(timer); }
}

/** Map a Circle error response to a safe answer for the browser. */
function failure(res, up) {
  if (up.status === 401 || up.status === 403) return send(res, 403, { error: 'access_denied' });
  if (up.status === 429) return send(res, 429, { error: 'rate_limited' });
  if (up.status >= 400 && up.status < 500) {
    const message = up.json && typeof up.json.message === 'string' ? up.json.message.slice(0, 200) : 'Circle rejected the request.';
    return send(res, 400, { error: 'rejected', message });
  }
  return send(res, 502, { error: 'upstream_unreachable' });
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));

async function probeAccess(cfg, fetchImpl) {
  const tag = cfg.key.slice(-6);
  if (probeCache.result && probeCache.keyTag === tag && Date.now() - probeCache.at < 60000) return { result: probeCache.result, httpStatus: probeCache.httpStatus };
  let result;
  let httpStatus = null;
  try {
    const up = await upstream(cfg, fetchImpl, 'GET', '/trades?pageSize=1');
    httpStatus = up.status;
    // 2xx: key accepted. 401/403 and other 4xx (except 429): Circle answered and refused. 429/5xx/network: try again later.
    result = up.status >= 200 && up.status < 300 ? 'ok'
      : up.status >= 400 && up.status < 500 && up.status !== 429 ? 'denied' : 'unreachable';
  } catch { result = 'unreachable'; }
  probeCache = { at: Date.now(), result, httpStatus, keyTag: tag };
  return { result, httpStatus };
}

export default async function handler(req, res, env = process.env, fetchImpl = fetch) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    const ip = String((req.headers && (req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress))) || 'unknown').split(',')[0];
    if (limited(ip)) return send(res, 429, { error: 'rate_limited' });
    const body = await readJson(req);
    const action = body && body.action;
    const cfg = resolveConfig(env);

    if (action === 'status') {
      if (cfg.state !== 'ready') return send(res, 200, { configured: false, state: cfg.state });
      const { result: access, httpStatus } = await probeAccess(cfg, fetchImpl);
      return send(res, 200, { configured: true, state: access === 'ok' ? 'ready' : access === 'denied' ? 'access_denied' : 'unreachable', httpStatus, environment: cfg.environment });
    }
    if (cfg.state !== 'ready') return send(res, 503, { error: 'not_configured', state: cfg.state });

    if (action === 'quote') {
      const { from, to, amount, address } = body;
      if (!CURRENCIES.has(from) || !CURRENCIES.has(to) || from === to) return send(res, 400, { error: 'bad_request', message: 'Choose USDC and EURC.' });
      if (!isAmount(amount)) return send(res, 400, { error: 'bad_request', message: 'Enter a valid amount.' });
      if (!isAddress(address)) return send(res, 400, { error: 'bad_request', message: 'Invalid wallet address.' });
      const up = await upstream(cfg, fetchImpl, 'POST', '/quotes', { from: { currency: from, amount }, to: { currency: to }, tenor: 'instant', type: 'tradable', recipientAddress: address });
      if (up.status !== 200 && up.status !== 201) return failure(res, up);
      return send(res, 200, pick(up.json, ['id', 'rate', 'from', 'to', 'createdAt', 'expiresAt', 'fee', 'collateral', 'typedData']));
    }

    if (action === 'trade') {
      const { idempotencyKey, quoteId, address, message, signature } = body;
      if (!isUuid(idempotencyKey) || !isUuid(quoteId)) return send(res, 400, { error: 'bad_request', message: 'Invalid quote.' });
      if (!isAddress(address) || !isSignature(signature) || !isPermit2Message(message)) return send(res, 400, { error: 'bad_request', message: 'Invalid signature data.' });
      const up = await upstream(cfg, fetchImpl, 'POST', '/trades', { idempotencyKey, quoteId, address, message, signature });
      if (up.status !== 200 && up.status !== 201) return failure(res, up);
      return send(res, 200, pick(up.json, ['id', 'contractTradeId', 'status', 'rate', 'from', 'to', 'fee', 'quoteId', 'createDate']));
    }

    if (action === 'fundingPresign') {
      if (!isDigits(body.contractTradeId)) return send(res, 400, { error: 'bad_request', message: 'Invalid trade.' });
      const up = await upstream(cfg, fetchImpl, 'POST', '/signatures/funding/presign', { contractTradeIds: [body.contractTradeId], type: 'taker' });
      if (up.status !== 200 && up.status !== 201) return failure(res, up);
      return send(res, 200, pick(up.json, ['typedData', 'deliverables', 'receivables']));
    }

    if (action === 'fund') {
      if (!isSignature(body.signature) || !isPermit2Message(body.permit2)) return send(res, 400, { error: 'bad_request', message: 'Invalid signature data.' });
      const up = await upstream(cfg, fetchImpl, 'POST', '/fund', { type: 'taker', signature: body.signature, permit2: body.permit2 });
      if (up.status < 200 || up.status >= 300) return failure(res, up);
      return send(res, 200, { ok: true });
    }

    if (action === 'tradeStatus') {
      if (!isUuid(body.tradeId)) return send(res, 400, { error: 'bad_request', message: 'Invalid trade.' });
      const up = await upstream(cfg, fetchImpl, 'GET', `/trades/${body.tradeId}`);
      if (up.status !== 200) return failure(res, up);
      return send(res, 200, pick(up.json, ['id', 'contractTradeId', 'status', 'rate', 'from', 'to', 'fee', 'settlementTransactionHash', 'updateDate', 'completeDate']));
    }

    return send(res, 400, { error: 'bad_request', message: 'Unknown action.' });
  } catch {
    // Never include error details: they could echo request headers.
    return send(res, 500, { error: 'server_error' });
  }
}
