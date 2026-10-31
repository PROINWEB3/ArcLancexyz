// Tests for api/stablefx.js with a mocked Circle API. No real key or network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler, { resolveConfig } from '../api/stablefx.js';

const KEY = 'TEST_API_KEY:abc123:def456secret';
const ENV = { STABLEFX_API_KEY: KEY };
const ADDR = '0x1111111111111111111111111111111111111111';
const UUID = '11111111-2222-4333-8444-555555555555';
const SIG = '0x' + 'ab'.repeat(65);
let ipCounter = 0;

async function call(body, { env = ENV, fetchImpl, method = 'POST' } = {}) {
  const req = Object.assign(new Readable({ read() {} }), { method, headers: { 'x-forwarded-for': `10.0.0.${++ipCounter % 250}` }, body });
  const out = { status: 0, body: '' };
  const res = { setHeader() {}, end(s) { out.body = s; }, set statusCode(v) { out.status = v; }, get statusCode() { return out.status; } };
  await handler(req, res, env, fetchImpl);
  return { status: out.status, json: out.body ? JSON.parse(out.body) : null, raw: out.body };
}

const reply = (status, json) => ({ status, text: async () => (json === undefined ? '' : JSON.stringify(json)) });
const recorder = (responder) => {
  const calls = [];
  const fn = async (url, opts) => { calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null }); return responder(url, opts, calls); };
  fn.calls = calls;
  return fn;
};

test('configuration states', () => {
  assert.equal(resolveConfig({}).state, 'not_configured');
  assert.equal(resolveConfig({ STABLEFX_API_KEY: '   ' }).state, 'not_configured');
  assert.equal(resolveConfig({ STABLEFX_API_KEY: 'nonsense' }).state, 'invalid_format');
  assert.equal(resolveConfig({ STABLEFX_API_KEY: 'LIVE_API_KEY:a:b' }).state, 'mainnet_blocked', 'LIVE keys execute on mainnet and are refused');
  assert.equal(resolveConfig({ STABLEFX_API_KEY: KEY, STABLEFX_ENV: 'production' }).state, 'mainnet_blocked');
  const ok = resolveConfig({ STABLEFX_API_KEY: KEY, STABLEFX_ENV: 'sandbox' });
  assert.equal(ok.state, 'ready');
  assert.equal(ok.baseUrl, 'https://api-sandbox.circle.com');
});

test('status: not configured never calls Circle', async () => {
  const f = recorder(() => reply(200, {}));
  const r = await call({ action: 'status' }, { env: {}, fetchImpl: f });
  assert.deepEqual(r.json, { configured: false, state: 'not_configured' });
  assert.equal(f.calls.length, 0);
});

test('status: LIVE key is reported as blocked and never used', async () => {
  const f = recorder(() => reply(200, {}));
  const r = await call({ action: 'status' }, { env: { STABLEFX_API_KEY: 'LIVE_API_KEY:a:b' }, fetchImpl: f });
  assert.equal(r.json.configured, false);
  assert.equal(r.json.state, 'mainnet_blocked');
  assert.equal(f.calls.length, 0);
});

test('status: probes the sandbox with the key and reports access', async () => {
  const f = recorder(() => reply(200, { data: [] }));
  const r = await call({ action: 'status' }, { fetchImpl: f });
  assert.deepEqual(r.json, { configured: true, state: 'ready', httpStatus: 200, environment: 'sandbox' });
  assert.match(f.calls[0].url, /^https:\/\/api-sandbox\.circle\.com\/v1\/exchange\/stablefx\/trades\?pageSize=1$/);
  assert.equal(f.calls[0].headers.Authorization, `Bearer ${KEY}`);
  assert.ok(!r.raw.includes(KEY) && !r.raw.includes('def456secret'), 'the key is never returned');
});

test('status: Circle refusing access is reported as access_denied', async () => {
  // a different key tag so the access probe is not served from the cache
  const r = await call({ action: 'status' }, { env: { STABLEFX_API_KEY: 'TEST_API_KEY:other:zzzz9999' }, fetchImpl: recorder(() => reply(403, { message: 'forbidden' })) });
  assert.equal(r.json.state, 'access_denied');
  assert.equal(r.json.httpStatus, 403, 'the page can show what Circle answered');
});

test('actions are refused when not configured', async () => {
  const r = await call({ action: 'quote', from: 'USDC', to: 'EURC', amount: '10', address: ADDR }, { env: {}, fetchImpl: recorder(() => reply(200, {})) });
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'not_configured');
});

test('quote: validates input, then forwards exactly the documented body', async () => {
  const f = recorder(() => reply(200, { id: UUID, rate: '0.915', from: { currency: 'USDC', amount: '100' }, to: { currency: 'EURC', amount: '91.5' }, expiresAt: 'x', fee: { currency: 'EURC', amount: '0.1' }, typedData: { primaryType: 'PermitWitnessTransferFrom' }, secretField: 'drop me' }));
  for (const bad of [
    { from: 'USDT', to: 'EURC', amount: '10', address: ADDR },
    { from: 'USDC', to: 'USDC', amount: '10', address: ADDR },
    { from: 'USDC', to: 'EURC', amount: '-5', address: ADDR },
    { from: 'USDC', to: 'EURC', amount: '1e9', address: ADDR },
    { from: 'USDC', to: 'EURC', amount: '10.1234567', address: ADDR },
    { from: 'USDC', to: 'EURC', amount: '10', address: '0x123' },
  ]) {
    const r = await call({ action: 'quote', ...bad }, { fetchImpl: f });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal(f.calls.length, 0, 'invalid input never reaches Circle');
  const r = await call({ action: 'quote', from: 'USDC', to: 'EURC', amount: '100', address: ADDR }, { fetchImpl: f });
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls[0].body, { from: { currency: 'USDC', amount: '100' }, to: { currency: 'EURC' }, tenor: 'instant', type: 'tradable', recipientAddress: ADDR });
  assert.equal(f.calls[0].url, 'https://api-sandbox.circle.com/v1/exchange/stablefx/quotes');
  assert.equal(r.json.id, UUID);
  assert.equal(r.json.secretField, undefined, 'only known fields are returned');
});

test('trade, funding presign, fund and status forward correctly', async () => {
  const msg = { permitted: { token: ADDR, amount: '100000000' }, spender: ADDR, nonce: '1', deadline: '9999999999', witness: { id: '24' } };
  const f = recorder((url) => (url.endsWith('/trades') ? reply(201, { id: UUID, contractTradeId: '24', status: 'pending_settlement' })
    : url.endsWith('/presign') ? reply(200, { typedData: { message: msg }, deliverables: [] })
    : url.endsWith('/fund') ? reply(200) : reply(200, { id: UUID, status: 'complete', settlementTransactionHash: '0xabc' })));
  let r = await call({ action: 'trade', idempotencyKey: UUID, quoteId: UUID, address: ADDR, message: msg, signature: SIG }, { fetchImpl: f });
  assert.equal(r.json.contractTradeId, '24');
  assert.deepEqual(Object.keys(f.calls[0].body).sort(), ['address', 'idempotencyKey', 'message', 'quoteId', 'signature']);
  r = await call({ action: 'fundingPresign', contractTradeId: '24' }, { fetchImpl: f });
  assert.deepEqual(f.calls[1].body, { contractTradeIds: ['24'], type: 'taker' });
  assert.ok(r.json.typedData);
  r = await call({ action: 'fund', signature: SIG, permit2: msg }, { fetchImpl: f });
  assert.deepEqual(r.json, { ok: true });
  assert.deepEqual(f.calls[2].body, { type: 'taker', signature: SIG, permit2: msg });
  r = await call({ action: 'tradeStatus', tradeId: UUID }, { fetchImpl: f });
  assert.equal(r.json.settlementTransactionHash, '0xabc');
  assert.equal(f.calls[3].method, 'GET');
  // validation
  assert.equal((await call({ action: 'trade', idempotencyKey: 'x', quoteId: UUID, address: ADDR, message: msg, signature: SIG }, { fetchImpl: f })).status, 400);
  assert.equal((await call({ action: 'trade', idempotencyKey: UUID, quoteId: UUID, address: ADDR, message: { permitted: 1 }, signature: SIG }, { fetchImpl: f })).status, 400);
  assert.equal((await call({ action: 'fund', signature: '0x12', permit2: msg }, { fetchImpl: f })).status, 400);
  assert.equal((await call({ action: 'fundingPresign', contractTradeId: '1; drop' }, { fetchImpl: f })).status, 400);
  assert.equal((await call({ action: 'tradeStatus', tradeId: '../../x' }, { fetchImpl: f })).status, 400);
  assert.equal(f.calls.length, 4, 'invalid requests never reach Circle');
});

test('Circle errors are mapped without leaking anything', async () => {
  const q = { action: 'quote', from: 'USDC', to: 'EURC', amount: '100', address: ADDR };
  let r = await call(q, { fetchImpl: recorder(() => reply(401, { message: 'bad key ' + KEY })) });
  assert.equal(r.status, 403); assert.equal(r.json.error, 'access_denied'); assert.ok(!r.raw.includes('def456secret'));
  r = await call(q, { fetchImpl: recorder(() => reply(400, { message: 'Amount less than the minimum trade amount' })) });
  assert.equal(r.status, 400); assert.equal(r.json.error, 'rejected'); assert.match(r.json.message, /minimum trade amount/);
  r = await call(q, { fetchImpl: recorder(() => reply(429, {})) });
  assert.equal(r.status, 429);
  r = await call(q, { fetchImpl: recorder(() => reply(500, {})) });
  assert.equal(r.status, 502); assert.equal(r.json.error, 'upstream_unreachable');
  r = await call(q, { fetchImpl: async () => { throw new Error('socket hang up with ' + KEY); } });
  assert.equal(r.status, 502); assert.ok(!r.raw.includes('def456secret'));
});

test('method and action checks; the key is never logged', async () => {
  const logged = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => logged.push(a.join(' '));
  try {
    assert.equal((await call({}, { method: 'GET' })).status, 405);
    assert.equal((await call({ action: 'nope' })).status, 400);
    await call({ action: 'quote', from: 'USDC', to: 'EURC', amount: '100', address: ADDR }, { fetchImpl: async () => { throw new Error(KEY); } });
  } finally { Object.assign(console, orig); }
  assert.equal(logged.length, 0, 'the function writes nothing to the console');
});

test('status: any other 4xx from Circle is "denied", 429 and 5xx are "try again later"', async () => {
  const run = async (status, tag) => (await call({ action: 'status' }, { env: { STABLEFX_API_KEY: `TEST_API_KEY:id:${tag}` }, fetchImpl: recorder(() => reply(status, { message: 'x' })) })).json;
  const a = await run(404, 'tag40404'); assert.equal(a.state, 'access_denied'); assert.equal(a.httpStatus, 404);
  const b = await run(429, 'tag42929'); assert.equal(b.state, 'unreachable'); assert.equal(b.httpStatus, 429);
  const c = await run(503, 'tag50303'); assert.equal(c.state, 'unreachable'); assert.equal(c.httpStatus, 503);
});
