// Tests for the Circle App Kit swap route.
// - Pure helpers: tested directly.
// - The Swap page: tested in a simulated browser with a scripted stand-in for the SDK (no network, no key).
// - One live check against Circle's real swap service runs only with LIVE_APPKIT=1 (it sends nothing and needs no key).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { appKitStub } from './helpers/appkit-stub-plugin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.parse(JSON.stringify(x)); // values from the simulated page live in another JS realm
const ME = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const USDC = '0x3600000000000000000000000000000000000000';
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';
const TX = '0x' + 'ab'.repeat(32);

const windows = [];
after(() => windows.forEach((w) => { try { w.close(); } catch { /* already closed */ } }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'appkit-'));
const helpersJs = path.join(tmp, 'helpers.mjs');
await build({ entryPoints: [path.join(ROOT, 'src/lib/appkit-swap.ts')], bundle: true, format: 'esm', outfile: helpersJs, logLevel: 'silent' });
const H = await import(pathToFileURL(helpersJs).href);
const bundle = await build({
  entryPoints: [path.join(ROOT, 'src/legacy/index.js')], bundle: true, format: 'iife', write: false, logLevel: 'silent', plugins: [appKitStub],
  define: { 'import.meta.env': '{}' },
}).then((r) => r.outputFiles[0].text);
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('<script type="module" src="/src/main.tsx"></script>', '');

// A real estimate, as the SDK returns it for 1 USDC -> EURC on Arc_Testnet (captured from Circle's service).
const RAW_ESTIMATE = {
  tokenIn: 'USDC', tokenOut: 'EURC', amountIn: '1.00', chainIn: 'Arc_Testnet', chainOut: 'Arc_Testnet',
  stopLimit: { amount: '1.347303', token: 'EURC' }, estimatedOutput: { amount: '1.360912', token: 'EURC' },
  fees: [{ token: 'USDC', amount: '0.0002', type: 'provider', component: 'PARTNER', chain: 'Arc_Testnet' }, { token: 'USDC', amount: '0.023571345', type: 'gas' }],
  route: { provider: 'lifi', steps: [{ type: 'swap', tool: 'fly', toolName: 'Fly' }] },
};

// ── pure helpers ──
test('amounts: normalised to the string the SDK expects, never more decimals than the token has', () => {
  assert.equal(H.normalizeAmountIn('1', 6), '1.00'); assert.equal(H.normalizeAmountIn('1.5', 6), '1.50'); assert.equal(H.normalizeAmountIn('1,25', 6), '1.25');
  assert.equal(H.normalizeAmountIn('0.1234567', 6), '0.123456'); assert.equal(H.normalizeAmountIn('0.000000019', 8), '0.00000001');
  assert.equal(H.normalizeAmountIn('007.10', 6), '7.10');
  for (const bad of ['', '0', '0.00', 'abc', '-1', '1e5', '1.2.3', ' ', '0.0000001']) assert.equal(H.normalizeAmountIn(bad, 6), null, JSON.stringify(bad));
});

test('constants: exact chain name, three tokens, cirBTC maps to the SDK symbol', () => {
  assert.equal(H.AK_CHAIN, 'Arc_Testnet'); assert.deepEqual([...H.AK_TOKENS], ['USDC', 'EURC', 'cirBTC']);
  assert.deepEqual(H.AK_DECIMALS, { USDC: 6, EURC: 6, cirBTC: 8 }); assert.equal(H.sdkSymbol('cirBTC'), 'CIRBTC'); assert.equal(H.sdkSymbol('EURC'), 'EURC');
});

test('estimate: read from the SDK output only; nothing is invented', () => {
  const e = H.summarizeEstimate(RAW_ESTIMATE, 'USDC', 'EURC');
  assert.equal(e.out, '1.360912'); assert.equal(e.minOut, '1.347303'); assert.equal(e.provider, 'lifi'); assert.equal(e.tool, 'Fly');
  assert.equal(e.gas.amount, '0.023571345'); assert.equal(e.gas.token, 'USDC'); assert.equal(e.providerFee.amount, '0.0002');
  assert.equal(H.estimatedRate(e), '1.3609');
  assert.throws(() => H.summarizeEstimate({ tokenIn: 'USDC' }, 'USDC', 'EURC'), /no estimated output/);
  assert.throws(() => H.summarizeEstimate(null, 'USDC', 'EURC'));
  const noRoute = H.summarizeEstimate({ estimatedOutput: { amount: '2', token: 'EURC' }, amountIn: '1.00' }, 'USDC', 'EURC');
  assert.equal(noRoute.minOut, null); assert.equal(noRoute.provider, null); assert.equal(noRoute.gas, null);
});

test('result: DONE is confirmed, PENDING is pending, anything else is failed', () => {
  assert.equal(H.summarizeResult({ txHash: TX, amountOut: '1.3', progress: { status: 'DONE' } }).status, 'confirmed');
  assert.equal(H.summarizeResult({ txHash: TX, progress: { status: 'PENDING' } }).status, 'pending');
  assert.equal(H.summarizeResult({ txHash: TX, progress: { status: 'FAILED' } }).status, 'failed');
  assert.equal(H.summarizeResult({ progress: {} }).txHash, null);
});

test('gas on Arc is USDC: a clear message when the wallet cannot cover it', () => {
  const est = H.summarizeEstimate(RAW_ESTIMATE, 'EURC', 'USDC');
  assert.match(H.gasShortfall(est, 0, 'EURC', 1), /Not enough USDC for network fees/);
  assert.equal(H.gasShortfall(est, 0.5, 'EURC', 1), null);
  assert.match(H.gasShortfall(est, 0.01, 'EURC', 1), /need about 0\.0236 USDC and have 0\.01/);
  const usdcIn = H.summarizeEstimate(RAW_ESTIMATE, 'USDC', 'EURC');
  assert.match(H.gasShortfall(usdcIn, 1.01, 'USDC', 1), /needs 1\.0236 USDC/); assert.equal(H.gasShortfall(usdcIn, 1.1, 'USDC', 1), null);
  assert.match(H.gasShortfall(null, 0, 'EURC', 1), /has none/); assert.equal(H.gasShortfall(null, 0, 'USDC', 1), null);
});

test('errors: every failure gets one plain sentence', () => {
  const kit = (code, name, message) => Object.assign(new Error(message), { code, name });
  const cases = [
    [kit(1099, 'INPUT_USER_CANCELLED', 'User cancelled permit signature request.'), 'rejected', /rejected the request in your wallet/],
    [Object.assign(new Error('User rejected the request.'), { code: 4001 }), 'rejected', /Nothing was swapped/],
    [kit(1003, 'INPUT_UNSUPPORTED_ROUTE', 'No route available'), 'no-route', /No liquidity or route for this amount right now. Try a smaller amount/],
    [kit(9001, 'BALANCE_INSUFFICIENT_TOKEN', 'Insufficient token balance'), 'balance', /balance is too low/],
    [kit(9002, 'BALANCE_INSUFFICIENT_GAS', 'gas'), 'gas', /Arc pays gas in USDC/],
    [kit(1011, 'INPUT_CHAIN_SWITCH_REJECTED', 'x'), 'chain', /Switch your wallet to Arc Testnet/],
    [kit(1007, 'INPUT_INSUFFICIENT_SWAP_AMOUNT', 'x'), 'minimum', /too small/],
    [kit(1009, 'INPUT_SLIPPAGE_CONSTRAINT_NOT_MET', 'x'), 'slippage', /slippage limit/],
    [kit(5001, 'ONCHAIN_TRANSACTION_REVERTED', 'x'), 'reverted', /Testnet pools can be unbalanced/],
    [kit(3002, 'NETWORK_TIMEOUT', 'x'), 'network', /did not respond/],
    [kit(1006, 'INPUT_UNSUPPORTED_TOKEN', 'USDT is not supported'), 'token', /isn't supported on Arc Testnet/],
    [new Error('Something unexpected happened here'), 'other', /^Swap failed: Something unexpected happened here$/],
  ];
  for (const [err, kind, re] of cases) { const r = H.explainAkError(err); assert.equal(r.kind, kind, r.message); assert.match(r.message, re); }
  assert.ok(H.explainAkError(new Error('x'.repeat(400))).message.length < 170);
  assert.equal(H.explainAkError(Object.assign(new Error('wrapped'), { cause: { code: 4001 } })).kind, 'rejected');
});

// ── the Swap page, with the SDK scripted ──
async function mount({ balances = { USDC: 100n * 10n ** 6n, EURC: 50n * 10n ** 6n, cirBTC: 0n }, walletChain = '0x4cef52' } = {}) {
  const chain = { id: walletChain, balances, sent: [] };
  const errors = []; const logs = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const hex = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
  const rpc = async (m, params) => {
    if (m === 'eth_chainId') return chain.id;
    if (m === 'eth_getBalance' || m === 'eth_getTransactionCount') return '0x0';
    if (m === 'eth_getCode') return '0x6001';
    if (m === 'eth_gasPrice' || m === 'eth_blockNumber') return '0x1';
    if (m === 'eth_getTransactionReceipt') return { status: '0x1', blockNumber: '0x2a' };
    if (m === 'eth_call') {
      const { to, data } = params[0]; const t = to.toLowerCase();
      if (data.startsWith('0x70a08231')) return hex(t === USDC.toLowerCase() ? chain.balances.USDC : t === EURC.toLowerCase() ? chain.balances.EURC : t === CIRBTC.toLowerCase() ? chain.balances.cirBTC : 0n);
      if (data.startsWith('0x313ce567')) return hex(t === CIRBTC.toLowerCase() ? 8 : 6);
      return hex(0);
    }
    return null;
  };
  const dom = new JSDOM(HTML, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async (u, o = {}) => {
        const s = String(u);
        if (s.includes('rpc.testnet.arc')) { const b = JSON.parse(o.body); return { ok: true, json: async () => ({ jsonrpc: '2.0', id: b.id, result: await rpc(b.method, b.params) }) }; }
        throw new Error('offline: ' + s.slice(0, 40));
      };
    },
  });
  const W = dom.window; const D = W.document; windows.push(W);
  W.addEventListener('error', (e) => errors.push(e.message));
  W.console.error = (...a) => logs.push(a.map(String).join(' '));
  W.__akStub = { calls: { estimate: [], swap: [] }, estimate: (r) => ({ ...H.summarizeEstimate(RAW_ESTIMATE, r.tokenIn, r.tokenOut), amountIn: r.amount }) };
  const listeners = {};
  const provider = {
    on(e, f) { (listeners[e] ||= []).push(f); }, removeListener() {}, emit(e, v) { (listeners[e] || []).forEach((f) => f(v)); },
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ME];
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') { chain.id = '0x4cef52'; return null; }
      if (method === 'eth_sendTransaction') { chain.sent.push(params[0]); return TX; }
      return rpc(method, params);
    },
  };
  W.eval(bundle);
  W.document.dispatchEvent(new W.Event('DOMContentLoaded'));
  W.dispatchEvent(new W.CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: '1', name: 'MockWallet', icon: '', rdns: 'mock.wallet' }, provider }) }));
  await sleep(150);
  const t = {
    W, D, chain, errors, logs, provider, stub: W.__akStub,
    text: (sel) => (D.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim(),
    until: async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch { /* wait */ } await sleep(40); } return false; },
    btn: () => D.getElementById('ak-btn-content').textContent.trim(),
    type(v) { const el = D.getElementById('ak-amount'); el.value = v; el.dispatchEvent(new W.Event('input', { bubbles: true })); },
    async connect() { await W.WalletManager.connectDynamic('mock.wallet'); await t.until(() => W.WalletState.connected() && W.WalletState.getUSDC() > 0, 5000); await W.navigate('swap'); await sleep(200); },
  };
  return t;
}

test('the page opens on Circle App Kit; StableFX stays one click away, and the choice is remembered', async () => {
  const t = await mount();
  assert.equal(t.D.getElementById('swap-appkit').style.display, 'block'); assert.equal(t.D.getElementById('swap-sfx').style.display, 'none');
  assert.match(t.text('#swap-route-note'), /Works without any key/);
  t.D.querySelector('[data-route="stablefx"]').click();
  assert.equal(t.D.getElementById('swap-appkit').style.display, 'none'); assert.equal(t.D.getElementById('swap-sfx').style.display, 'block');
  assert.equal(t.W.localStorage.getItem('arclance_swap_route'), 'stablefx');
  t.D.querySelector('[data-route="appkit"]').click();
  assert.equal(t.D.getElementById('swap-appkit').style.display, 'block');
});

test('not connected: the page says what to do and nothing is requested', async () => {
  const t = await mount();
  assert.equal(t.btn(), 'Connect Wallet');
  assert.equal(t.text('#ak-notice'), 'Connect your wallet and switch to Arc Testnet.');
  t.type('1'); await sleep(700);
  assert.equal(t.stub.calls.estimate.length, 0);
});

test('real estimate shown: output, rate, minimum received, fees and route; request uses Arc_Testnet-ready values', async () => {
  const t = await mount(); await t.connect();
  assert.match(t.text('#ak-in-bal'), /Balance: 100 USDC/); assert.match(t.text('#ak-out-bal'), /Balance: 50 EURC/);
  assert.equal(t.D.querySelectorAll('#ak-in-menu [data-ak-tok]').length, 3);
  assert.ok([...t.D.querySelectorAll('#ak-in-menu [data-ak-tok]')].every((n) => n.querySelector('svg') || n.querySelector('span')), 'each token has its logo');
  assert.equal(t.btn(), 'Enter amount');
  t.type('1');
  assert.ok(await t.until(() => t.D.getElementById('ak-out').value === '1.360912'), 'estimate arrives: ' + t.D.getElementById('ak-out').value);
  assert.deepEqual(J(t.stub.calls.estimate.at(-1)), { tokenIn: 'USDC', tokenOut: 'EURC', amount: '1.00', slippageBps: 100 });
  assert.equal(t.text('#ak-rate'), '1 USDC ≈ 1.3609 EURC'); assert.equal(t.text('#ak-min'), '1.347303 EURC');
  assert.equal(t.text('#ak-fee-provider'), '0.0002 USDC'); assert.match(t.text('#ak-fee-gas'), /0\.023571 USDC/); assert.equal(t.text('#ak-route'), 'Fly via lifi');
  assert.equal(t.btn(), 'Swap');
  assert.match(t.text('#swap-appkit'), /routed by a swap provider/);
  assert.equal(t.stub.calls.swap.length, 0, 'nothing is swapped until the user presses the button');
  assert.deepEqual(t.errors, []);
});

test('rapid typing: only the latest estimate is used, stale answers are ignored', async () => {
  const t = await mount(); await t.connect();
  let n = 0;
  t.stub.delay = async (r) => { n += 1; if (r.amount === '1.00') await sleep(900); };
  t.stub.estimate = (r) => ({ ...H.summarizeEstimate(RAW_ESTIMATE, r.tokenIn, r.tokenOut), amountIn: r.amount, out: r.amount === '1.00' ? '111.000000' : '222.000000' });
  t.type('1'); await sleep(520); // first request is now in flight (and slow)
  t.type('2');
  assert.ok(await t.until(() => t.D.getElementById('ak-out').value === '222.000000', 8000), t.D.getElementById('ak-out').value);
  await sleep(1200);
  assert.equal(t.D.getElementById('ak-out').value, '222.000000', 'the slow first answer never replaced the newer one');
  assert.equal(n, 2);
});

test('quote problems: a specific reason and a retry button', async () => {
  const t = await mount(); await t.connect();
  t.stub.estimateError = Object.assign(new Error('Stablecoin Service createSwap failed: Route or resource not found. Details: No route available'), { code: 1003, name: 'INPUT_UNSUPPORTED_ROUTE' });
  t.type('5');
  assert.ok(await t.until(() => t.text('#ak-notice') === 'No liquidity or route for this amount right now. Try a smaller amount.'), t.text('#ak-notice'));
  assert.equal(t.btn(), 'Get estimate again'); assert.equal(t.D.getElementById('ak-btn').disabled, false);
  assert.ok(t.logs.some((l) => l.startsWith('[swap] App Kit estimate failed:')), 'one concise error log');
  t.stub.estimateError = null; t.D.getElementById('ak-btn').click();
  assert.ok(await t.until(() => t.D.getElementById('ak-out').value === '1.360912'), 'retry gets the estimate');
});

test('balance and network checks come before any estimate', async () => {
  const t = await mount(); await t.connect();
  t.type('500'); await sleep(700);
  assert.equal(t.btn(), 'Insufficient balance'); assert.equal(t.stub.calls.estimate.length, 0);
  assert.match(t.text('#ak-notice'), /USDC balance is lower than this amount/);
  t.chain.id = '0x1'; t.provider.emit('chainChanged', '0x1'); t.type('1');
  assert.ok(await t.until(() => /^Switch to Arc Testnet/.test(t.btn())), t.btn());
  assert.equal(t.text('#ak-notice'), 'Connect your wallet and switch to Arc Testnet.'); assert.equal(t.stub.calls.estimate.length, 0);
});

test('EURC to USDC with no USDC: blocked with a clear gas message; with a little USDC it works', async () => {
  const none = await mount({ balances: { USDC: 0n, EURC: 50n * 10n ** 6n, cirBTC: 0n } }); await none.connect();
  none.D.getElementById('ak-flip').click();
  assert.equal(none.text('#ak-in-btn').trim().startsWith('EURC'), true);
  none.type('1');
  assert.ok(await none.until(() => none.btn() === 'Not enough USDC for gas'), none.btn());
  assert.match(none.text('#ak-notice'), /Arc pays network fees in USDC and your wallet has none/); assert.equal(none.D.getElementById('ak-btn').disabled, true);
  const some = await mount({ balances: { USDC: 1n * 10n ** 6n, EURC: 50n * 10n ** 6n, cirBTC: 0n } }); await some.connect();
  some.D.getElementById('ak-flip').click(); some.type('1');
  assert.ok(await some.until(() => some.btn() === 'Swap'), some.btn());
  assert.deepEqual(J(some.stub.calls.estimate.at(-1)), { tokenIn: 'EURC', tokenOut: 'USDC', amount: '1.00', slippageBps: 100 });
  const tight = await mount({ balances: { USDC: 10000n, EURC: 50n * 10n ** 6n, cirBTC: 0n } }); await tight.connect(); // 0.01 USDC < the 0.0236 gas
  tight.D.getElementById('ak-flip').click(); tight.type('1');
  assert.ok(await tight.until(() => tight.btn() === 'Not enough USDC for gas'), tight.btn());
  assert.match(tight.text('#ak-notice'), /need about 0\.0236 USDC and have 0\.01/);
});

test('swap: parameters, Arcscan link, saved history, balance refresh', async () => {
  const t = await mount(); await t.connect();
  t.stub.swap = { txHash: TX, amountOut: '1.35', status: 'confirmed', explorerUrl: 'https://explorer.testnet.arc.io/tx/' + TX };
  t.D.querySelector('#swap-appkit [data-ak-slip="50"]').click();
  t.type('1.5');
  assert.ok(await t.until(() => t.btn() === 'Swap'));
  const p = new Promise((r) => { t.stub.swapDelay = async () => { r(); await sleep(150); }; });
  t.D.getElementById('ak-btn').click(); await p;
  assert.equal(t.btn(), 'Working…'); assert.match(t.text('#ak-run'), /Check your wallet/);
  assert.ok(await t.until(() => /confirmed/.test(t.text('#ak-run'))), t.text('#ak-run'));
  assert.deepEqual(J(t.stub.calls.swap), [{ tokenIn: 'USDC', tokenOut: 'EURC', amount: '1.50', slippageBps: 50 }]);
  assert.match(t.text('#ak-run'), /Swapped 1\.50 USDC for about 1\.35 EURC/);
  assert.equal(t.D.querySelector('#ak-run a').href, 'https://testnet.arcscan.app/tx/' + TX);
  assert.match(t.text('#toast-container'), /Swap confirmed/); assert.match(t.D.querySelector('#toast-container a').href, /testnet\.arcscan\.app\/tx\//);
  const saved = JSON.parse(t.W.localStorage.getItem('arclance_swaps_' + ME.toLowerCase()));
  assert.equal(saved.length, 1); assert.equal(saved[0].route, 'appkit'); assert.equal(saved[0].settlementTx, TX); assert.equal(saved[0].status, 'confirmed');
  assert.match(t.text('#swap-history'), /1\.50 USDC → 1\.35 EURC/); assert.match(t.D.querySelector('#swap-history a').href, /testnet\.arcscan\.app/);
  assert.equal(t.D.getElementById('ak-amount').value, '');
  assert.deepEqual(t.errors, []);
});

test('swap problems: rejected signature, low balance, reverted, no route. Nothing is saved for a swap that did not happen', async () => {
  const run = async (swapError) => {
    const t = await mount(); await t.connect(); t.stub.swapError = swapError; t.type('1');
    assert.ok(await t.until(() => t.btn() === 'Swap')); t.D.getElementById('ak-btn').click();
    assert.ok(await t.until(() => /failed/.test(t.text('#ak-run'))), t.text('#ak-run'));
    assert.equal(t.W.localStorage.getItem('arclance_swaps_' + ME.toLowerCase()), null);
    assert.equal(t.btn(), 'Swap', 'the user can simply try again');
    return t.text('#ak-run');
  };
  const kit = (code, name, message) => Object.assign(new Error(message), { code, name });
  assert.match(await run(kit(1099, 'INPUT_USER_CANCELLED', 'User cancelled permit signature request.')), /You rejected the request in your wallet\. Nothing was swapped\./);
  assert.match(await run(kit(9001, 'BALANCE_INSUFFICIENT_TOKEN', 'Insufficient token balance on Arc Testnet')), /balance is too low/);
  assert.match(await run(kit(5001, 'ONCHAIN_TRANSACTION_REVERTED', 'reverted')), /Testnet pools can be unbalanced/);
  assert.match(await run(kit(1003, 'INPUT_UNSUPPORTED_ROUTE', 'No route available')), /No liquidity or route for this amount/);
});

test('cirBTC works as a pair token with 8 decimals; MAX keeps a little USDC for gas', async () => {
  const t = await mount({ balances: { USDC: 100n * 10n ** 6n, EURC: 0n, cirBTC: 5n * 10n ** 8n } }); await t.connect();
  assert.match(t.text('#ak-in-bal'), /Balance: 100 USDC/);
  t.D.querySelector('#swap-appkit [data-ak-pct="100"]').click();
  assert.equal(t.D.getElementById('ak-amount').value, '99.9', 'MAX leaves 0.1 USDC for gas');
  t.D.querySelector('#swap-appkit #ak-out-menu [data-ak-tok="cirBTC"]').click();
  assert.equal(t.text('#ak-out-btn').startsWith('cirBTC'), true);
  t.type('1');
  assert.ok(await t.until(() => t.stub.calls.estimate.at(-1)?.tokenOut === 'cirBTC'), 'estimate asks for cirBTC');
  assert.equal(t.stub.calls.estimate.at(-1).amount, '1.00');
  t.D.getElementById('ak-flip').click();
  assert.match(t.text('#ak-in-bal'), /Balance: 5 cirBTC/);
  t.type('0.12345678'); t.type('0.123456789');
  assert.equal(t.D.getElementById('ak-amount').value, '0.12345678', 'at most 8 decimals for cirBTC');
  assert.ok(await t.until(() => t.stub.calls.estimate.at(-1)?.amount === '0.12345678'), JSON.stringify(t.stub.calls.estimate.at(-1)));
});

test('an old estimate is refreshed before it can be swapped with', async () => {
  const t = await mount(); await t.connect(); t.type('1');
  assert.ok(await t.until(() => t.btn() === 'Swap'));
  const before = t.stub.calls.estimate.length;
  const real = t.W.Date.now.bind(t.W.Date); t.W.Date.now = () => real() + 40000; // 40 seconds later
  t.D.getElementById('ak-btn').click();
  assert.equal(t.stub.calls.swap.length, 0, 'no swap with a stale estimate');
  assert.ok(await t.until(() => t.stub.calls.estimate.length === before + 1), 'a fresh estimate is requested');
  assert.ok(await t.until(() => t.btn() === 'Swap'));
});

test('safety: no key, no private key, no wallet_switchEthereumChain override, no manual approve in the App Kit route', () => {
  const files = ['src/legacy/swap-appkit.js', 'src/lib/appkit-sdk.ts', 'src/lib/appkit-swap.ts'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const code = files.map((s) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')).join('\n');
  for (const bad of [/apiKey/i, /kitKey/i, /STABLEFX/, /import\.meta\.env/, /process\.env/, /privateKey/i, /createViemAdapterFromPrivateKey/, /wallet_switchEthereumChain/, /approve\(/, /\bfetch\(/, /localStorage\.setItem\([^)]*key/i])
    assert.ok(!bad.test(code), 'found ' + bad);
  assert.ok(files[1].includes('createViemAdapterFromProvider'), 'external wallet (EIP-1193) adapter only');
  assert.ok(files[2].includes("'Arc_Testnet'"));
});

// ── live check against Circle's real swap service (no key, nothing is sent): LIVE_APPKIT=1 npm run test:swap ──
test('LIVE: real estimates for USDC to EURC and EURC to USDC (1.00) through the browser-wallet adapter', { skip: !process.env.LIVE_APPKIT, timeout: 90000 }, async () => {
  const out = path.join(ROOT, 'node_modules/.cache/appkit-live/sdk.mjs'); // inside the project so the SDK package resolves
  await build({ entryPoints: [path.join(ROOT, 'src/lib/appkit-sdk.ts')], bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: out, logLevel: 'silent' });
  const { estimateWithAppKit } = await import(pathToFileURL(out).href);
  const { privateKeyToAccount, generatePrivateKey } = await import(pathToFileURL(path.join(ROOT, 'node_modules/viem/_esm/accounts/index.js')).href);
  const acct = privateKeyToAccount(generatePrivateKey()); // a throwaway, unfunded address: it only gives the SDK an account to estimate for
  const provider = { on() {}, removeListener() {}, async request({ method, params }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [acct.address];
    if (method === 'eth_chainId') return '0x4cef52';
    const r = await fetch('https://rpc.testnet.arc.network', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json());
    if (r.error) throw new Error(r.error.message); return r.result;
  } };
  for (const [a, b] of [['USDC', 'EURC'], ['EURC', 'USDC']]) {
    const e = await estimateWithAppKit(provider, { tokenIn: a, tokenOut: b, amount: '1.00', slippageBps: 100 });
    assert.ok(Number(e.out) > 0 && Number(e.minOut) > 0 && Number(e.minOut) < Number(e.out), `${a}->${b}: ${e.out} / ${e.minOut}`);
    assert.equal(e.gas.token, 'USDC'); assert.ok(e.provider);
  }
});
