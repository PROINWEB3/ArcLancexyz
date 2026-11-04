// Bridge: per-network facts, speed and time wording, fee retry, minimum amount, approve link and recovery.
// No network or key is used: the chain, wallet and Circle's Iris service are all faked.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { appKitStub } from './helpers/appkit-stub-plugin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ME = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const windows = [];
after(() => { windows.forEach((w) => { try { w.close(); } catch { /* closed */ } }); });

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('<script type="module" src="/src/main.tsx"></script>', '');
const bundle = await build({ entryPoints: [path.join(ROOT, 'src/legacy/index.js')], bundle: true, format: 'iife', write: false, logLevel: 'silent', plugins: [appKitStub], define: { 'import.meta.env': '{}' } }).then((r) => r.outputFiles[0].text);
// Built next to node_modules so the packages (viem) resolve.
const tmp = path.join(ROOT, 'node_modules/.cache/bridge-test'); fs.mkdirSync(tmp, { recursive: true });
const load = async (entry, name) => { const out = path.join(tmp, name + '.mjs'); await build({ entryPoints: [path.join(ROOT, entry)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', platform: 'node', packages: 'external', define: { 'import.meta.env': '{}' } }); return import(pathToFileURL(out).href + '?v=' + Date.now()); };
const CFG = await load('src/config/chain-config.ts', 'cfg');
const CCTP = await load('src/lib/cctp.ts', 'cctp');

// ── facts and pure helpers ──
test('all 12 networks carry the exact SDK chain name and the Fast Transfer fact from the docs', async () => {
  const { Blockchain } = await import('@circle-fin/bridge-kit');
  const expected = { arc: 'Arc_Testnet', sepolia: 'Ethereum_Sepolia', baseSepolia: 'Base_Sepolia', arbitrumSepolia: 'Arbitrum_Sepolia', opSepolia: 'Optimism_Sepolia', polygonAmoy: 'Polygon_Amoy_Testnet', avalancheFuji: 'Avalanche_Fuji', unichainSepolia: 'Unichain_Sepolia', monadTestnet: 'Monad_Testnet', lineaSepolia: 'Linea_Sepolia', sonicTestnet: 'Sonic_Testnet', worldchainSepolia: 'World_Chain_Sepolia' };
  assert.equal(CFG.BRIDGE_CHAINS.length, 12);
  for (const c of CFG.BRIDGE_CHAINS) {
    assert.equal(c.sdkChain, expected[c.key], c.key);
    assert.ok(Object.values(Blockchain).includes(c.sdkChain), `${c.sdkChain} is in the SDK enum`);
  }
  const standardOnly = CFG.BRIDGE_CHAINS.filter((c) => !c.fastTransfer).map((c) => c.key).sort();
  assert.deepEqual(standardOnly, ['arc', 'avalancheFuji', 'monadTestnet', 'polygonAmoy', 'sonicTestnet']);
});

test('minimumBridgeAmount: exact, from live fee data, and it counts a forwarding fee', () => {
  const { minimumBridgeAmount, maxFeeFor } = CCTP;
  assert.equal(minimumBridgeAmount(0), 1n);
  for (const bps of [0, 1.3, 5, 50, 9999.99]) {
    for (const fwd of [0n, 53578n, 378699n, 1630457n]) {
      const m = minimumBridgeAmount(bps, fwd);
      assert.ok(m > maxFeeFor(m, bps) + fwd, `m=${m} bps=${bps} fwd=${fwd}`);
      if (m > 1n) assert.ok(m - 1n <= maxFeeFor(m - 1n, bps) + fwd, `m-1 would also pass (bps=${bps} fwd=${fwd})`);
    }
  }
  assert.equal(minimumBridgeAmount(0, 378699n), 378700n, 'forwarding fee 0.378699 USDC means more than that');
  assert.equal(minimumBridgeAmount(10000), null, 'a fee as large as the amount cannot be bridged');
});

// ── page harness ──
async function mount({ bps = 0, feeFail = false } = {}) {
  const st = { bps, feeFail, allowance: 0n, balance: 50n * 10n ** 6n, sent: [], receipts: {}, walletChain: '0x4cef52', failNext: null, counter: 0, attest: true };
  const hex = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
  const rpc = async (m, params) => {
    if (m === 'eth_chainId') return st.walletChain;
    if (m === 'eth_getBalance' || m === 'eth_getTransactionCount') return '0x0';
    if (m === 'eth_getCode') return '0x6001';
    if (m === 'eth_gasPrice' || m === 'eth_blockNumber') return '0x1';
    if (m === 'eth_getTransactionReceipt') return st.receipts[params[0]] || { status: '0x1', blockNumber: '0x2a' };
    if (m === 'eth_call') {
      const d = params[0].data;
      if (d.startsWith('0x70a08231')) return hex(st.balance);
      if (d.startsWith('0xdd62ed3e')) return hex(st.allowance);
      if (d.startsWith('0x313ce567')) return hex(6);
      return hex(0);
    }
    return null;
  };
  const vc = new VirtualConsole();
  const dom = new JSDOM(HTML, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async (u, o = {}) => {
        const s = String(u);
        if (s.includes('/v2/burn/USDC/fees/')) {
          if (st.feeFail) return { ok: false, status: 500, json: async () => ({}) };
          return { ok: true, status: 200, json: async () => ([{ finalityThreshold: 1000, minimumFee: 1 }, { finalityThreshold: 2000, minimumFee: st.bps }]) };
        }
        if (s.includes('/v2/messages/')) {
          return st.attest
            ? { ok: true, status: 200, json: async () => ({ messages: [{ status: 'complete', message: '0x' + '11'.repeat(40), attestation: '0x' + '22'.repeat(65), eventNonce: '0x' + '33'.repeat(32) }] }) }
            : { ok: false, status: 404, json: async () => ({}) };
        }
        if (o.body && s.startsWith('http') && /"jsonrpc"/.test(String(o.body))) { const b = JSON.parse(o.body); return { ok: true, json: async () => ({ jsonrpc: '2.0', id: b.id, result: await rpc(b.method, b.params) }) }; }
        throw new Error('offline: ' + s.slice(0, 40));
      };
    },
  });
  const W = dom.window; const D = W.document; windows.push(W);
  const provider = {
    on() {}, removeListener() {},
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ME];
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') { st.walletChain = params[0].chainId; return null; }
      if (method === 'eth_sendTransaction') {
        const tx = params[0];
        const fail = st.failNext && st.failNext.match(tx) ? st.failNext : null;
        if (fail) st.failNext = null;
        st.counter += 1;
        const hash = '0x' + st.counter.toString(16).padStart(64, 'a');
        st.sent.push({ ...tx, hash });
        if (tx.data.startsWith('0x095ea7b3')) st.allowance = 10n ** 30n;
        if (fail && fail.revert) st.receipts[hash] = { status: '0x0', blockNumber: '0x2b' };
        return hash;
      }
      return rpc(method, params);
    },
  };
  W.eval(bundle);
  D.dispatchEvent(new W.Event('DOMContentLoaded'));
  W.dispatchEvent(new W.CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: '1', name: 'MockWallet', icon: '', rdns: 'mock.wallet' }, provider }) }));
  await sleep(150);
  const t = {
    W, D, st,
    text: (sel) => (D.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim(),
    until: async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch { /* wait */ } await sleep(50); } return false; },
    btn: () => D.getElementById('br-btn'),
    btnText: () => t.text('#br-btn-content'),
    pick: (side, key) => D.querySelector(`[data-side="${side}"][data-chain="${key}"]`).click(),
    type: (v) => { const i = D.getElementById('br-amount'); i.value = v; i.dispatchEvent(new W.Event('input', { bubbles: true })); },
    open: async () => { await W.WalletManager.connectDynamic('mock.wallet'); await sleep(900); await W.navigate('bridge'); await sleep(500); },
  };
  return t;
}

test('the page says Standard transfer, explains it where Fast Transfer does not exist, and states no time number', async () => {
  const t = await mount();
  await t.open();
  assert.equal(t.text('#br-speed'), 'Standard transfer (the only speed from Arc Testnet)');
  t.pick('from', 'avalancheFuji');
  assert.equal(t.text('#br-speed'), 'Standard transfer (the only speed from Avalanche Fuji)');
  t.pick('from', 'sepolia');
  assert.equal(t.text('#br-speed'), 'Standard transfer');
  const VARIES = 'Varies by route. Follow the explorer links.';
  for (const k of ['arc', 'avalancheFuji', 'lineaSepolia']) { t.pick('from', k); assert.equal(t.text('#br-time'), VARIES, k); }
  const page = t.text('#bridge-root');
  assert.ok(!/~?\s*\d+\s*(seconds?|minutes?|min|hours?)\b/i.test(page), 'no time number on the page: ' + page.match(/.{20}\d+\s*(seconds?|minutes?|min|hours?).{10}/i));
});

test('5.00 USDC Arc Testnet to Base Sepolia: approve, then a Standard burn with the right domain, amount, recipient and fee', async () => {
  const t = await mount();
  await t.open();
  t.pick('to', 'baseSepolia'); t.type('5');
  assert.ok(await t.until(() => t.btnText() === 'Approve USDC'), t.btnText());
  t.btn().click();
  assert.ok(await t.until(() => t.btnText() === 'Bridge to Base Sepolia'), t.btnText());
  t.btn().click();
  assert.ok(await t.until(() => t.st.sent.some((x) => x.data.startsWith('0x8e0250ee'))), 'burn sent');
  const burn = t.st.sent.find((x) => x.data.startsWith('0x8e0250ee'));
  const slot = (i) => BigInt('0x' + burn.data.slice(10 + i * 64, 10 + (i + 1) * 64));
  assert.equal(slot(0), 5000000n, 'amount');
  assert.equal(slot(1), 6n, 'Base Sepolia CCTP domain');
  assert.equal(slot(2), BigInt(ME), 'recipient is the connected wallet');
  assert.equal(slot(5), 0n, 'max fee is 0 on a Standard transfer');
  assert.equal(slot(6), 2000n, 'Standard finality');
});

test('a small bridge from Avalanche Fuji is Standard too', async () => {
  const t = await mount();
  await t.W.eval("localStorage.clear()");
  await t.open();
  t.pick('from', 'avalancheFuji'); t.pick('to', 'baseSepolia');
  t.st.walletChain = '0xa869';
  t.type('1');
  assert.ok(await t.until(() => t.btnText() === 'Approve USDC', 6000), t.btnText());
  t.btn().click();
  assert.ok(await t.until(() => t.btnText() === 'Bridge to Base Sepolia', 6000), t.btnText());
  t.btn().click();
  assert.ok(await t.until(() => t.st.sent.some((x) => x.data.startsWith('0x8e0250ee'))), 'burn sent');
  const burn = t.st.sent.find((x) => x.data.startsWith('0x8e0250ee'));
  assert.equal(BigInt('0x' + burn.data.slice(10 + 6 * 64, 10 + 7 * 64)), 2000n);
});

test('fee failure: "Fee unavailable, retry", the button stays off, retry loads the fee', async () => {
  const t = await mount({ feeFail: true });
  await t.open();
  t.type('5');
  assert.ok(await t.until(() => /Fee unavailable, retry/.test(t.text('#br-fee'))), t.text('#br-fee'));
  assert.equal(t.btnText(), 'Fee unavailable'); assert.equal(t.btn().disabled, true);
  t.st.feeFail = false;
  t.D.querySelector('[data-br-retry]').click();
  assert.ok(await t.until(() => t.text('#br-fee') === '0 USDC (standard transfer)'), t.text('#br-fee'));
  assert.ok(await t.until(() => !t.btn().disabled), 'button is on again');
});

test('minimum amount: below it the button is off with a clear message; above it the button works', async () => {
  const t = await mount({ bps: 9999.99 }); // the fee takes almost the whole amount, so the minimum is about 1 USDC
  await t.open();
  t.type('0.5');
  assert.ok(await t.until(() => t.btnText() === 'Amount too small'), t.btnText());
  assert.equal(t.btn().disabled, true);
  assert.match(t.text('#br-hint'), /Enter at least 1 USDC\. The bridge fee for this route must be smaller than the amount you send\./);
  t.type('2');
  assert.ok(await t.until(() => t.btnText() !== 'Amount too small'), t.btnText());
  assert.equal(t.D.getElementById('br-hint').style.display, 'none', 'the hint is hidden once the amount is enough');
  const u = await mount({ bps: 10000 });
  await u.open(); u.type('5');
  assert.ok(await u.until(() => u.btnText() === 'Fee too high for this route'), u.btnText());
});

test('progress: the approve step links its transaction; a failed receive says the burn already happened and offers the retry', async () => {
  const t = await mount();
  await t.open();
  t.type('5');
  assert.ok(await t.until(() => t.btnText() === 'Approve USDC'));
  t.btn().click();
  assert.ok(await t.until(() => t.btnText() === 'Bridge to Ethereum Sepolia'));
  const approveHash = t.st.sent.find((x) => x.data.startsWith('0x095ea7b3')).hash;
  t.btn().click();
  assert.ok(await t.until(() => t.D.querySelector('[data-mint]'), 12000), 'receive button appears once Circle confirms');
  assert.ok([...t.D.querySelectorAll('#br-track a')].some((a) => a.href.endsWith('/tx/' + approveHash)), 'approve step links the approve transaction');
  t.st.failNext = { match: (tx) => tx.data.startsWith('0x57ecfd28'), revert: true };
  t.D.querySelector('[data-mint]').click();
  assert.ok(await t.until(() => /was already sent from Arc Testnet/.test(t.text('#br-msg')), 12000), t.text('#br-msg'));
  assert.match(t.text('#br-msg'), /cannot be undone/);
  assert.match(t.text('#br-msg'), /Nothing is lost: the transfer is saved in Bridge history/);
  assert.match(t.text('#br-msg'), /Receive on Ethereum Sepolia/);
  assert.ok(await t.until(() => t.D.querySelector('[data-mint]')), 'the receive button is back for the retry');
  t.D.querySelector('[data-mint]').click();
  assert.ok(await t.until(() => /arrived|Done/i.test(t.text('#br-msg')), 12000), t.text('#br-msg'));
});

test('zero-fee route: no minimum hint, and even the smallest amount (0.000001 USDC) is accepted', async () => {
  const t = await mount({ bps: 0 });
  await t.open();
  t.type('0.000001');
  assert.ok(await t.until(() => t.text('#br-fee') === '0 USDC (standard transfer)'), t.text('#br-fee'));
  assert.ok(await t.until(() => /^(Approve USDC|Bridge to Ethereum Sepolia)$/.test(t.btnText())), t.btnText());
  assert.equal(t.btn().disabled, false);
  assert.equal(t.D.getElementById('br-hint').style.display, 'none');
});

test('a failed receive keeps the transfer in Bridge history with a Resume button that brings the Receive button back', async () => {
  const t = await mount();
  await t.open();
  t.type('5');
  assert.ok(await t.until(() => t.btnText() === 'Approve USDC'));
  t.btn().click();
  assert.ok(await t.until(() => t.btnText() === 'Bridge to Ethereum Sepolia'));
  t.btn().click();
  assert.ok(await t.until(() => t.D.querySelector('[data-mint]'), 12000));
  t.st.failNext = { match: (tx) => tx.data.startsWith('0x57ecfd28'), revert: true };
  t.D.querySelector('[data-mint]').click();
  assert.ok(await t.until(() => /was already sent from Arc Testnet/.test(t.text('#br-msg')), 12000));
  const stored = JSON.parse(t.W.localStorage.getItem('arclance_bridge_history_' + ME.toLowerCase()) || '[]');
  assert.ok(stored.length >= 1 && stored[0].stage !== 'complete', 'the transfer is saved and not marked complete');
  const resume = await t.until(() => t.D.querySelector('#br-history [data-resume]'));
  assert.ok(resume, 'history offers Resume for the unfinished transfer');
  t.D.querySelector('#br-history [data-resume]').click();
  assert.ok(await t.until(() => t.D.querySelector('[data-mint]')), 'Resume shows the Receive button again');
});

test('building the page twice does not double the click handlers: one click sends one receive transaction', async () => {
  const t = await mount();
  t.D.dispatchEvent(new t.W.Event('DOMContentLoaded')); // a second start-up must be harmless
  await t.open();
  t.type('5');
  assert.ok(await t.until(() => t.btnText() === 'Approve USDC'));
  t.btn().click();
  assert.ok(await t.until(() => t.btnText() === 'Bridge to Ethereum Sepolia'));
  t.btn().click();
  assert.ok(await t.until(() => t.D.querySelector('[data-mint]'), 12000));
  t.D.querySelector('[data-mint]').click();
  assert.ok(await t.until(() => /arrived|Done/i.test(t.text('#br-msg')), 12000), t.text('#br-msg'));
  await sleep(600);
  assert.equal(t.st.sent.filter((x) => x.data.startsWith('0x095ea7b3')).length, 1, 'one approval');
  assert.equal(t.st.sent.filter((x) => x.data.startsWith('0x8e0250ee')).length, 1, 'one burn');
  assert.equal(t.st.sent.filter((x) => x.data.startsWith('0x57ecfd28')).length, 1, 'one receive');
});

test('EURC is offered only on routes Circle confirms: elsewhere the option is greyed out with a one-line reason', async () => {
  const t = await mount();
  await t.open();
  const item = () => t.D.querySelector('#br-tok-menu [data-tok="EURC"]');
  t.pick('to', 'baseSepolia');
  await sleep(200);
  assert.ok(item() && !/EURC only moves between/.test(item().textContent), 'Arc to Base Sepolia: EURC allowed');
  t.pick('to', 'arbitrumSepolia');
  await sleep(200);
  assert.match(item().textContent, /EURC only moves between Arc Testnet, Ethereum Sepolia, Base Sepolia, Avalanche Fuji\./);
  assert.equal(t.W.document.querySelector('#br-tok-btn').textContent.includes('USDC'), true, 'USDC stays selected');
});

test('no private-key or native-wallet code and no key in the bridge files', () => {
  for (const f of ['src/legacy/09-bridge.js', 'src/lib/cctp.ts']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/privateKey|private key|mnemonic|createViemAdapterFromPrivateKey|apiKey|KIT_KEY/i.test(s), f);
  }
});
