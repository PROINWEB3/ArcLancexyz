// End-to-end tests for the Swap page: the real page code, the real api/stablefx.js function, a mocked Circle API and a
// fake chain with a fake wallet. No real key, network or funds are used.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import nodeCrypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { appKitStub } from './helpers/appkit-stub-plugin.mjs';
import handler from '../api/stablefx.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USDC = '0x3600000000000000000000000000000000000000';
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const FX = '0xa8f94168b4981840ba27d423f4ad6332bedee006';
const ME = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const OTHER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const TEST_KEY = 'TEST_API_KEY:testid1234:testsecret5678';
let mountCount = 0;
const windows = [];
after(() => { windows.forEach((w) => { try { w.close(); } catch { /* already closed */ } }); });
const SIG1 = '0x' + '11'.repeat(65);
const SIG2 = '0x' + '22'.repeat(65);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Expected Permit2 EIP-712 domain separator for Arc Testnet (chain 5042002), the same value the real contract returns.
const SEPARATOR = '0xe59c8d3fa907f1186bfa334839eb895f53f88b07e4cf5aafaef4af163d83ce93';

const bundle = await build({
  entryPoints: [path.join(ROOT, 'src/legacy/index.js')], bundle: true, format: 'iife', write: false, logLevel: 'silent', plugins: [appKitStub],
  define: { 'import.meta.env': '{}' },
}).then((r) => r.outputFiles[0].text);
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('<script type="module" src="/src/main.tsx"></script>', '');

const hex = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const units = (s) => BigInt(Math.round(Number(s) * 1e6));
const trim = (u) => (Number(u) / 1e6).toString();

/** A mock of the parts of Circle's StableFX API the app uses. */
function makeCircle(opts = {}) {
  const c = {
    rate: opts.rate ?? 0.915, calls: [], quoteCount: 0, statuses: opts.statuses ?? ['taker_funded', 'complete'], statusIdx: 0,
    tamper: opts.tamper ?? null, accessDenied: !!opts.accessDenied, down: !!opts.down, fundingTamper: opts.fundingTamper ?? null, quoteFail: opts.quoteFail ?? null,
    async fetch(url, o) {
      if (c.down) throw new Error('network down');
      const u = String(url).replace('https://api-sandbox.circle.com/v1/exchange/stablefx', '');
      const body = o.body ? JSON.parse(o.body) : null;
      c.calls.push({ path: u, method: o.method, auth: o.headers.Authorization, body });
      const ok = (status, json) => ({ status, text: async () => (json === undefined ? '' : JSON.stringify(json)) });
      if (c.accessDenied) return ok(403, { message: 'forbidden' });
      if (u.startsWith('/trades?pageSize')) return ok(200, { data: [] });
      if (u === '/quotes' && c.quoteFail) { c.quoteCount += 1; return ok(c.quoteFail.status, { message: c.quoteFail.message }); }
      if (u === '/quotes') {
        c.quoteCount += 1;
        const fromTok = body.from.currency === 'USDC' ? USDC : EURC; const toTok = body.to.currency === 'USDC' ? USDC : EURC;
        const fromU = units(body.from.amount); const toU = BigInt(Math.round(Number(fromU) * c.rate));
        const id = nodeCrypto.randomUUID();
        let q = {
          id, rate: String(c.rate), from: { currency: body.from.currency, amount: body.from.amount }, to: { currency: body.to.currency, amount: trim(toU) },
          createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + (c.ttl ?? 5 * 60000)).toISOString(), fee: { currency: body.to.currency, amount: '0.5' },
          typedData: {
            domain: { name: 'Permit2', chainId: 5042002, verifyingContract: PERMIT2 },
            types: {
              EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
              Consideration: [{ name: 'quoteId', type: 'string' }], TraderDetails: [{ name: 'consideration', type: 'Consideration' }],
              TokenPermissions: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
              PermitWitnessTransferFrom: [{ name: 'permitted', type: 'TokenPermissions' }],
            },
            primaryType: 'PermitWitnessTransferFrom',
            message: {
              permitted: { token: fromTok, amount: String(fromU) }, spender: FX, nonce: '309585810', deadline: String(Math.floor(Date.now() / 1000) + 300),
              witness: { consideration: { quoteId: id, base: toTok, quote: fromTok, baseAmount: String(toU), quoteAmount: String(fromU), maturity: '1752148800' }, recipient: body.recipientAddress, fee: 80000, authorizer: '0x0000000000000000000000000000000000000000' },
            },
          },
        };
        if (c.tamper) q = c.tamper(q);
        return ok(200, q);
      }
      if (u === '/trades') return ok(201, { id: '9d1a3f5e-1111-4222-8333-444455556666', contractTradeId: '24', status: 'pending_settlement' });
      if (u === '/signatures/funding/presign') {
        const last = c.calls.findLast((x) => x.path === '/trades')?.body;
        const q = c.lastQuote;
        const fromTok = q.typedData.message.permitted.token;
        let fp = { typedData: { domain: { name: 'Permit2', chainId: 5042002, verifyingContract: PERMIT2 }, types: { EIP712Domain: [{ name: 'name', type: 'string' }], PermitWitnessTransferFrom: [{ name: 'permitted', type: 'TokenPermissions' }] }, primaryType: 'PermitWitnessTransferFrom', message: { permitted: { token: fromTok, amount: String(units(q.from.amount)) }, spender: FX, nonce: '42', deadline: String(Math.floor(Date.now() / 1000) + 300), witness: { id: '24' } } } };
        if (c.fundingTamper) fp = c.fundingTamper(fp);
        void last;
        return ok(200, fp);
      }
      if (u === '/fund') return ok(200);
      if (u.startsWith('/trades/')) {
        const s = c.statuses[Math.min(c.statusIdx++, c.statuses.length - 1)];
        return ok(200, { id: '9d1a3f5e-1111-4222-8333-444455556666', status: s, settlementTransactionHash: s === 'complete' ? '0x' + 'ee'.repeat(32) : null });
      }
      return ok(404, {});
    },
  };
  return c;
}

/** Open the app in a fake browser with a fake wallet, chain and Circle. */
async function mount({ env, circle = makeCircle(), balances = { USDC: 5000n * 10n ** 6n, EURC: 100n * 10n ** 6n }, sign = {} , account = ME } = {}) {
  // a fresh key per page: the function caches its access check per key for a minute
  env = env ?? { STABLEFX_API_KEY: `TEST_API_KEY:testid1234:testsecret${++mountCount}${Date.now()}` };
  const chain = { balances, allowance: 0n, sent: [], signed: [], chainId: '0x4cef52' };
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const rpc = async (method, params) => {
    if (method === 'eth_chainId') return chain.chainId;
    if (method === 'eth_getBalance') return '0x0';
    if (method === 'eth_getTransactionCount') return '0x0';
    if (method === 'eth_getCode') return '0x6001';
    if (method === 'eth_gasPrice' || method === 'eth_blockNumber') return '0x1';
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x1' };
    if (method === 'eth_call') {
      const { to, data } = params[0]; const sel = data.slice(0, 10);
      if (sel === '0x70a08231') return hex(to.toLowerCase() === USDC.toLowerCase() ? chain.balances.USDC : to.toLowerCase() === EURC.toLowerCase() ? chain.balances.EURC : 0n);
      if (sel === '0x313ce567') return hex(6);
      if (sel === '0xdd62ed3e') return hex(chain.allowance);
      if (sel === '0x3644e515') return SEPARATOR;
      return hex(0);
    }
    return null;
  };
  const dom = new JSDOM(HTML, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.crypto.randomUUID ??= () => nodeCrypto.randomUUID();
      w.localStorage.setItem('arclance_swap_route', 'stablefx'); // these tests cover the StableFX route
      w.__apiCalls = [];
      w.fetch = async (u, o = {}) => {
        const s = String(u);
        if (s.endsWith('/api/stablefx')) {
          const body = JSON.parse(o.body);
          w.__apiCalls.push(body);
          if (circle.down === 'function') throw new Error('function unreachable');
          const req = Object.assign(new Readable({ read() {} }), { method: 'POST', headers: { 'x-forwarded-for': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body });
          const out = { status: 0, body: '' };
          const res = { setHeader() {}, end(t) { out.body = t; }, set statusCode(v) { out.status = v; }, get statusCode() { return out.status; } };
          // the quote is remembered so the mock can build a matching funding request
          const wrapped = async (url, oo) => { const r = await circle.fetch(url, oo); if (String(url).endsWith('/quotes') && r.status === 200) circle.lastQuote = JSON.parse(await r.text()); return { status: r.status, text: async () => (r.status === 200 && String(url).endsWith('/quotes') ? JSON.stringify(circle.lastQuote) : r.text()) }; };
          await handler(req, res, env, wrapped);
          return { ok: out.status >= 200 && out.status < 300, status: out.status, json: async () => JSON.parse(out.body) };
        }
        if (s.includes('rpc.testnet.arc')) { const b = JSON.parse(o.body); return { ok: true, json: async () => ({ jsonrpc: '2.0', id: b.id, result: await rpc(b.method, b.params) }) }; }
        throw new Error('offline: ' + s.slice(0, 40));
      };
    },
  });
  const W = dom.window; const D = W.document; windows.push(W);
  W.addEventListener('error', (e) => errors.push(e.message));
  const provider = {
    on() {}, removeListener() {},
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') { chain.chainId = '0x4cef52'; return null; }
      if (method === 'eth_sendTransaction') {
        const tx = params[0]; chain.sent.push(tx);
        if (tx.data.startsWith('0x095ea7b3')) chain.allowance = BigInt('0x' + tx.data.slice(-64));
        return '0x' + String(chain.sent.length).padStart(64, 'c');
      }
      if (method === 'eth_signTypedData_v4') {
        const n = chain.signed.length; chain.signed.push({ account: params[0], typedData: JSON.parse(params[1]) });
        const behave = sign[n]; if (behave === 'reject') throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        return n === 0 ? SIG1 : SIG2;
      }
      return rpc(method, params);
    },
  };
  const logs = []; W.console.error = (...a) => logs.push(a.map(String).join(' '));
  W.eval(bundle);
  W.document.dispatchEvent(new W.Event('DOMContentLoaded'));
  W.dispatchEvent(new W.CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: '1', name: 'MockWallet', icon: '', rdns: 'mock.wallet' }, provider }) }));
  await sleep(150);
  const ctx = {
    W, D, chain, circle, errors, logs, key: env.STABLEFX_API_KEY,
    text: (sel) => (D.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim(),
    until: async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch { /* keep waiting */ } await sleep(60); } return false; },
    type(value) { const el = D.getElementById('sw-amount'); el.value = value; el.dispatchEvent(new W.Event('input', { bubbles: true })); },
    btn: () => D.getElementById('swapBtnContent').textContent.trim(),
    async connect() { await W.WalletManager.connectDynamic('mock.wallet'); await ctx.until(() => W.WalletState.connected() && W.WalletState.getUSDC() > 0, 5000); await W.navigate('swap'); await sleep(300); },
  };
  return ctx;
}

const NOT_ENABLED = 'Swap is not enabled yet: Circle StableFX access is not configured.';

test('no STABLEFX_API_KEY: exact message, no swap, no requests to Circle', { timeout: 30000 }, async () => {
  const circle = makeCircle();
  const t = await mount({ env: {}, circle });
  await t.connect();
  assert.ok(await t.until(() => t.text('#swapNotice') === NOT_ENABLED), 'notice: ' + t.text('#swapNotice'));
  assert.equal(t.btn(), 'Swap unavailable');
  assert.equal(t.D.getElementById('swapBtn').disabled, true);
  t.type('100'); await sleep(900);
  assert.equal(circle.calls.length, 0, 'Circle is never called without a key');
  assert.equal(t.chain.sent.length, 0); assert.equal(t.chain.signed.length, 0);
  assert.equal(t.D.getElementById('sw-out').value, '', 'no result is shown as if it were a quote');
  assert.deepEqual(t.errors, []);
});

test('a LIVE key is refused (testnet only)', { timeout: 30000 }, async () => {
  const t = await mount({ env: { STABLEFX_API_KEY: 'LIVE_API_KEY:a:b' } });
  await t.connect();
  assert.ok(await t.until(() => t.text('#swapNotice').startsWith(NOT_ENABLED)));
  assert.match(t.text('#swapNotice'), /testnet-only and needs a TEST key/);
  assert.equal(t.btn(), 'Swap unavailable');
});

test('Circle refuses access: the same short message', { timeout: 30000 }, async () => {
  const t = await mount({ circle: makeCircle({ accessDenied: true }) });
  await t.connect();
  assert.ok(await t.until(() => t.text('#swapNotice').startsWith(NOT_ENABLED)), t.text('#swapNotice'));
  assert.match(t.text('#swapNotice'), /Circle answered HTTP 403 for the configured key/);
  assert.equal(t.btn(), 'Swap unavailable');
  assert.ok(t.logs.some((l) => /StableFX is not ready: state=access_denied, circleHttpStatus=403/.test(l)), 'one concise log says why: ' + t.logs.join(' | '));
});

test('no key: one concise log names the state, the page says what to do', { timeout: 30000 }, async () => {
  const t = await mount({ env: {} });
  await t.connect();
  assert.ok(await t.until(() => t.text('#swapNotice') === NOT_ENABLED));
  assert.equal(t.logs.filter((l) => /StableFX is not ready: state=not_configured/.test(l)).length, 1, 'logged once, not on every refresh');
});

test('both directions work: USDC to EURC and EURC to USDC (quote, approve step, no bare "not available")', { timeout: 60000 }, async () => {
  const t = await mount();
  await t.connect();
  assert.ok(await t.until(() => t.btn() === 'Enter amount'));
  for (const dir of ['USDC>EURC', 'EURC>USDC']) {
    const [a, b] = dir.split('>');
    if (t.text('#sw-in-btn').indexOf(a) === -1) { t.D.getElementById('sw-flip').click(); }
    assert.match(t.text('#sw-in-btn'), new RegExp(a)); assert.match(t.text('#sw-out-btn'), new RegExp(b));
    t.type('20');
    assert.ok(await t.until(() => Number(t.D.getElementById('sw-out').value) > 0, 8000), dir + ' quote');
    assert.ok(t.text('#swapRate').startsWith('1 ' + a + ' ='), t.text('#swapRate'));
    assert.match(t.text('#swapMinReceived'), new RegExp(' ' + b + '$'));
    assert.ok(await t.until(() => t.btn() === 'Approve ' + a), t.btn());
    assert.ok(!/not available/i.test(t.D.getElementById('swap-root').textContent), 'no bare "Not available" text');
    t.type('');
  }
  assert.equal(t.circle.calls.filter((c) => c.path === '/quotes').map((c) => c.body.from.currency).join(), 'USDC,EURC');
  assert.deepEqual(t.errors, []);
});

test('quote problems get a specific message and a retry button', { timeout: 60000 }, async () => {
  for (const [message, expected] of [
    ['No liquidity available for this pair', 'No liquidity for this amount right now. Try a smaller amount.'],
    ['Amount less than the minimum trade amount', 'The amount is below the minimum swap size. Try a larger amount.'],
    ['Something odd happened', 'Quote request failed. Retry.'],
  ]) {
    const circle = makeCircle({ quoteFail: { status: 400, message } });
    const t = await mount({ circle });
    await t.connect();
    t.type('50');
    assert.ok(await t.until(() => t.text('#swapNotice') === expected), message + ' -> ' + t.text('#swapNotice'));
    assert.equal(t.btn(), 'Get quote again'); assert.equal(t.D.getElementById('swapBtn').disabled, false);
    assert.ok(t.logs.some((l) => l.startsWith('[swap] quote failed:')), 'one concise error log');
    circle.quoteFail = null; t.D.getElementById('swapBtn').click();
    assert.ok(await t.until(() => Number(t.D.getElementById('sw-out').value) > 0, 8000), 'retry gets a quote');
  }
});

test('not connected or wrong network: the page says what to do', { timeout: 30000 }, async () => {
  const t = await mount();
  assert.ok(await t.until(() => t.text('#swapNotice') === 'Connect your wallet and switch to Arc Testnet.'), t.text('#swapNotice'));
  assert.equal(t.btn(), 'Connect Wallet');
});

test('the pair map only allows USDC and EURC against each other', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pairs-')); const out = path.join(dir, 'p.mjs');
  await build({ entryPoints: [path.join(ROOT, 'src/lib/stablefx.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' } });
  const { pairSupport, SUPPORTED_PAIRS } = await import(pathToFileURL(out).href);
  assert.deepEqual(SUPPORTED_PAIRS, { USDC: ['EURC'], EURC: ['USDC'] });
  for (const [a, b] of [['USDC', 'EURC'], ['EURC', 'USDC']]) assert.equal(pairSupport(a, b).ok, true);
  for (const [a, b] of [['USDC', 'USDC'], ['USDC', 'cirBTC'], ['cirBTC', 'EURC'], ['USDC', 'USDT'], ['EURC', 'USDT']]) {
    const r = pairSupport(a, b); assert.equal(r.ok, false, a + b); assert.equal(r.reason, "This pair isn't supported on Arc Testnet yet.");
  }
});

test('swap function unreachable: clear message, nothing crashes', { timeout: 30000 }, async () => {
  const circle = makeCircle(); circle.down = 'function';
  const t = await mount({ circle });
  await t.connect();
  assert.ok(await t.until(() => /unreachable/.test(t.text('#swapNotice'))), t.text('#swapNotice'));
  assert.equal(t.btn(), 'Swap unavailable');
  t.type('50'); await sleep(500);
  assert.deepEqual(t.errors, []);
});

test('ready: real quote, button states, tokens, MAX/25/50/75, only what the quote returns', { timeout: 40000 }, async () => {
  const t = await mount();
  assert.equal(t.btn(), 'Connect Wallet', 'before connecting');
  await t.connect();
  assert.ok(await t.until(() => t.btn() === 'Enter amount'), t.btn());
  assert.match(t.text('#swapInBalance'), /Balance: 5,?000 USDC/);
  assert.equal(t.D.querySelectorAll('#sw-in-menu [data-tok]').length, 3);
  const cir = t.D.querySelector('#sw-in-menu [data-tok="cirBTC"]');
  assert.match(cir.getAttribute('style'), /not-allowed/); assert.match(cir.textContent, /StableFX does not list cirBTC/);
  cir.click(); assert.match(t.text('#sw-in-btn'), /USDC/, 'cirBTC cannot be selected');
  t.type('5'); assert.ok(await t.until(() => /Minimum swap is 10 USDC/.test(t.btn())), t.btn());
  t.type('999999'); assert.ok(await t.until(() => t.btn() === 'Insufficient balance'));
  t.D.querySelector('#swap-root [data-pct="50"]').click(); assert.equal(t.D.getElementById('sw-amount').value, '2500');
  t.D.querySelector('#swap-root [data-pct="100"]').click(); assert.equal(Number(t.D.getElementById('sw-amount').value), 4999.9);
  t.D.querySelector('#swap-root [data-pct="25"]').click(); t.D.querySelector('#swap-root [data-pct="75"]').click();
  t.type('100');
  assert.ok(await t.until(() => t.D.getElementById('sw-out').value === '91.5', 8000), 'quote arrives: ' + t.D.getElementById('sw-out').value);
  assert.equal(t.text('#swapRate'), '1 USDC = 0.915 EURC');
  assert.equal(t.text('#swapMinReceived'), '91.5 EURC', 'fixed-rate quote: minimum received equals the quote');
  const root = t.D.getElementById('swap-sfx');
  assert.equal(root.querySelector('[data-slip], #customSlipInput, #slipWarning, #slipToleranceDisplay'), null, 'no slippage controls');
  assert.ok(!/slippage|price impact|route|usdt|dex|rfq|swap kit/i.test(root.textContent), 'no slippage, price impact, route, USDT or old provider text: ' + root.textContent.replace(/\s+/g, ' ').slice(0, 300));
  assert.equal(t.text('#swapFee'), '0.5 EURC');
  assert.match(t.text('#swapExpiry'), /^0[45]:\d\d$/);
  assert.ok(await t.until(() => t.btn() === 'Approve USDC'), t.btn());
  assert.match(t.text('#swapNotice'), /approve USDC for the Permit2 contract \(up to 200 USDC\)/);
  assert.equal(t.circle.calls.find((c) => c.path === '/quotes').auth, `Bearer ${t.key}`, 'the key is only sent server-side to Circle');
  assert.ok(t.W.__apiCalls.every((c) => !JSON.stringify(c).includes('TEST_API_KEY')), 'the browser never sends or sees the key');
  assert.deepEqual(t.errors, []);
});

test('full flow: approve, two signatures, trade, fund, status, history', { timeout: 60000 }, async () => {
  const t = await mount();
  await t.connect();
  t.type('100');
  assert.ok(await t.until(() => t.btn() === 'Approve USDC', 8000), t.btn());
  t.D.getElementById('swapBtn').click();
  assert.ok(await t.until(() => t.btn() === 'Swap', 8000), 'after approval: ' + t.btn());
  const ap = t.chain.sent[0];
  assert.equal(ap.to.toLowerCase(), USDC.toLowerCase(), 'approval is sent to the USDC token');
  assert.equal(ap.data.slice(0, 10), '0x095ea7b3');
  assert.equal('0x' + ap.data.slice(34, 74), PERMIT2.toLowerCase(), 'spender is the Permit2 contract');
  assert.equal(BigInt('0x' + ap.data.slice(-64)), 200000000n, 'exact amount (quote buffer + swap amount), never unlimited');
  assert.match(t.text('#swapRun'), /Approved 200 USDC/);
  assert.ok(t.D.querySelector('#swapRun a').href.includes('explorer.testnet.arc.io/tx/'), 'approval has an explorer link');

  t.D.getElementById('swapBtn').click();
  assert.ok(await t.until(() => t.chain.signed.length === 2, 8000), 'two wallet signatures: ' + t.chain.signed.length);
  assert.equal(t.chain.signed[0].account.toLowerCase(), ME.toLowerCase());
  assert.equal(t.chain.signed[0].typedData.primaryType, 'PermitWitnessTransferFrom');
  assert.equal(t.chain.signed[0].typedData.domain.chainId, 5042002);
  assert.equal(t.chain.signed[1].typedData.message.witness.id, '24', 'second signature is the funding request');
  const trade = t.circle.calls.find((c) => c.path === '/trades' && c.method === 'POST');
  assert.equal(trade.body.signature, SIG1); assert.equal(trade.body.address, ME); assert.match(trade.body.idempotencyKey, /^[0-9a-f-]{36}$/);
  const fund = t.circle.calls.find((c) => c.path === '/fund');
  assert.equal(fund.body.signature, SIG2); assert.equal(fund.body.type, 'taker');
  assert.equal(t.chain.sent.length, 1, 'the swap sends no other wallet transaction and no tokens to any fixed address');

  assert.ok(await t.until(() => /Swap complete/.test(t.text('#swapRun')), 20000), 'status: ' + t.text('#swapRun'));
  const link = [...t.D.querySelectorAll('#swapRun a')].pop();
  assert.ok(link.href.endsWith('0x' + 'ee'.repeat(32)), 'settlement transaction link');
  const row = t.D.querySelector('#swap-history .tx-row');
  assert.match(row.textContent.replace(/\s+/g, ' '), /100 USDC → 91\.5 EURC/);
  assert.match(row.textContent, /confirmed/);
  assert.ok(row.querySelector('a').href.includes('explorer.testnet.arc.io/tx/'));
  const stored = JSON.parse(t.W.localStorage.getItem(`arclance_swaps_${ME.toLowerCase()}`));
  assert.equal(stored[0].status, 'confirmed'); assert.equal(stored[0].tradeId, '9d1a3f5e-1111-4222-8333-444455556666');
  assert.deepEqual(t.errors, []);
});

test('history is saved per wallet', { timeout: 40000 }, async () => {
  const t = await mount();
  await t.connect();
  t.W.localStorage.setItem(`arclance_swaps_${ME.toLowerCase()}`, JSON.stringify([{ id: 'a', tokenIn: 'USDC', tokenOut: 'EURC', amountIn: '20', amountOut: '18', status: 'failed', stage: 'trading', error: 'x', timestamp: Date.now() }]));
  t.W.localStorage.setItem(`arclance_swaps_${OTHER.toLowerCase()}`, JSON.stringify([{ id: 'b', tokenIn: 'EURC', tokenOut: 'USDC', amountIn: '30', amountOut: '33', status: 'confirmed', stage: 'done', timestamp: Date.now() }]));
  await t.W.navigate('home'); await t.W.navigate('swap'); await sleep(200);
  assert.match(t.text('#swap-history'), /20 USDC → 18 EURC/); assert.doesNotMatch(t.text('#swap-history'), /30 EURC/);
  assert.match(t.text('#swap-history'), /failed/);
});

test('rejected signature: clear message, nothing sent to Circle', { timeout: 50000 }, async () => {
  const t = await mount({ sign: { 0: 'reject' } });
  await t.connect(); t.type('100');
  assert.ok(await t.until(() => t.btn() === 'Approve USDC', 8000));
  t.D.getElementById('swapBtn').click(); assert.ok(await t.until(() => t.btn() === 'Swap', 8000));
  t.D.getElementById('swapBtn').click();
  assert.ok(await t.until(() => /You rejected the signature in your wallet\. Nothing was sent\./.test(t.text('#swapRun')), 8000), t.text('#swapRun'));
  assert.equal(t.circle.calls.filter((c) => c.path === '/trades' && c.method === 'POST').length, 0);
  assert.match(t.text('#swap-history'), /failed/);
  assert.equal(t.btn(), 'Swap', 'the user can try again');
});

test('rejected funding signature: trade stays unfunded and the message says so', { timeout: 50000 }, async () => {
  const t = await mount({ sign: { 1: 'reject' } });
  await t.connect(); t.type('100');
  assert.ok(await t.until(() => t.btn() === 'Approve USDC', 8000));
  t.D.getElementById('swapBtn').click(); assert.ok(await t.until(() => t.btn() === 'Swap', 8000));
  t.D.getElementById('swapBtn').click();
  assert.ok(await t.until(() => /rejected the funding signature\. The trade was created but not funded, so no tokens moved/.test(t.text('#swapRun')), 8000), t.text('#swapRun'));
  assert.equal(t.circle.calls.filter((c) => c.path === '/fund').length, 0);
});

test('a tampered quote or funding request is never signed', { timeout: 60000 }, async () => {
  const cases = {
    'pays a different wallet': { tamper: (q) => { q.typedData.message.witness.recipient = OTHER; return q; } },
    'moves a different token': { tamper: (q) => { q.typedData.message.permitted.token = EURC; return q; } },
    'wrong network': { tamper: (q) => { q.typedData.domain.chainId = 1; return q; } },
    'unknown Permit2 contract': { tamper: (q) => { q.typedData.domain.verifyingContract = OTHER; return q; } },
    'different amount': { tamper: (q) => { q.from.amount = '101'; return q; } },
  };
  for (const [name, opts] of Object.entries(cases)) {
    const t = await mount({ circle: makeCircle(opts) });
    await t.connect(); t.type('100');
    assert.ok(await t.until(() => /Nothing was signed/.test(t.text('#swapNotice')), 8000), `${name}: ${t.text('#swapNotice')}`);
    assert.equal(t.chain.signed.length, 0, name);
    assert.equal(t.btn(), 'Get quote again');
  }
  // a funding request for a different token or amount
  for (const [name, fundingTamper] of Object.entries({ token: (fp) => { fp.typedData.message.permitted.token = EURC; return fp; }, amount: (fp) => { fp.typedData.message.permitted.amount = String(10n ** 12n); return fp; }, trade: (fp) => { fp.typedData.message.witness.id = '999'; return fp; } })) {
    const t = await mount({ circle: makeCircle({ fundingTamper }) });
    await t.connect(); t.type('100');
    assert.ok(await t.until(() => t.btn() === 'Approve USDC', 8000));
    t.D.getElementById('swapBtn').click(); assert.ok(await t.until(() => t.btn() === 'Swap', 8000));
    t.D.getElementById('swapBtn').click();
    assert.ok(await t.until(() => /Nothing was signed/.test(t.text('#swapRun')), 8000), `funding ${name}: ${t.text('#swapRun')}`);
    assert.equal(t.chain.signed.length, 1, `funding ${name}: only the first signature was requested`);
    assert.equal(t.circle.calls.filter((c) => c.path === '/fund').length, 0);
  }
});

test('a worse refreshed rate needs an explicit accept', { timeout: 60000 }, async () => {
  const circle = makeCircle(); circle.ttl = 24000; // the page refreshes a quote in its last 20 seconds
  const t = await mount({ circle });
  await t.connect(); t.type('100');
  assert.ok(await t.until(() => t.D.getElementById('sw-out').value === '91.5', 8000));
  circle.rate = 0.9; // worse than the quote the user saw
  assert.ok(await t.until(() => t.btn() === 'Accept new price', 15000), 'refresh detected the move: ' + t.btn());
  assert.equal(t.D.getElementById('sw-out').value, '90');
  assert.match(t.text('#swapNotice'), /quote changed to a worse rate/);
  assert.equal(t.chain.signed.length, 0);
  t.D.getElementById('swapBtn').click();
  assert.ok(await t.until(() => t.btn() === 'Approve USDC', 3000), 'after accepting: ' + t.btn());
});

test('a better refreshed rate is applied silently', { timeout: 60000 }, async () => {
  const circle = makeCircle(); circle.ttl = 24000;
  const t = await mount({ circle });
  await t.connect(); t.type('100');
  assert.ok(await t.until(() => t.D.getElementById('sw-out').value === '91.5', 8000));
  circle.rate = 0.92; // better for the user
  assert.ok(await t.until(() => t.D.getElementById('sw-out').value === '92', 15000), t.D.getElementById('sw-out').value);
  assert.notEqual(t.btn(), 'Accept new price');
});

test('the built bundle contains no key and no StableFX secret name', () => {
  assert.ok(!bundle.includes(TEST_KEY) && !bundle.includes('testsecret5678'));
  assert.ok(!bundle.includes('STABLEFX_API_KEY'), 'the key name is only used on the server');
  assert.ok(!/VITE_STABLEFX/.test(bundle));
  assert.ok(!/\/\/api-sandbox\.circle\.com/.test(bundle), 'the browser never talks to Circle directly');
});
