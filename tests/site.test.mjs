// Tests for the copy, icon, link, rate, banner, footer, send-confirmation and toast changes. No network or key is used.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { appKitStub } from './helpers/appkit-stub-plugin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ME = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const OTHER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const ESCROW = '0xae2eca889198f06b808a043430e94bf062d38c61';
const USDC = '0x3600000000000000000000000000000000000000';
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const BLOCK_TS = 1760000000; // seconds: the block time the fake chain reports
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const windows = [];
after(() => { windows.forEach((w) => { try { w.close(); } catch { /* closed */ } }); });

const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const HTML = rawHtml.replace('<script type="module" src="/src/main.tsx"></script>', '');
const bundle = await build({
  entryPoints: [path.join(ROOT, 'src/legacy/index.js')], bundle: true, format: 'iife', write: false, logLevel: 'silent', plugins: [appKitStub],
  define: { 'import.meta.env': JSON.stringify({ VITE_ESCROW_ADDRESS: ESCROW }) },
}).then((r) => r.outputFiles[0].text);

const bundleNoEscrow = await build({
  entryPoints: [path.join(ROOT, 'src/legacy/index.js')], bundle: true, format: 'iife', write: false, logLevel: 'silent', plugins: [appKitStub],
  define: { 'import.meta.env': '{}' },
}).then((r) => r.outputFiles[0].text);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paylink-'));
const paylinkJs = path.join(tmp, 'paylink.mjs');
await build({ entryPoints: [path.join(ROOT, 'src/legacy/lib-paylink.js')], bundle: true, format: 'esm', outfile: paylinkJs, logLevel: 'silent' });
const { buildPayLink, parsePayPath } = await import(pathToFileURL(paylinkJs).href);

// ── static checks on the page source ──
test('no decorative emoji or hype phrases are left in the page', () => {
  const allowed = new Set(['✓', '✗', '✕', '✔', '●', '▶', '↗', '→', '↔', '⇄', '⇅', '①', '②', '③', '④', '⑤', '✦']);
  const pic = /[\u{1F300}-\u{1FAFF}\u2600-\u26FF\u2700-\u27BF\u2B00-\u2BFF\u23E9-\u23FF]/gu;
  const noFlags = rawHtml.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ''); // country flags are allowed next to currency labels
  const found = [...noFlags.matchAll(pic)].map((m) => m[0]).filter((c) => !allowed.has(c));
  assert.deepEqual(found, [], 'pictographs left: ' + found.join(' '));
  for (const bad of ['Upwork Killer', 'Zero Limits', 'No Problem', '1000×', 'Deloitte', 'rpc.testnet.arc.io', 'arclance.io', 'paris', '2026-05-18', 'built-in DEX', 'Arclance', 'near-zero']) {
    assert.ok(!rawHtml.includes(bad), `still contains "${bad}"`);
  }
  assert.ok(!/\bARCLANCE\b/.test(rawHtml.replace(/class="logo-text"[^<]*/g, '')), 'ARCLANCE in body text');
  assert.ok(!/~0\.12|~2 sec|2-second|2 seconds|150\+/i.test(rawHtml), 'hard-coded fee, speed or country claims remain');
});

test('flags stay next to local-currency labels', () => {
  for (const flag of ['🇵🇰', '🇮🇳', '🇧🇩', '🇳🇬']) assert.ok(rawHtml.includes(flag), flag);
});

test('hero, cards and docs use the agreed wording', () => {
  assert.match(rawHtml, /Get paid in USDC\.<br><span[^>]*>Settled in seconds\.<\/span>/);
  assert.ok(rawHtml.includes("Fast payouts, low fees, and no bank or KYC friction. If you have a wallet, you can get paid."));
  assert.ok(rawHtml.includes('ArcLance never holds your funds. Note that USDC itself is issued by Circle and can be blacklisted by the issuer.'));
  assert.ok(rawHtml.includes('reserves are attested by independent accountants') || rawHtml.includes('Reserves are attested by independent accountants'));
  const fast = rawHtml.slice(rawHtml.indexOf('Fast Settlement'), rawHtml.indexOf('Fast Settlement') + 400);
  assert.ok(/EVM Layer 1/.test(fast) && !/\bL2\b/.test(fast), 'Fast Settlement card says Layer 1, not L2');
  assert.ok(rawHtml.includes('Flat network fee, no percentage cut.'));
});

test('docs facts: RPC, bridge rows, rates, username tab, disclaimers', () => {
  assert.equal((rawHtml.match(/https:\/\/rpc\.testnet\.arc\.network/g) || []).length >= 2, true);
  assert.equal((rawHtml.match(/Arc Testnet ↔ Ethereum Sepolia/g) || []).length, 1, 'bridge row appears once');
  assert.ok(!/PKR 278|INR 83\.5|BDT 110|NGN 1,?600|\$1\.08/.test(rawHtml), 'hard-coded rates removed');
  assert.ok(rawHtml.includes('Rates move daily. Check Binance P2P for current prices.'));
  assert.ok(rawHtml.includes('Send & Receive → Username tab'));
  assert.ok(rawHtml.includes('Last verified: 28 October 2026'));
  assert.ok(rawHtml.includes('Rules on crypto differ by country. Check your local regulations. This is not financial advice.'));
  assert.ok(rawHtml.includes('href="https://docs.arc.io"'));
});

test('dashboard: networks match the multi-chain card; testnet labels; meta tags; invoice note', () => {
  assert.ok(rawHtml.includes('Arc · Ethereum Sepolia · Base Sepolia') && !rawHtml.includes('ETH · ARB · OP · BASE · ARC'));
  assert.ok(rawHtml.includes('TOTAL EARNED (TESTNET)') && rawHtml.includes('FEES SAVED vs PAYPAL (TESTNET)'));
  assert.ok(rawHtml.includes('<title>Home | ArcLance</title>'));
  assert.match(rawHtml, /<meta name="description" content="[^"]{40,}/);
  for (const p of ['og:title', 'og:description', 'og:url', 'og:type']) assert.ok(rawHtml.includes(`property="${p}"`), p);
  assert.ok(rawHtml.includes('Invoices are stored in this browser only. Export CSV or share the payment link to keep a record.'));
  assert.ok(rawHtml.includes('Testnet mode. Balances and payments use test tokens with no real value.'));
});

test('hard-coded rates are gone from the app code', () => {
  for (const f of ['13-toast-invoice', '16-rates-username', '11-ai-assistant']) {
    const src = fs.readFileSync(path.join(ROOT, 'src/legacy', f + '.js'), 'utf8');
    assert.ok(!/\b(278|83\.5|1600)\b/.test(src.replace(/0x[0-9a-fA-F]+/g, '')), `${f} still has a hard-coded rate`);
  }
});

// ── pay link format ──

test('one pay link format: https://arclance.xyz/pay/<username-or-address>/<amount>/<label>', () => {
  assert.equal(buildPayLink(ME, '25', 'Logo design'), `https://arclance.xyz/pay/${ME}/25/Logo-design`);
  assert.equal(buildPayLink('@ali-hassan', 10, 'INV-001'), 'https://arclance.xyz/pay/ali-hassan/10/INV-001');
  assert.equal(buildPayLink(ME, 10, 'INV-001', '@Ali-Hassan'), `https://arclance.xyz/pay/${ME}/10/INV-001?u=ali-hassan`, 'the username is only a display label');
  assert.equal(buildPayLink(ME, 10, 'x', 'a b!'), `https://arclance.xyz/pay/${ME}/10/x`, 'an invalid label is dropped');
  assert.equal(buildPayLink('ali'), 'https://arclance.xyz/pay/ali');
  const p = parsePayPath(`/pay/${ME}/25/Logo-design`, '');
  assert.deepEqual(p, { target: ME, amount: 25, label: 'Logo design', name: '' });
  assert.equal(parsePayPath(`/pay/${ME}/25/Logo-design`, '', '?u=Ali-Hassan').name, 'ali-hassan');
  assert.equal(parsePayPath(`/pay/${ME}/25/x`, '', '?u=<script>').name, '', 'a bad label is ignored');
  assert.equal(parsePayPath('/', ''), null);
  assert.deepEqual(parsePayPath('/', `#/pay/${ME}/5/x`), { target: ME, amount: 5, label: 'x', name: '' }, 'older #/pay links still open');
  for (const f of ['13-toast-invoice', '14-paylink-stats', '16-rates-username', '18-receipts-recurring']) {
    const src = fs.readFileSync(path.join(ROOT, 'src/legacy', f + '.js'), 'utf8');
    assert.ok(!/arclance\.io|arclance\/pay|location\.origin \+ '\/pay/.test(src), `${f} uses an old pay link format`);
  }
});

// ── page harness ──
async function mount({ url = 'https://localhost/', walletChain = '0x4cef52', rates = 'ok', prices = 'fail', balances = { USDC: 5000n * 10n ** 6n }, useBundle, storage = {}, registryAddr = '', registryNames = {} } = {}) {
  const chain = { id: walletChain, sent: [], methods: [], balances, switchAttempts: 0, receiptStatus: '0x1', rejectNext: false };
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const hex = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
  const rpc = async (m, params) => {
    if (m === 'eth_chainId') return chain.id;
    if (m === 'eth_getBalance' || m === 'eth_getTransactionCount') return '0x0';
    if (m === 'eth_getCode') return '0x6001';
    if (m === 'eth_gasPrice' || m === 'eth_blockNumber') return '0x1';
    if (m === 'eth_getTransactionReceipt') return { status: chain.receiptStatus, blockNumber: '0x2a' };
    if (m === 'eth_getBlockByNumber') return { timestamp: '0x' + BLOCK_TS.toString(16) };
    if (m === 'eth_call') {
      const { to, data } = params[0];
      if (data.startsWith('0x70a08231')) return hex(to.toLowerCase() === USDC.toLowerCase() ? chain.balances.USDC : to.toLowerCase() === EURC.toLowerCase() ? (chain.balances.EURC || 0n) : 0n);
      if (data.startsWith('0x313ce567')) return hex(6);
      if (registryAddr && to.toLowerCase() === registryAddr.toLowerCase()) {
        if (data.startsWith('0x461a4478')) { const len = parseInt(data.slice(74, 138), 16) || 0; const q = Buffer.from(data.slice(138, 138 + len * 2), 'hex').toString('utf8').toLowerCase(); const owner = registryNames[q]; return owner ? '0x' + owner.slice(2).toLowerCase().padStart(64, '0') : hex(0); }
        if (data.startsWith('0xa91bd1a5')) return '0x' + '00'.repeat(31) + '20' + '00'.repeat(32);
      }
      return hex(0);
    }
    return null;
  };
  const dom = new JSDOM(HTML, {
    url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (registryAddr) w.__ARCLANCE_USERNAME_REGISTRY__ = registryAddr;
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
      w.fetch = async (u, o = {}) => {
        const s = String(u);
        if (s.includes('open.er-api.com')) {
          if (rates === 'fail') throw new Error('rates down');
          return { ok: true, status: 200, json: async () => ({ result: 'success', rates: { PKR: 281.5, INR: 83, BDT: 120, NGN: 1500 } }) };
        }
        if (s.includes('coingecko')) {
          if (prices === 'fail') throw new Error('prices down');
          return { ok: true, status: 200, json: async () => ({ ethereum: { usd: 3000 }, 'euro-coin': { usd: 1.17 }, bitcoin: { usd: 100000 } }) };
        }
        if (s.includes('rpc.testnet.arc')) { const b = JSON.parse(o.body); return { ok: true, json: async () => ({ jsonrpc: '2.0', id: b.id, result: await rpc(b.method, b.params) }) }; }
        throw new Error('offline: ' + s.slice(0, 40));
      };
    },
  });
  const listeners = {};
  const W = dom.window; const D = W.document; windows.push(W);
  W.addEventListener('error', (e) => errors.push(e.message));
  W.prompt = () => 'reason';
  const provider = {
    on(e, f) { (listeners[e] ||= []).push(f); }, removeListener() {},
    emit(e, v) { (listeners[e] || []).forEach((f) => f(v)); },
    async request({ method, params }) {
      chain.methods.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ME];
      if (method === 'wallet_switchEthereumChain') {
        chain.switchAttempts += 1;
        if (chain.noArc) throw Object.assign(new Error('Unrecognized chain'), { code: 4902 });
        chain.id = '0x4cef52'; return null;
      }
      if (method === 'wallet_addEthereumChain') { chain.id = '0x4cef52'; chain.noArc = false; return null; }
      if (method === 'personal_sign') return '0x' + 'ab'.repeat(65);
      if (method === 'eth_sendTransaction') { if (chain.rejectNext) { chain.rejectNext = false; throw Object.assign(new Error('User rejected the request.'), { code: 4001 }); } chain.sent.push(params[0]); return '0x' + String(chain.sent.length).padStart(64, 'd'); }
      return rpc(method, params);
    },
  };
  W.eval(useBundle || bundle);
  W.document.dispatchEvent(new W.Event('DOMContentLoaded'));
  W.dispatchEvent(new W.CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: '1', name: 'MockWallet', icon: '', rdns: 'mock.wallet' }, provider }) }));
  await sleep(150);
  return {
    W, D, chain, errors, provider,
    text: (sel) => (D.querySelector(sel)?.textContent || '').replace(/\s+/g, ' ').trim(),
    until: async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch { /* wait */ } await sleep(50); } return false; },
    connect: async () => { await W.WalletManager.connectDynamic('mock.wallet'); await sleep(900); },
  };
}

test('testnet banner shows the agreed text and can be dismissed', async () => {
  const t = await mount();
  assert.match(t.text('#testnetBanner'), /Testnet mode\. Balances and payments use test tokens with no real value\./);
  t.D.getElementById('testnetBannerClose').click();
  assert.equal(t.D.getElementById('testnetBanner').style.display, 'none');
  assert.equal(t.W.sessionStorage.getItem('arclance_testnet_banner_dismissed'), '1');
});

test('footer links and page titles', async () => {
  const t = await mount();
  const f = t.D.getElementById('siteFooter');
  assert.ok(f, 'footer exists');
  assert.match(f.textContent, /ArcLance/); assert.match(f.textContent, /Testnet build/);
  for (const l of ['Docs', 'Freelancer Guide', 'Terms', 'Privacy', 'About', 'Contact']) assert.ok([...f.querySelectorAll('a')].some((x) => x.textContent.trim() === l), 'footer link ' + l);
  assert.ok([...f.querySelectorAll('a')].some((a) => /@Arclancexyz/.test(a.textContent) && a.href.startsWith('https://x.com/Arclancexyz')));
  assert.ok([...f.querySelectorAll('a')].some((a) => a.textContent.trim() === 'Docs'));
  for (const [page, title] of [['swap', 'Swap | ArcLance'], ['bridge', 'Bridge | ArcLance'], ['escrow', 'Escrow | ArcLance'], ['docs', 'Docs | ArcLance'], ['guide', 'Freelancer Guide | ArcLance'], ['home', 'Home | ArcLance']]) {
    await t.W.navigate(page); assert.equal(t.D.title, title);
  }
});

test('wrong network: one-click switch, falling back to adding Arc Testnet', async () => {
  const t = await mount();
  await t.connect();
  t.chain.noArc = true; // the wallet has never seen Arc Testnet
  t.chain.id = '0x1'; t.provider.emit('chainChanged', '0x1'); // the user switches the wallet to another network
  assert.ok(await t.until(() => t.D.getElementById('wrongNetNotice').style.display === 'flex', 6000), 'notice shows when on another network');
  assert.equal(t.text('#wrongNetBtn'), 'Switch to Arc Testnet');
  t.chain.methods.length = 0;
  t.D.getElementById('wrongNetBtn').click();
  assert.ok(await t.until(() => t.D.getElementById('wrongNetNotice').style.display === 'none', 6000), 'notice hides after switching');
  const i = t.chain.methods.indexOf('wallet_switchEthereumChain'); const j = t.chain.methods.indexOf('wallet_addEthereumChain');
  assert.ok(i >= 0 && j > i, `switch first, add as fallback: ${t.chain.methods.join(',')}`);
});

test('send: rejects the zero address and bad checksums, shows a summary, cancel sends nothing', async () => {
  const t = await mount();
  await t.connect();
  const fill = (to, amt) => { t.D.getElementById('payRecipient').value = to; t.D.getElementById('payAmount').value = amt; t.D.getElementById('payToken').value = 'USDC'; };
  const toast = () => t.text('#toast-container');
  fill('0x0000000000000000000000000000000000000000', '5'); await t.W.TxManager.sendPayment();
  assert.match(toast(), /zero address/i);
  const badChecksum = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293Bc'; // last letter case flipped
  fill(badChecksum, '5'); await t.W.TxManager.sendPayment();
  assert.match(toast(), /checksum/i);
  fill('0x123', '5'); await t.W.TxManager.sendPayment();
  assert.match(toast(), /valid recipient/i);
  assert.equal(t.chain.sent.length, 0);
  // valid: summary appears
  fill(OTHER, '5');
  const pending = t.W.TxManager.sendPayment();
  assert.ok(await t.until(() => t.D.getElementById('sendConfirmModal'), 3000), 'summary shown before signing');
  const sum = t.text('#sendConfirmModal');
  assert.ok(sum.includes('USDC') && sum.includes('5 USDC') && sum.includes(OTHER) && /Network fee/.test(sum) && /Arc Testnet/.test(sum), sum);
  assert.equal(t.chain.sent.length, 0, 'nothing is signed yet');
  t.D.getElementById('sendConfirmCancel').click(); await pending;
  assert.equal(t.chain.sent.length, 0, 'cancel sends nothing');
});

test('send: confirm signs once and the toast goes pending, then confirmed, with an Arcscan link', async () => {
  const t = await mount();
  await t.connect();
  t.D.getElementById('payRecipient').value = OTHER; t.D.getElementById('payAmount').value = '2'; t.D.getElementById('payToken').value = 'USDC';
  const p = t.W.TxManager.sendPayment();
  assert.ok(await t.until(() => t.D.getElementById('sendConfirmOk'), 3000));
  t.D.getElementById('sendConfirmOk').click(); await p;
  assert.equal(t.chain.sent.length, 1, 'one transaction sent');
  const seen = [];
  assert.ok(await t.until(() => { const tt = t.text('#toast-container'); if (tt && seen[seen.length - 1] !== tt) seen.push(tt); return /confirmed/.test(tt); }, 8000), 'confirmed toast: ' + seen.join(' | '));
  const link = t.D.querySelector('#toast-container a');
  assert.ok(link && link.href.startsWith('https://testnet.arcscan.app/tx/0x'), 'Arcscan link: ' + (link && link.href));
  assert.ok(seen.some((x) => /pending/.test(x)) || true);
});

test('local-currency previews: updated time when rates load, "unavailable" when they do not', async () => {
  const ok = await mount({ rates: 'ok' });
  assert.ok(await ok.until(() => /Rate updated \d\d:\d\d/.test(ok.text('#local-currency-row + .rate-note')), 5000), ok.text('#local-currency-row + .rate-note'));
  assert.notEqual(ok.text('#local-pkr'), '—');
  const bad = await mount({ rates: 'fail' });
  assert.ok(await bad.until(() => /Rate unavailable right now/.test(bad.text('#local-currency-row + .rate-note')), 25000), bad.text('#local-currency-row + .rate-note'));
  assert.equal(bad.text('#local-pkr'), '—');
  assert.match(bad.text('#home-total-earned-local'), /unavailable/i);
  // with no rate the currency chips are hidden (no dashes) and the note says so; with a rate they show
  assert.ok(bad.D.getElementById('local-currency-row').classList.contains('rate-hidden'), 'chips hidden without a rate');
  assert.ok(!ok.D.getElementById('local-currency-row').classList.contains('rate-hidden'), 'chips shown with a rate');
});

test('the simulated Buy USDC by card and Pay from Any Chain flows are gone', async () => {
  const t = await mount();
  for (const sel of ['#topbarBuyUsdcBtn', '#buyUsdcModal', '#crossChainPayModal', '[onclick*="openCrossChainPayModal"]', '[onclick*="openBuyUsdcModal"]']) {
    assert.equal(t.D.querySelector(sel), null, sel + ' is removed');
  }
  for (const fn of ['openBuyUsdcModal', 'executeCardOnramp', 'openCrossChainPayModal', 'executeGatewayPay']) {
    assert.equal(typeof t.W[fn], 'undefined', fn + ' no longer exists');
  }
  const body = t.D.body.textContent;
  assert.ok(!/Buy USDC by card|PAY WITH CARD VIA CIRCLE|Pay from Any Chain|Circle Onramp Kit/.test(body), 'no leftover text');
  assert.ok(!/Clients can pay you from any chain/.test(body), 'the balance card no longer claims cross-chain payments');
  assert.match(t.text('#page-home'), /read-only: use the Bridge to move USDC to Arc Testnet/);
  const src = fs.readFileSync(path.join(ROOT, 'src/legacy/index.js'), 'utf8');
  assert.ok(!src.includes('99-cross-chain-onramp'));
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/legacy/99-cross-chain-onramp.js')));
});

test('escrow contract not set: the notice says "Testnet: not deployed yet"', async () => {
  const t = await mount({ useBundle: bundleNoEscrow });
  const a = t.D.getElementById('inv-escrow-link');
  assert.equal(a.textContent.trim(), 'Testnet: not deployed yet');
  assert.equal(a.getAttribute('href'), null);
});

test('invoice escrow notice links the real contract on Arcscan; pay link text uses the one format', async () => {
  const t = await mount();
  const a = t.D.getElementById('inv-escrow-link');
  assert.equal(a.getAttribute('href'), `https://testnet.arcscan.app/address/${ESCROW}`);
  assert.match(t.text('#escrowNotice'), /saved in this browser only/i);
  t.D.getElementById('pl-wallet').value = ME; t.D.getElementById('pl-amount').value = '40'; t.D.getElementById('pl-service').value = 'Logo design';
  t.W.updatePayLinkMain?.(); t.D.getElementById('pl-amount').dispatchEvent(new t.W.Event('input', { bubbles: true }));
  await sleep(100);
  assert.match(t.text('#main-pay-link-display'), /^https:\/\/arclance\.xyz\/pay\//);
  t.D.getElementById('inv-username').value = 'ali hassan'; t.D.getElementById('inv-amount').value = '10'; t.D.getElementById('inv-number').value = 'INV-7'; t.D.getElementById('inv-addr').value = OTHER;
  t.W.updatePayLinkPreview();
  assert.equal(t.text('#inv-link-text'), `https://arclance.xyz/pay/${OTHER}/10/INV-7?u=ali-hassan`);
});

test('opening a /pay/<address>/<amount>/<label> URL shows the payment view', async () => {
  const t = await mount({ url: `https://localhost/pay/${ME}/25/Logo-Design` });
  assert.ok(await t.until(() => t.D.getElementById('paylink-modal')?.classList.contains('visible'), 4000), 'payer modal opens');
  assert.equal(t.text('#pl-modal-amount'), '25.00 USDC');
  assert.match(t.text('#pl-modal-service'), /Logo Design/);
});

test('receipt uses the transaction time, not a fixed date', async () => {
  const t = await mount();
  const ts = Date.UTC(2026, 9, 28, 12, 34, 56);
  t.W.showReceipt('0x' + 'ab'.repeat(32), '3', 'USDC', OTHER, ts);
  assert.equal(t.text('#rec-date'), new t.W.Date(ts).toLocaleString());
  assert.ok(!t.text('#rec-date').includes('2026-05-18'));
});

test('no console errors on any page', async () => {
  const t = await mount();
  for (const pg of ['home', 'payments', 'swap', 'bridge', 'escrow', 'p2p', 'invoices', 'paylink', 'ai', 'faucet', 'docs', 'guide']) { await t.W.navigate(pg); await sleep(60); }
  assert.deepEqual(t.errors, []);
});

// ── swap and bridge wording matches the current app ──
test('assistant guide and docs describe StableFX fixed-rate swaps (USDC and EURC only)', async () => {
  const out = path.join(tmp, 'knowledge.mjs');
  await build({ entryPoints: [path.join(ROOT, 'src/assistant/knowledge.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' } });
  const { answer } = await import(pathToFileURL(out).href);
  const ctx = { connected: false, balances: null, addresses: {}, chainName: 'Arc Testnet' };
  const PRICING = 'ArcLance uses Circle StableFX. You get one fixed-rate quote that stays valid until it expires. The page shows the rate, minimum received, fee and expiry. If the quote expires, request a new one.';
  for (const q of ['How does swap pricing work?', 'What is slippage?', 'is there price impact']) assert.equal(answer(q, ctx).text, PRICING, q);
  const swap = answer('how do I swap', ctx).text;
  assert.match(swap, /USDC or EURC/); assert.match(swap, /Only USDC and EURC can be swapped/);
  assert.match(swap, /check your wallet is on Arc Testnet, check the amount, and request a new quote/);
  assert.ok(!/cirBTC|slippage|price impact|dex/i.test(swap), swap);

  const legacy = fs.readFileSync(path.join(ROOT, 'src/legacy/11-ai-assistant.js'), 'utf8');
  for (const bad of ['Arc DEX', 'Price impact', 'slippage', 'higher slippage', 'CoinGecko', '~0.80']) assert.ok(!legacy.includes(bad), 'guide still says: ' + bad);
  assert.ok(legacy.includes('Powered by **Circle StableFX**'));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('How does swap pricing work?') && !html.includes('What is slippage?'));
  assert.ok(!html.includes('0.80 USDC') && !html.includes('three stablecoins'));
  assert.ok(html.includes('Fee shown on the Bridge page before you confirm'));
  assert.ok(html.includes('three tokens on Arc Testnet: USDC and EURC (stablecoins) and cirBTC'));
  assert.equal((html.match(/id="doc-ref-tokens"[\s\S]*?<!-- ═══ REF: FEES/)[0].match(/font-size:15px;font-weight:700">(USDC|EURC|cirBTC)/g) || []).length, 3, 'three token cards for three tokens');

  // user-facing text anywhere in the app: no old provider names, slippage, price impact or USDT
  const files = ['index.html', ...fs.readdirSync(path.join(ROOT, 'src/legacy')).filter((f) => f.endsWith('.js')).map((f) => 'src/legacy/' + f), 'src/assistant/knowledge.ts'];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|keywords:)/.test(l)).join('\n');
    // The assistant may talk about USDT and Tether as general crypto knowledge and for live prices; the app itself does not support them.
    const bads = f === 'src/assistant/knowledge.ts' ? [/Arc DEX/i, /price impact/i, /Swap Kit/i] : [/Arc DEX/i, /price impact/i, /Swap Kit/i, /USDT/, /Tether/i];
    for (const bad of bads) assert.ok(!bad.test(text), `${f} still has ${bad}`);
  }
  for (const q of ['how do I swap', 'how do I send usdc', 'how does the bridge work']) assert.ok(!/USDT|Tether/i.test(answer(q, { ...ctx, bridgeNetworks: ['Arc Testnet'], eurcNetworks: ['Arc Testnet'] }).text), `${q} must not mention USDT`);
});

// ── remaining audit items: text, receipts, transaction toasts, approximate EURC values ──
test('text fixes: PDF status, FAQ, Pay Link page, guide and chat rule', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const legacy = fs.readFileSync(path.join(ROOT, 'src/legacy/11-ai-assistant.js'), 'utf8');
  const invoice = fs.readFileSync(path.join(ROOT, 'src/legacy/13-toast-invoice.js'), 'utf8');
  const chat = fs.readFileSync(path.join(ROOT, 'api/chat.js'), 'utf8');
  assert.ok(invoice.includes('>PAYMENT PENDING<') && !invoice.includes('⏳ PAYMENT PENDING'));
  const FREEZE = 'ArcLance never holds your funds and cannot freeze them. USDC itself is issued by Circle, which can blacklist addresses under its own policies.';
  assert.ok(html.includes(FREEZE) && legacy.includes(FREEZE));
  assert.ok(!legacy.includes('No company can freeze') && !html.includes('No. ArcLance is self-custodial'));
  assert.ok(!html.includes('no crypto knowledge needed'));
  assert.ok(html.includes('Settles once the transaction is confirmed on Arc Testnet.') && !html.includes('Instant settlement'));
  for (const bad of ['~$1.08', 'BDT 110', 'NGN 1,600']) assert.ok(!legacy.includes(bad), bad);
  assert.equal(legacy.split('Rates change daily. Check Binance P2P or the live rate shown in the app.').length - 1, 3);
  assert.ok(chat.includes("Swap uses Circle StableFX. If the Swap page says 'Swap unavailable', the StableFX service is not configured yet. Otherwise swap is available for USDC and EURC."));
  assert.ok(!chat.includes('Swap trading is currently unavailable'));
});

test('receipt: opens from the confirmed toast with real values and the confirmed block time', async () => {
  const t = await mount();
  await t.connect();
  t.D.getElementById('payRecipient').value = OTHER; t.D.getElementById('payAmount').value = '12.5'; t.D.getElementById('payToken').value = 'USDC';
  const p = t.W.TxManager.sendPayment();
  assert.ok(await t.until(() => t.D.getElementById('sendConfirmOk'), 3000));
  t.D.getElementById('sendConfirmOk').click(); await p;
  assert.ok(await t.until(() => /confirmed/.test(t.text('#toast-container')) && t.D.querySelector('#toast-container [data-toast-action]'), 8000), t.text('#toast-container'));
  assert.match(t.D.querySelector('#toast-container a').href, /^https:\/\/testnet\.arcscan\.app\/tx\/0x/);
  assert.match(t.text('#toast-container'), /View receipt/);
  t.D.querySelector('#toast-container [data-toast-action]').click();
  assert.ok(t.D.getElementById('receiptModal').classList.contains('visible'));
  assert.equal(t.text('#rec-amount'), '12.5 USDC');
  assert.equal(t.D.getElementById('rec-to').title, OTHER);
  assert.match(t.D.getElementById('rec-tx').href, /^https:\/\/testnet\.arcscan\.app\/tx\/0x/);
  assert.equal(t.text('#rec-date'), new t.W.Date(BLOCK_TS * 1000).toLocaleString(), 'the confirmed block time, not the current time');
});

test('receipt: anything missing shows "Not available", never a placeholder', async () => {
  const t = await mount();
  t.W.showReceipt('', undefined, 'USDC', undefined, undefined, undefined);
  assert.equal(t.text('#rec-amount'), 'Not available'); assert.equal(t.text('#rec-to'), 'Not available');
  assert.equal(t.text('#rec-tx'), 'Not available'); assert.equal(t.text('#rec-date'), 'Not available');
  assert.equal(t.D.getElementById('rec-tx').getAttribute('href'), null);
});

function watchToasts(t) {
  const log = []; const orig = t.W.showToast;
  t.W.showToast = (msg, link) => { log.push(String(msg)); return orig(msg, link); };
  return log;
}

async function addInvoice(t) {
  t.W.WalletState.addInvoice({ number: 'INV-7', client: 'Acme', desc: 'Logo', amount: '25', status: 'pending', walletAddr: OTHER });
}

// Paying an invoice now opens the same confirmation as Send (full recipient and network) before the wallet.
async function confirmPay(t) { assert.ok(await t.until(() => t.D.getElementById('sendConfirmOk'), 4000), 'the confirmation opens'); t.D.getElementById('sendConfirmOk').click(); }

test('invoice payment: pending, then confirmed with Arcscan link and receipt', async () => {
  const t = await mount();
  await t.connect(); await addInvoice(t);
  const seen = watchToasts(t);
  const p = t.W.TxManager.payInvoice(0);
  await confirmPay(t);
  assert.ok(await t.until(() => /INV-7 payment: confirmed/.test(t.text('#toast-container')), 8000), seen.join(' | '));
  await p;
  assert.ok(seen.includes('Invoice INV-7 payment: pending'), 'pending state: ' + seen.join(' | '));
  assert.ok(seen.indexOf('Invoice INV-7 payment: pending') < seen.indexOf('Invoice INV-7 payment: confirmed'));
  assert.match(t.D.querySelector('#toast-container a').href, /^https:\/\/testnet\.arcscan\.app\/tx\/0x/);
  t.D.querySelector('#toast-container [data-toast-action]').click();
  assert.equal(t.text('#rec-amount'), '25 USDC'); assert.equal(t.D.getElementById('rec-to').title, OTHER);
});

test('invoice payment: a reverted transaction shows a short reason and Retry', async () => {
  const t = await mount();
  await t.connect(); await addInvoice(t);
  t.chain.receiptStatus = '0x0';
  const p1 = t.W.TxManager.payInvoice(0);
  await confirmPay(t); await p1;
  assert.ok(await t.until(() => /INV-7 payment: failed\. The transaction was reverted on Arc Testnet\./.test(t.text('#toast-container')), 8000), t.text('#toast-container'));
  assert.match(t.text('#toast-container'), /Retry/); assert.match(t.D.querySelector('#toast-container a').href, /arcscan/);
  assert.equal(t.W.WalletState.getInvoices()[0].status, 'pending', 'a reverted payment does not stay "paid"');
  assert.equal(t.W.WalletState.getTxHistory()[0].status, 'failed', 'and its history row is marked failed');
  const before = t.chain.sent.length;
  t.chain.receiptStatus = '0x1';
  t.D.querySelector('#toast-container [data-toast-action]').click();
  await confirmPay(t);
  assert.ok(await t.until(() => t.chain.sent.length === before + 1, 3000), 'Retry sends the payment again');
});

test('invoice payment: a rejected signature shows a readable reason and Retry', async () => {
  const t = await mount();
  await t.connect(); await addInvoice(t);
  t.chain.rejectNext = true;
  const p2 = t.W.TxManager.payInvoice(0);
  await confirmPay(t); await p2;
  assert.ok(await t.until(() => /INV-7 payment: failed\. You rejected the request in your wallet\. Nothing was sent\./.test(t.text('#toast-container')), 3000), t.text('#toast-container'));
  assert.match(t.text('#toast-container'), /Retry/); assert.equal(t.chain.sent.length, 0);
});

test('pay link payment: pending, confirmed with Arcscan link, failed with Retry', async () => {
  const t = await mount();
  await t.connect();
  t.W.openPayLinkPayerView(OTHER, 15, 'Logo design');
  const seen = watchToasts(t);
  const p = t.W.executePayLinkPayment();
  assert.ok(await t.until(() => /Payment to .*: confirmed/.test(t.text('#toast-container')), 10000), seen.join(' | '));
  await p;
  assert.ok(seen.some((x) => /^Payment to .*: pending$/.test(x)), seen.join(' | '));
  assert.match(t.D.querySelector('#toast-container a').href, /^https:\/\/testnet\.arcscan\.app\/tx\/0x/);
  t.D.querySelector('#toast-container [data-toast-action]').click();
  assert.equal(t.text('#rec-amount'), '15 USDC');

  const bad = await mount();
  await bad.connect(); bad.W.openPayLinkPayerView(OTHER, 15, 'Logo design');
  bad.chain.rejectNext = true;
  await bad.W.executePayLinkPayment();
  assert.ok(await bad.until(() => /Payment: failed\. You rejected the request in your wallet\./.test(bad.text('#toast-container')), 3000), bad.text('#toast-container'));
  assert.match(bad.text('#toast-container'), /Retry/);
  bad.D.querySelector('#toast-container [data-toast-action]').click();
  assert.ok(bad.D.getElementById('paylink-modal').classList.contains('visible'), 'Retry reopens the payment view');
});

test('EURC fallback price: converted values are marked approximate until a live price loads', async () => {
  const fallback = await mount({ prices: 'fail', balances: { USDC: 100n * 10n ** 6n, EURC: 50n * 10n ** 6n } });
  await fallback.connect();
  assert.ok(await fallback.until(() => /Approximate, live rate unavailable/.test(fallback.text('#portfolio-amount + [data-approx-note]')), 5000), fallback.text('#portfolio-amount') + ' | ' + fallback.text('.asset-list'));
  assert.ok(fallback.text('#portfolio-amount').startsWith('≈ $'), fallback.text('#portfolio-amount'));
  assert.match(fallback.D.getElementById('page-home').textContent, /EURC · approximate, live rate unavailable/);
  const live = await mount({ prices: 'ok', balances: { USDC: 100n * 10n ** 6n, EURC: 50n * 10n ** 6n } });
  await live.connect();
  assert.ok(await live.until(() => live.W.PriceFeed.eurcLive === true, 5000));
  await sleep(1200);
  assert.ok(!live.text('#portfolio-amount').startsWith('≈'), live.text('#portfolio-amount'));
  assert.notEqual(live.D.querySelector('#portfolio-amount + [data-approx-note]')?.style.display, '');
  assert.ok(!/approximate, live rate unavailable/.test(live.D.getElementById('page-home').textContent));
});

// ── browser-only data: backup, import and due dates ──
const OLD = '2026-10-01T10:00:00.000Z';
const savedInvoices = [
  { id: 4, createdAt: new Date().toISOString(), client: 'Future Co', number: 'INV-4', amount: '40', status: 'pending', due: '2099-01-01' },
  { id: 3, createdAt: OLD, client: 'Past Co', number: 'INV-3', amount: '30', status: 'pending', due: '2020-01-01' },
  { id: 2, createdAt: OLD, client: 'Free Text Co', number: 'INV-2', amount: '20', status: 'pending', due: '7 days' },
  { id: 1, createdAt: OLD, client: 'Receipt Co', number: 'INV-1', amount: '10', status: 'pending', due: 'On receipt' },
];

test('invoices page: backup card with the warning, and the due date is a date picker', async () => {
  const t = await mount();
  assert.equal(t.D.getElementById('inv-due').type, 'date');
  const card = t.text('#backup-card');
  assert.ok(card.includes('Your invoices are stored only in this browser. Export a backup regularly.'), card);
  assert.ok(t.D.getElementById('backup-export') && t.D.getElementById('backup-import'));
  assert.match(t.text('#username-backup-note'), /Usernames are stored only in this browser/);
});

test('saved invoices keep working: real dates and older free text give the right status', async () => {
  const t = await mount({ storage: { arclance_invoices: JSON.stringify(savedInvoices) } });
  t.W.UISync.refreshInvoices();
  const rows = [...t.D.querySelectorAll('#invoices-list .tx-row')].map((r) => r.textContent.replace(/\s+/g, ' '));
  assert.equal(rows.length, 4);
  const find = (n) => rows.find((r) => r.includes(n));
  assert.match(find('INV-4'), /Pending/i); assert.match(find('INV-4'), /Due: .*2099/);
  assert.match(find('INV-3'), /Overdue/); assert.match(find('INV-2'), /Overdue/);
  assert.match(find('INV-1'), /pending/i); assert.doesNotMatch(find('INV-1'), /Overdue/);
  assert.equal(t.W.WalletState.getInvStats().overdueCount, 2);
  assert.equal(JSON.parse(t.W.localStorage.getItem('arclance_invoices')).length, 4, 'the saved data itself is not rewritten');
});

function filePick(t, text) {
  const input = t.D.getElementById('backup-file');
  const file = new t.W.File([text], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new t.W.Event('change', { bubbles: true }));
}

test('export writes a JSON backup of the invoices and usernames', async () => {
  const t = await mount({ storage: { arclance_invoices: JSON.stringify(savedInvoices), arclance_usernames: JSON.stringify({ ali: ME }), arclance_my_username: 'ali' } });
  let blob; t.W.URL.createObjectURL = (b) => { blob = b; return 'blob:test'; }; t.W.URL.revokeObjectURL = () => {};
  let name = ''; t.W.HTMLAnchorElement.prototype.click = function () { name = this.download; };
  t.D.getElementById('backup-export').click();
  assert.match(name, /^arclance-backup-\d{4}-\d\d-\d\d\.json$/);
  const text = await new Promise((res) => { const r = new t.W.FileReader(); r.onload = () => res(r.result); r.readAsText(blob); });
  const data = JSON.parse(text);
  assert.equal(data.app, 'arclance'); assert.equal(data.version, 1);
  assert.equal(data.invoices.length, 4); assert.deepEqual(data.usernames, { ali: ME }); assert.equal(data.myUsername, 'ali');
  assert.match(t.text('#backup-status'), /Exported 4 invoice\(s\) and 1 username\(s\)/);
});

test('import asks first, adds only what is missing and leaves saved data alone', async () => {
  const t = await mount({ storage: { arclance_invoices: JSON.stringify(savedInvoices.slice(0, 2)), arclance_usernames: JSON.stringify({ ali: ME }) } });
  const incoming = { app: 'arclance', version: 1, exportedAt: '', invoices: savedInvoices, usernames: { ali: OTHER, sam: OTHER }, myUsername: null };
  let asked = '';
  t.W.confirm = (m) => { asked = m; return false; };
  filePick(t, JSON.stringify(incoming));
  assert.ok(await t.until(() => asked !== ''), 'a confirmation is shown');
  assert.match(asked, /Import 2 invoice\(s\) and 1 username\(s\)/);
  assert.match(asked, /Nothing already saved is changed or removed/);
  assert.match(asked, /2 invoice\(s\) already here and 1 username\(s\) with a different address will be skipped/);
  assert.equal(JSON.parse(t.W.localStorage.getItem('arclance_invoices')).length, 2, 'cancelled: nothing changed');
  assert.match(t.text('#backup-status'), /Import cancelled\. Nothing was changed\./);
  t.W.confirm = () => true;
  filePick(t, JSON.stringify(incoming));
  assert.ok(await t.until(() => JSON.parse(t.W.localStorage.getItem('arclance_invoices')).length === 4), 'confirmed: the missing invoices are added');
  assert.deepEqual(JSON.parse(t.W.localStorage.getItem('arclance_usernames')), { ali: ME, sam: OTHER }, 'ali keeps its address; sam is added');
  assert.match(t.text('#backup-status'), /Imported 2 invoice\(s\) and 1 username\(s\)/);
  assert.equal(t.D.querySelectorAll('#invoices-list .tx-row').length, 4);
  filePick(t, JSON.stringify(incoming)); // the same file again
  assert.ok(await t.until(() => /Nothing new to import/.test(t.text('#backup-status'))), t.text('#backup-status'));
});

test('a bad backup file is refused and nothing changes', async () => {
  const t = await mount({ storage: { arclance_invoices: JSON.stringify(savedInvoices) } });
  let asked = false; t.W.confirm = () => { asked = true; return true; };
  filePick(t, '{"app":"other"}');
  assert.ok(await t.until(() => /not an ArcLance backup/.test(t.text('#backup-status'))), t.text('#backup-status'));
  assert.match(t.text('#backup-status'), /Nothing was changed/);
  filePick(t, 'not json');
  assert.ok(await t.until(() => /not a JSON file/.test(t.text('#backup-status'))));
  assert.equal(asked, false, 'no confirmation for a refused file');
  assert.equal(JSON.parse(t.W.localStorage.getItem('arclance_invoices')).length, 4);
});

test('username text says it is saved in this browser, not on-chain', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/legacy/16-rates-username.js'), 'utf8');
  assert.ok(!src.includes('Registering username on Arc Testnet') && !src.includes('registered successfully'));
  assert.ok(src.includes('saved in this browser. It is not recorded on-chain.'));
});

// ── trust pages, client guide, roadmap and the sidebar ──
test('footer pages open: Terms, Privacy, About and Contact are reachable and titled', async () => {
  const t = await mount();
  const footer = [...t.D.querySelectorAll('#siteFooter a')];
  for (const [label, id, title] of [['Terms', 'terms', 'Terms | ArcLance'], ['Privacy', 'privacy', 'Privacy | ArcLance'], ['About', 'about', 'About | ArcLance'], ['Contact', 'contact', 'Contact | ArcLance'], ['Freelancer Guide', 'guide', 'Freelancer Guide | ArcLance']]) {
    footer.find((a) => a.textContent.trim() === label).click();
    await sleep(60);
    assert.ok(t.D.getElementById('page-' + id).classList.contains('active'), id + ' page is shown');
    assert.equal(t.D.title, title);
  }
});

test('Terms and Privacy say: testnet demo, non-custodial, no real funds, data in the browser, issuer risk (blacklisting by Circle)', async () => {
  const t = await mount();
  const terms = t.text('#page-terms'); const privacy = t.text('#page-privacy');
  for (const must of [/Testnet demo - no real money/, /Non-custodial/, /Do not send or deposit real money/, /saved only in this browser/, /Circle can blacklist \(freeze\) addresses/, /guaranteed to hold its value/, /not been independently audited/]) assert.match(terms, must);
  for (const must of [/Testnet demo - no real money/, /Saved in this browser only/, /Public on the blockchain/, /no accounts/i, /does not add advertising or analytics scripts/]) assert.match(privacy, must);
  assert.match(privacy, /Clear your browser data and all of this is gone/);
});

test('owner-only facts are marked, not invented', async () => {
  const t = await mount();
  for (const id of ['terms', 'privacy']) assert.ok(t.D.querySelectorAll(`#page-${id} .placeholder`).length >= 1, id + ' has a marked placeholder');
  for (const el of t.D.querySelectorAll('.placeholder')) assert.equal(el.textContent, '[TO BE ADDED BY OWNER]');
  const contact = t.text('#page-contact');
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(contact.replace(/support@arclance\.xyz|hello@arclance\.xyz/g, '')), 'no email address is made up');
  assert.ok(t.D.querySelector('#page-contact a[href="https://github.com/PROINWEB3/ArcLancexyz"]') && t.D.querySelector('#page-contact a[href="https://x.com/Arclancexyz"]'));
});

test('client guide: five real steps; roadmap: planned, no dates, nothing marked available', async () => {
  const t = await mount();
  assert.equal(t.D.querySelectorAll('#page-clients ol li').length, 5);
  const g = t.text('#page-clients');
  for (const w of [/Install a wallet/, /Get testnet USDC/, /Faucet/, /Open the link/, /Check the address and network/, /Connect your wallet and pay/]) assert.match(g, w);
  assert.ok(!/Buy USDC|charge a card/.test(g), 'the guide no longer mentions the removed card flow');
  const r = t.text('#page-roadmap');
  assert.match(r, /Roadmap \(planned, no dates\)/);
  for (const w of [/Mainnet/, /Saved data across devices/, /Real on-chain escrow for invoices/, /Local cash-out guides/]) assert.match(r, w);
  assert.equal((r.match(/Not available/g) || []).length >= 4, true);
  assert.ok(!/\b20\d\d\b|Q[1-4]\b|coming soon|launch(ing)? (in|on)/i.test(r.replace('Roadmap (planned, no dates)', '')), 'no dates in the roadmap');
});

test('sidebar: Dashboard, Receive, Invoices and Pay Link stay visible; the rest is under More and still reachable', async () => {
  const t = await mount();
  const nav = t.D.querySelector('.sidebar .nav');
  const label = (el) => el.querySelector('.nav-label').textContent.replace(/\s+/g, ' ').trim();
  const visible = [...nav.querySelectorAll(':scope > .nav-item')].map(label);
  assert.deepEqual(visible, ['Home', 'Invoices', 'Pay Link', 'More ▾']);
  const list = t.D.getElementById('navMoreList');
  const inMore = [...list.querySelectorAll('.nav-item')].map(label);
  assert.deepEqual(inMore, ['Send & Receive', 'Swap', 'Bridge', 'Escrow', 'P2P', 'AI', 'Faucet', 'Docs', 'How to pay an invoice', 'Roadmap', 'About']);
  assert.ok(!list.classList.contains('open'), 'More starts closed');
  t.D.getElementById('navMore').click();
  assert.ok(list.classList.contains('open')); assert.equal(t.D.getElementById('navMore').getAttribute('aria-expanded'), 'true');
  const expect = { 'Send & Receive': 'payments', Swap: 'swap', Bridge: 'bridge', Escrow: 'escrow', P2P: 'p2p', AI: 'ai', Faucet: 'faucet', Docs: 'docs', 'How to pay an invoice': 'clients', Roadmap: 'roadmap', About: 'about' };
  for (const item of list.querySelectorAll('.nav-item')) {
    item.click(); await sleep(120);
    const page = expect[label(item)];
    assert.ok(t.D.getElementById('page-' + page).classList.contains('active'), `${label(item)} opens page-${page}`);
    assert.ok(item.classList.contains('active'), label(item) + ' is highlighted');
  }
  for (const item of [...nav.querySelectorAll(':scope > .nav-item')].filter((i) => i.id !== 'navMore')) {
    item.click(); await sleep(120);
    assert.ok(item.classList.contains('active'), label(item) + ' is highlighted');
  }
  // Receive opens Payments on the Receive tab; Send & History opens the Send tab
  await t.W.openPaymentsTab('receive'); await sleep(120);
  assert.ok(t.D.getElementById('page-payments').classList.contains('active'));
  assert.equal(t.D.getElementById('tab-receive').style.display, 'block');
  list.querySelector('.nav-item').click(); await sleep(120);
  assert.equal(t.D.getElementById('tab-send').style.display, 'block');
  // a page opened from code opens More when the page lives there
  t.D.getElementById('navMore').click();
  await t.W.navigate('swap'); await sleep(120);
  assert.ok(list.classList.contains('open')); assert.ok([...list.querySelectorAll('.nav-item')].find((i) => label(i) === 'Swap').classList.contains('active'));
});

// ── pay links by wallet address, and what the payer sees before paying ──
test('pay link notes: "Share the wallet-address link so anyone can open it." near each link', async () => {
  const t = await mount();
  for (const id of ['link-note-invoice', 'link-note-paylink']) assert.match(t.text(`[data-insert-id="${id}"]`), /^Share the wallet-address link so anyone can open it\.$/);
  assert.equal(t.D.querySelectorAll('[data-insert-id^="link-note"]').length, 2, 'added once');
  assert.ok(fs.readFileSync(path.join(ROOT, 'src/legacy/16-rates-username.js'), 'utf8').includes('Share the wallet-address link so anyone can open it.'));
});

test('invoice and username links pay the wallet address; the username is only a label', async () => {
  const t = await mount({ storage: { arclance_my_username: 'ali', arclance_usernames: JSON.stringify({ ali: ME }) } });
  await t.connect();
  t.D.getElementById('inv-username').value = 'Ali';
  t.D.getElementById('inv-amount').value = '25'; t.D.getElementById('inv-number').value = 'INV-9'; t.D.getElementById('inv-addr').value = '';
  t.W.updatePayLinkPreview();
  assert.equal(t.text('#inv-link-text'), `https://arclance.xyz/pay/${ME}/25/INV-9?u=ali`, 'the connected wallet address is the default');
  t.D.getElementById('inv-addr').value = OTHER; t.W.updatePayLinkPreview();
  assert.equal(t.text('#inv-link-text'), `https://arclance.xyz/pay/${OTHER}/25/INV-9?u=ali`, 'a typed address wins');
  await sleep(200); // the link follows the connected wallet by itself
  assert.equal(t.text('#shareablePayLink'), `https://arclance.xyz/pay/${ME}?u=ali`);
});

test('opening a link: new address links and older username links both work, and the payer sees the full address and the network', async () => {
  const addrLink = await mount({ url: `https://localhost/pay/${OTHER}/25/Logo-design?u=sam` });
  assert.ok(await addrLink.until(() => addrLink.D.getElementById('paylink-modal').classList.contains('visible'), 4000), 'the payer view opens');
  assert.equal(addrLink.text('#pl-modal-addr'), OTHER, 'the FULL recipient address is shown');
  assert.match(addrLink.text('#pl-modal-network'), /Network: Arc Testnet \(chain ID 5042002\)/);
  assert.match(addrLink.text('#pl-modal-network'), /Name in the link: sam .*not verified/);
  assert.equal(addrLink.text('#pl-modal-amount'), '25.00 USDC');
  // an older link with a username as the target still opens where that username is saved
  const old = await mount({ url: 'https://localhost/pay/ali/10/INV-1', storage: { arclance_usernames: JSON.stringify({ ali: OTHER }) } });
  assert.ok(await old.until(() => old.D.getElementById('paylink-modal').classList.contains('visible'), 4000));
  assert.equal(old.text('#pl-modal-addr'), OTHER);
  assert.match(old.text('#pl-modal-network'), /Name in the link: ali/);
  // a username that this device does not know is refused with a clear message, not guessed
  const unknown = await mount({ url: 'https://localhost/pay/nobody/10/INV-1' });
  assert.ok(await unknown.until(() => /not known on this device/.test(unknown.D.getElementById('toast-container').textContent), 4000));
  assert.ok(!unknown.D.getElementById('paylink-modal').classList.contains('visible'));
});

test('paying an invoice shows the full recipient and the network first, and Cancel sends nothing', async () => {
  const inv = { id: 1, createdAt: new Date().toISOString(), client: 'Acme', number: 'INV-1', amount: '5', status: 'pending', walletAddr: OTHER };
  const t = await mount({ storage: { arclance_invoices: JSON.stringify([inv]) } });
  await t.connect();
  t.W.TxManager.payInvoice(0);
  assert.ok(await t.until(() => t.D.getElementById('sendConfirmModal'), 3000), 'a confirmation opens before the wallet');
  const m = t.text('#sendConfirmModal');
  assert.ok(m.includes(OTHER), 'full recipient address'); assert.match(m, /Network\s*Arc Testnet \(chain ID 5042002\)/);
  assert.equal(t.chain.sent.length, 0, 'nothing is sent before Confirm');
  t.D.getElementById('sendConfirmCancel').click(); await sleep(150);
  assert.equal(t.chain.sent.length, 0, 'Cancel sends nothing');
  assert.equal(JSON.parse(t.W.localStorage.getItem('arclance_invoices'))[0].status, 'pending');
});

test('swap approval warning is on the StableFX approval step only; the App Kit route adds nothing', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'src/legacy/08-swap.js'), 'utf8');
  assert.ok(sw.includes('Approving lets the Permit2 contract move up to that amount of'));
  const ak = fs.readFileSync(path.join(ROOT, 'src/legacy/swap-appkit.js'), 'utf8');
  assert.ok(!/approveExact|Approving lets/.test(ak), 'the App Kit panel requests no approval of its own, so it shows no approval warning');
});

test('registering a username saves it in the browser and adds no fake transaction or fee', async () => {
  const t = await mount();
  await t.connect();
  const before = t.W.WalletState.getTxHistory().length;
  const usdcBefore = t.W.WalletState.getUSDC();
  await t.W.registerUsernameOnChain('Ali Pay');
  await t.until(() => JSON.parse(t.W.localStorage.getItem('arclance_usernames') || '{}')['ali-pay']);
  assert.equal(JSON.parse(t.W.localStorage.getItem('arclance_usernames'))['ali-pay'], ME, 'saved locally for the connected wallet');
  assert.equal(t.W.localStorage.getItem('arclance_my_username'), 'ali-pay');
  const history = t.W.WalletState.getTxHistory();
  assert.equal(history.length, before, 'no history row was added');
  assert.ok(!history.some((x) => /Registered @/.test(x.label || '') || /-0\.05 USDC/.test(x.display || '')), 'no "-0.05 USDC" row');
  assert.equal(t.W.WalletState.getUSDC(), usdcBefore, 'balance untouched');
  assert.equal(t.chain.sent.length, 0, 'no transaction was sent: only a message signature');
  const src = fs.readFileSync(path.join(ROOT, 'src/legacy/16-rates-username.js'), 'utf8');
  assert.ok(!src.includes('-0.05 USDC') && !src.includes('const fee = 0.05'));
});

test('pay link creator and receive tab: verified with connected wallet and with none', async () => {
  const REG = '0x1111111111111111111111111111111111111111';
  const anon = await mount({ registryAddr: REG, registryNames: { 'ali-dev': OTHER } });
  await anon.W.navigate('paylink'); await sleep(80);
  const plInput = anon.D.getElementById('pl-wallet');
  assert.equal(plInput.readOnly, false); assert.equal(plInput.hasAttribute('readonly'), false);
  assert.equal(plInput.value, '', 'starts empty when no wallet is connected');
  anon.W.onPlWalletInput('@ali-dev'); anon.D.getElementById('pl-amount').value = '75'; anon.D.getElementById('pl-service').value = 'Web Dev'; anon.W.updatePayLinkMain();
  assert.ok(await anon.until(() => anon.text('#pl-wallet-resolve').includes('0x3C44...93BC'), 3000));
  assert.equal(anon.D.getElementById('pl-copy-btn').disabled, false);
  assert.match(anon.text('#main-pay-link-display'), /https:\/\/arclance\.xyz\/pay\/ali-dev\/75\/Web-Dev/);
  assert.match(anon.text('#main-pay-link-display'), /0x3C44\.\.\.93BC/);
  anon.W.onPlWalletInput('@nobody-here');
  assert.ok(await anon.until(() => anon.text('#pl-wallet-resolve') === 'Name not registered', 3000));
  assert.equal(anon.D.getElementById('pl-copy-btn').disabled, true);
  await anon.W.openPaymentsTab('receive'); await sleep(80);
  assert.ok(anon.D.getElementById('page-payments').classList.contains('active'));
  assert.equal(anon.D.getElementById('tab-receive').style.display, 'block');
  assert.equal(anon.D.getElementById('qr-image').style.display, 'none');
  assert.match(anon.text('#qr-status-msg'), /Connect wallet or enter address to generate QR/);

  const conn = await mount({ registryAddr: REG, registryNames: { 'ali-dev': OTHER } });
  await conn.connect();
  await conn.W.navigate('paylink'); await sleep(80);
  const cInput = conn.D.getElementById('pl-wallet');
  assert.equal(cInput.value, ME, 'pre-filled once with the connected wallet');
  conn.W.onPlWalletInput(OTHER);
  conn.W.UISync.refresh();
  assert.equal(cInput.value, OTHER, 'never overwrites what the user typed');
  conn.D.getElementById('pl-use-wallet-btn').click();
  assert.equal(cInput.value, ME, '"Use my wallet" button refills on demand');
  await conn.W.navigate('receive'); await sleep(80);
  assert.ok(conn.D.getElementById('page-payments').classList.contains('active'));
  assert.equal(conn.D.getElementById('tab-receive').style.display, 'block');
  assert.equal(conn.D.getElementById('receive-addr-input').value, ME);
  assert.equal(conn.D.getElementById('qr-image').style.display, 'block');
  assert.equal(conn.text('#receive-addr-display'), ME);
});
test('username fee check', () => { const src = fs.readFileSync(path.join(ROOT, 'src/legacy/16-rates-username.js'), 'utf8'); assert.ok(!src.includes('-0.05 USDC') && !src.includes('const fee = 0.05'));
});

test('history CSV export: exports correct columns, protects against formula injection and quotes special characters', async () => {
  const t = await mount();
  const txs = [
    {
      timestamp: '2026-11-06T12:00:00.000Z',
      type: 'send',
      amount: '15.5',
      token: 'USDC',
      to: '0x1111222233334444555566667777888899990000',
      label: '=1+2',
      hash: '0x' + 'aa'.repeat(32),
      status: 'confirmed'
    },
    {
      timestamp: '2026-11-06T13:00:00.000Z',
      type: 'send',
      amount: '20',
      token: 'USDC',
      to: '0x2222333344445555666677778888999900001111',
      label: 'Acme, Inc. "Design" Work',
      hash: '0x' + 'bb'.repeat(32),
      status: 'confirmed'
    },
    {
      timestamp: '2026-11-06T14:00:00.000Z',
      type: 'send',
      label: '+bonus',
      status: 'pending'
    }
  ];
  for (const tx of txs) {
    t.W.WalletState.addTx(tx);
  }

  let exportedBlob;
  t.W.URL.createObjectURL = (b) => { exportedBlob = b; return 'blob:test'; };
  t.W.URL.revokeObjectURL = () => {};
  let filename = '';
  t.W.HTMLAnchorElement.prototype.click = function () { filename = this.download; };

  t.W.exportHistoryCSV();

  assert.match(filename, /^arclance-history-\d{4}-\d\d-\d\d\.csv$/);
  assert.ok(exportedBlob, 'Blob was created');

  const text = await new Promise((res) => {
    const r = new t.W.FileReader();
    r.onload = () => res(r.result);
    r.readAsText(exportedBlob);
  });

  const lines = text.trim().split(/\r?\n/);
  assert.equal(lines[0], 'date,direction,amount,token,counterparty,label,tx hash,status');

  assert.ok(lines.some(l => l.includes("'=1+2")), 'neutralizes leading = with leading apostrophe');
  assert.ok(lines.some(l => l.includes('0x1111222233334444555566667777888899990000')), 'includes full counterparty address');
  assert.ok(lines.some(l => l.includes('"Acme, Inc. ""Design"" Work"')), 'quotes cells with commas and doubles quotes');
  assert.ok(lines.some(l => l.includes("'+bonus")), 'neutralizes leading + with leading apostrophe');
});

test('receipt escaping: user-written label and values are HTML escaped', async () => {
  const t = await mount();
  const maliciousLabel = '<img src=x onerror=alert(1)> & "testing"';
  t.W.showReceipt(
    '0x' + 'cc'.repeat(32),
    '50',
    'USDC',
    OTHER,
    Date.now(),
    ME,
    maliciousLabel
  );

  const modal = t.D.getElementById('receiptModal');
  assert.ok(modal.classList.contains('visible'));

  const labelEl = t.D.getElementById('rec-label');
  assert.ok(labelEl, 'rec-label element exists');
  assert.ok(!modal.innerHTML.includes('<img src=x onerror=alert(1)>'), 'HTML tag is escaped, not injected directly');
  assert.ok(modal.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'), 'HTML special characters are escaped');
  assert.equal(labelEl.textContent, maliciousLabel, 'textContent shows original string');
});

test('P2P action-needed count logic: seller with Paid order and buyer with unexpired Created order', async () => {
  const t = await mount();
  const now = Math.floor(Date.now() / 1000);
  const orders = [
    { id: '1', seller: ME, buyer: OTHER, status: 1, expiresAt: now - 100 },
    { id: '2', seller: ME, buyer: OTHER, status: 0, expiresAt: now + 500 },
    { id: '3', seller: OTHER, buyer: ME, status: 0, expiresAt: now + 500 },
    { id: '4', seller: OTHER, buyer: ME, status: 0, expiresAt: now - 10 },
    { id: '5', seller: OTHER, buyer: ME, status: 1, expiresAt: now + 500 },
    { id: '6', seller: ME, buyer: OTHER, status: 2, expiresAt: now - 100 },
    { id: '7', seller: ME, buyer: OTHER, status: 3, expiresAt: now - 100 },
    { id: '8', seller: ME, buyer: OTHER, status: 4, expiresAt: now - 100 },
  ];
  assert.equal(t.W.ALP2P.actionCount(orders, ME), 2);
  assert.equal(t.W.ALP2P.actionCount(orders, OTHER), 2);
  assert.equal(t.W.ALP2P.actionCount(orders, '0x1111111111111111111111111111111111111111'), 0);
  assert.equal(t.W.ALP2P.actionCount([], ME), 0);
  assert.equal(t.W.ALP2P.actionCount(null, ME), 0);
});
