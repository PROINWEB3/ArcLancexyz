// P2P page: sell or buy USDC for local currency. Reads and writes the contract at P2P_ADDRESS (not deployed yet).
import { publish } from './publish.js';
import { ARC, P2P_ADDRESS, NOT_DEPLOYED_MESSAGE, arcTxUrl } from '../config/chain-config';
import { esc, $, tokIcon, methodIcon, statusBadge, emptyState, errorState, loadingState } from './lib-ui.js';
import { toUnits, fromUnits, shortAddress, errorMessage } from '../lib/evm';
import { P2P_ABI, ORDER_STATUS } from '../contracts/p2p-abi';
import { P2P_COUNTRIES, P2P_DEMO_NOTICE, getCountry, countryOfCurrency, methodBit, methodsFromMask } from '../config/p2p-countries';
import { readContract, encodeCall, hasCode } from '../lib/contract';
import { runArcTx, allowanceOf, approveExact } from './lib-tx.js';

const p = {
  tab: 'market', side: 'buy', country: 'PK', method: 0, amount: '',
  ads: null, adsErr: '', loading: false, orders: null, ordersErr: '',
  order: null, orderAd: null, orderErr: '', takeAd: null, takeAmount: '',
  deployed: null, busy: false, msg: '', msgKind: 'info', lastTx: '',
  rates: null, ratesErr: '', stats: {}, timer: null,
  form: { side: 0, country: 'PK', amount: '', price: '', min: '', max: '', methods: 1, window: '30', details: '' },
};

const me = () => WalletState.getAddr();
const lc = (a) => String(a || '').toLowerCase();
const methodsText = (mask, currency) => methodsFromMask(currency, mask);
const methodChips = (mask, currency) => methodsText(mask, currency).map((m) => `<span class="badge badge-purple" style="font-size:10px;display:inline-flex;align-items:center;gap:5px">${methodIcon(m, 14)}${esc(m)}</span>`).join('');
const demoNote = () => `<div style="font-size:11px;color:var(--yellow);margin-top:6px">${esc(P2P_DEMO_NOTICE)}</div>`;
const fiat = (usdcUnits, price) => (usdcUnits * price) / 1000000n;
const fiatText = (units) => Number(fromUnits(units, 6, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function setMsg(text, kind = 'info') { p.msg = text; p.msgKind = kind; render(); }
function msgHtml() {
  if (!p.msg) return '';
  const c = { info: ['rgba(245,197,24,0.07)', 'rgba(245,197,24,0.25)', 'var(--yellow)'], error: ['rgba(239,68,68,0.08)', 'rgba(239,68,68,0.25)', 'var(--red)'], ok: ['rgba(0,230,118,0.08)', 'rgba(0,230,118,0.25)', 'var(--green)'] }[p.msgKind];
  const link = p.lastTx ? ` <a href="${arcTxUrl(p.lastTx)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">View transaction ↗</a>` : '';
  return `<div style="margin-top:12px;padding:12px 14px;border-radius:12px;background:${c[0]};border:1px solid ${c[1]};color:${c[2]};font-size:12px;line-height:1.6">${esc(p.msg)}${link}</div>`;
}

// ── Data ──
async function checkDeployed() {
  if (!P2P_ADDRESS) { p.deployed = false; return false; }
  try { p.deployed = await hasCode(P2P_ADDRESS); } catch { p.deployed = false; }
  return p.deployed;
}

const normAd = (id, a) => ({ id: String(id), ...a, side: Number(a.side), paymentMethods: Number(a.paymentMethods), paymentWindowMinutes: Number(a.paymentWindowMinutes), createdAt: Number(a.createdAt) });
const normOrder = (id, o) => ({ id: String(id), ...o, adId: String(o.adId), status: Number(o.status), createdAt: Number(o.createdAt), paidAt: Number(o.paidAt), expiresAt: Number(o.expiresAt) });

// Seller reputation: on-chain counters only
async function loadStats(owner) {
  const k = lc(owner);
  if (p.stats[k]) return p.stats[k];
  try {
    const [completed, total, disputed] = await readContract(P2P_ADDRESS, P2P_ABI, 'sellerStats', [owner]);
    p.stats[k] = { completed: Number(completed), total: Number(total), disputed: Number(disputed) };
  } catch { p.stats[k] = null; }
  return p.stats[k];
}
const repText = (s) => (!s ? 'Reputation unavailable' : s.total === 0 ? 'New seller' : `${s.completed} completed · ${Math.round((s.completed / s.total) * 100)}% completion`);

async function loadAds() {
  p.stats = {}; // reputation counters change after every order, so never reuse an old read
  p.loading = true; p.adsErr = ''; render();
  try {
    if (!(await checkDeployed())) { p.loading = false; render(); return; }
    const count = Number(await readContract(P2P_ADDRESS, P2P_ABI, 'adCount'));
    const ids = Array.from({ length: Math.min(count, 60) }, (_, i) => count - 1 - i);
    const ads = await Promise.all(ids.map(async (id) => normAd(id, await readContract(P2P_ADDRESS, P2P_ABI, 'getAd', [BigInt(id)]))));
    p.ads = ads.filter((a) => a.active);
    await Promise.all([...new Set(p.ads.map((a) => a.owner))].map(loadStats));
  } catch (e) { p.adsErr = errorMessage(e); p.ads = null; }
  p.loading = false; render();
}

async function loadOrders() {
  if (!WalletState.connected()) { p.orders = null; render(); return; }
  p.loading = true; p.ordersErr = ''; render();
  try {
    if (!(await checkDeployed())) { p.loading = false; render(); return; }
    const ids = await readContract(P2P_ADDRESS, P2P_ABI, 'orderIdsOf', [me()]);
    p.orders = await Promise.all([...ids].reverse().slice(0, 30).map(async (id) => normOrder(id, await readContract(P2P_ADDRESS, P2P_ABI, 'getOrder', [id]))));
  } catch (e) { p.ordersErr = errorMessage(e); p.orders = null; }
  p.loading = false; render();
}

async function openOrder(id) {
  p.stats = {};
  p.tab = 'order'; p.order = null; p.orderErr = ''; p.msg = ''; p.lastTx = ''; render();
  try {
    p.order = normOrder(id, await readContract(P2P_ADDRESS, P2P_ABI, 'getOrder', [BigInt(id)]));
    p.orderAd = normAd(p.order.adId, await readContract(P2P_ADDRESS, P2P_ABI, 'getAd', [BigInt(p.order.adId)]));
    await loadStats(p.orderAd.owner);
  } catch (e) { p.orderErr = errorMessage(e); }
  render(); startTimer();
}

function startTimer() {
  clearInterval(p.timer);
  p.timer = setInterval(() => {
    const el = $('p2p-countdown');
    if (!el || !p.order) { clearInterval(p.timer); return; }
    el.textContent = countdown(p.order.expiresAt);
  }, 1000);
}
function countdown(expiresAt) {
  const s = expiresAt - Math.floor(Date.now() / 1000);
  if (s <= 0) return 'Expired';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Reference rate (orientation only)
async function loadRates() {
  if (p.rates || p.ratesErr) return;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const j = await r.json();
    if (!j || j.result !== 'success' || !j.rates) throw new Error('bad response');
    p.rates = j.rates;
  } catch { p.ratesErr = 'Reference rate unavailable right now. Enter your own price.'; }
  render();
}
function rateHtml(currency) {
  if (p.rates && p.rates[currency]) return `Reference: 1 USDC ≈ ${Number(p.rates[currency]).toFixed(2)} ${currency}. Market data from open.er-api.com, for orientation only. It is not an offer.`;
  return esc(p.ratesErr || 'Loading reference rate…');
}

// ── Actions ──
async function act(label, fn) {
  try { p.busy = true; p.lastTx = ''; setMsg(label); await fn(); }
  catch (e) { setMsg(errorMessage(e), 'error'); }
  finally { p.busy = false; render(); }
}

async function ensureAllowance(amount, step) {
  const token = ARC.tokens.USDC;
  if ((await allowanceOf(token, P2P_ADDRESS)) >= amount) return true;
  p.lastTx = await approveExact(token, P2P_ADDRESS, amount, (t) => setMsg(`${step} Approve USDC. ${t}`));
  setMsg('USDC approved. Press the button again to continue.', 'ok');
  return false;
}

function createAdFlow() {
  const f = p.form; const errs = [];
  const amount = toUnits(f.amount, 6); const price = toUnits(f.price, 6); const min = toUnits(f.min, 6); const max = toUnits(f.max, 6);
  if (!(amount > 0n)) errs.push('Enter the USDC amount.');
  if (!(price > 0n)) errs.push('Enter your price per USDC.');
  if (!(min > 0n) || min > max) errs.push('Set a minimum order above 0 and not above the maximum.');
  if (max > amount) errs.push('The maximum order cannot be more than the ad amount.');
  if (!f.methods) errs.push('Choose at least one payment method.');
  if (f.details.trim().length < 3) errs.push('Add payment details for the buyer.');
  if (errs.length) { setMsg(errs[0], 'error'); return; }
  act('Preparing…', async () => {
    if (f.side === 0 && !(await ensureAllowance(amount, 'Step 1 of 2:'))) return;
    const input = { side: f.side, currency: getCountry(f.country).currency, amount, price, minLimit: min, maxLimit: max, paymentMethods: f.methods, paymentWindowMinutes: Number(f.window), paymentDetails: f.details.trim() };
    p.lastTx = await runArcTx(P2P_ADDRESS, encodeCall(P2P_ABI, 'createAd', [input]), (t) => setMsg(`${f.side === 0 ? 'Step 2 of 2: lock USDC and publish. ' : ''}${t}`));
    setMsg('Ad published.', 'ok');
    p.tab = 'market'; WalletState.triggerChainSync(); loadAds();
  });
}

function takeOrderFlow() {
  const ad = p.takeAd; const amount = toUnits(p.takeAmount, 6);
  if (!(amount > 0n) || amount < ad.minLimit || amount > ad.maxLimit || amount > ad.remaining) { setMsg(`Enter an amount between ${fromUnits(ad.minLimit, 6)} and ${fromUnits(ad.maxLimit < ad.remaining ? ad.maxLimit : ad.remaining, 6)} USDC.`, 'error'); return; }
  act('Preparing…', async () => {
    // Taking a BUY ad means you are the seller, so your USDC is locked now
    if (ad.side === 1 && !(await ensureAllowance(amount, 'Step 1 of 2:'))) return;
    p.lastTx = await runArcTx(P2P_ADDRESS, encodeCall(P2P_ABI, 'createOrder', [BigInt(ad.id), amount]), (t) => setMsg(t));
    setMsg('Order created.', 'ok');
    p.takeAd = null; WalletState.triggerChainSync();
    const count = Number(await readContract(P2P_ADDRESS, P2P_ABI, 'orderCount'));
    await openOrder(count - 1);
  });
}

const orderAction = (fn, args, okText) => act('Preparing…', async () => {
  p.lastTx = await runArcTx(P2P_ADDRESS, encodeCall(P2P_ABI, fn, args), (t) => setMsg(t));
  setMsg(okText, 'ok'); WalletState.triggerChainSync(); await openOrderQuiet(p.order.id);
});
async function openOrderQuiet(id) {
  const keepMsg = p.msg; const keepKind = p.msgKind; const keepTx = p.lastTx;
  await openOrder(id); p.msg = keepMsg; p.msgKind = keepKind; p.lastTx = keepTx; render();
}

// ── Rendering ──
const pageHead = (title) => `<div class="section-header"><div class="section-title">${title}</div><span class="badge badge-yellow">Testnet only. No real money.</span></div>`;

function notDeployed() {
  return `<div class="card animate" style="max-width:640px;margin:0 auto;width:100%">${pageHead('P2P')}
  <div style="text-align:center;padding:28px 10px"><div style="font-size:15px;font-weight:700;margin-bottom:8px">${NOT_DEPLOYED_MESSAGE}</div>
  <div style="font-size:12px;color:var(--text2);line-height:1.7">Sell USDC for local money or buy it from others. The seller's USDC is locked in a contract until the seller confirms, the order is cancelled or expires, or the arbiter rules on a dispute. The contract is not live yet, so there is nothing to show.</div></div></div>`;
}

function tabsHtml() {
  const t = (id, label) => `<button type="button" class="slip-btn ${p.tab === id ? 'active' : ''}" data-p-tab="${id}">${label}</button>`;
  return `<div class="slip-btns" style="margin-bottom:14px">${t('market', 'Marketplace')}${t('orders', 'My orders')}${t('create', 'Create ad')}</div>`;
}

function marketHtml() {
  const sideBtn = (s, label) => `<button type="button" class="slip-btn ${p.side === s ? 'active' : ''}" data-p-side="${s}">${label}</button>`;
  const country = getCountry(p.country);
  const cur = P2P_COUNTRIES.map((c) => `<button type="button" class="slip-btn ${p.country === c.code ? 'active' : ''}" data-p-country="${c.code}">${c.name} (${c.currency})</button>`).join('');
  const meth = `<select class="form-select" data-p-method style="max-width:220px"><option value="0">All ${esc(country.name)} methods</option>${country.methods.map((m, i) => `<option value="${methodBit(i)}" ${p.method === methodBit(i) ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`;
  let body;
  if (p.loading) body = loadingState('Loading ads…');
  else if (p.adsErr) body = errorState(p.adsErr, 'window.ALP2P.reload()');
  else if (!p.ads) body = loadingState();
  else {
    const want = p.side === 'buy' ? 0 : 1; const amt = toUnits(p.amount, 6);
    const rows = p.ads.filter((a) => a.side === want && a.currency === country.currency && (!p.method || a.paymentMethods & p.method) && (!(amt > 0n) || (amt >= a.minLimit && amt <= a.maxLimit && amt <= a.remaining)) && a.remaining > 0n);
    body = rows.length ? rows.map((a) => `<div class="tx-row" style="gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:170px"><div style="font-size:13px;font-weight:700">${shortAddress(a.owner)}${me() && lc(me()) === lc(a.owner) ? ' (you)' : ''}</div>
          <div style="font-size:11px;color:var(--text2)">${esc(repText(p.stats[lc(a.owner)]))}</div>
          <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${methodChips(a.paymentMethods, a.currency)}</div></div>
        <div style="min-width:140px"><div style="font-size:14px;font-weight:700;color:var(--yellow)">${fiatText(a.price)} ${esc(a.currency)} <span style="font-size:11px;color:var(--text2);font-weight:500">per USDC</span></div>
          <div style="font-size:11px;color:var(--text2)">Available ${fromUnits(a.remaining, 6, 2)} USDC · Limits ${fromUnits(a.minLimit, 6, 2)} to ${fromUnits(a.maxLimit, 6, 2)}</div>
          <div style="font-size:11px;color:var(--text2)">Pay within ${a.paymentWindowMinutes} min</div></div>
        ${me() && lc(me()) === lc(a.owner)
          ? `<button type="button" class="btn btn-ghost btn-sm" data-p-cancelad="${a.id}" ${p.busy ? 'disabled' : ''}>Cancel ad</button>`
          : `<button type="button" class="btn btn-primary btn-sm" data-p-take="${a.id}">${p.side === 'buy' ? 'Buy USDC' : 'Sell USDC'}</button>`}</div>`).join('') : emptyState('No ads match your filters');
  }
  const take = p.takeAd ? takeHtml() : '';
  return `${tabsHtml()}<div class="slip-btns" style="margin-bottom:10px">${sideBtn('buy', 'Buy USDC')}${sideBtn('sell', 'Sell USDC')}</div>
    <div class="slip-btns" style="margin-bottom:10px">${cur}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${meth}<input class="form-input" data-p-amount placeholder="Amount in USDC" inputmode="decimal" value="${esc(p.amount)}" style="max-width:180px"></div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:12px">${rateHtml(country.currency)}</div>${take}${body}${msgHtml()}`;
}

function takeHtml() {
  const a = p.takeAd; const amt = toUnits(p.takeAmount, 6);
  const youSell = a.side === 1;
  return `<div style="border:1px solid rgba(245,197,24,0.3);border-radius:14px;padding:14px;margin-bottom:14px;background:rgba(245,197,24,0.04)">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px">${youSell ? 'Sell' : 'Buy'} USDC from ${shortAddress(a.owner)}</div>
    <input class="form-input" data-p-takeamt placeholder="Amount in USDC (${fromUnits(a.minLimit, 6)} to ${fromUnits(a.maxLimit < a.remaining ? a.maxLimit : a.remaining, 6)})" inputmode="decimal" value="${esc(p.takeAmount)}">
    <div class="info-box" style="margin-top:10px"><div class="info-row"><span class="k">${youSell ? 'You receive' : 'You pay'}</span><span class="v yellow">${amt > 0n ? fiatText(fiat(amt, a.price)) : '—'} ${esc(a.currency)}</span></div>
    <div class="info-row"><span class="k">Payment window</span><span class="v">${a.paymentWindowMinutes} minutes</span></div></div>
    ${youSell ? '<div style="font-size:11px;color:var(--text2);margin-top:8px">Your USDC is locked in the contract until you confirm, cancel or the order expires, or the arbiter rules on a dispute.</div>' : ''}${demoNote()}
    <div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn btn-primary" data-p-confirmtake="1" ${p.busy ? 'disabled' : ''}>${p.busy ? '<div class="spinner"></div> Working…' : 'Create order'}</button><button type="button" class="btn btn-ghost" data-p-canceltake="1">Cancel</button></div></div>`;
}

function ordersHtml() {
  let body;
  if (!WalletState.connected()) body = emptyState('Connect your wallet to see your orders');
  else if (p.loading) body = loadingState('Loading orders…');
  else if (p.ordersErr) body = errorState(p.ordersErr, 'window.ALP2P.reload()');
  else if (!p.orders) body = loadingState();
  else body = p.orders.length ? p.orders.map((o) => `<div class="tx-row" data-p-open="${o.id}" style="cursor:pointer;gap:12px">
      ${tokIcon('USDC', 26)}<div style="flex:1"><div style="font-size:13px;font-weight:600">Order #${o.id} · ${fromUnits(o.amount, 6, 2)} USDC</div>
      <div style="font-size:11px;color:var(--text2)">${lc(me()) === lc(o.buyer) ? 'You are buying' : 'You are selling'} · ${new Date(o.createdAt * 1000).toLocaleString()}</div></div>
      ${statusBadge(o.status === 2 ? 'ok' : o.status === 3 ? 'info' : o.status === 4 ? 'fail' : 'pending', ORDER_STATUS[o.status] || '?')}</div>`).join('') : emptyState('You have no orders yet');
  return `${tabsHtml()}${body}${msgHtml()}`;
}

function createHtml() {
  const f = p.form;
  const country = getCountry(f.country);
  const methods = country.methods.map((m, i) => `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2)"><input type="checkbox" data-p-fm="${methodBit(i)}" ${f.methods & methodBit(i) ? 'checked' : ''}> ${methodIcon(m, 16)} ${esc(m)}</label>`).join('');
  const field = (label, key, ph, extra = '') => `<div class="form-group"><label class="form-label">${label}</label><input class="form-input" data-p-ff="${key}" placeholder="${ph}" inputmode="decimal" value="${esc(f[key])}" ${extra}></div>`;
  return `${tabsHtml()}
    <div class="form-group"><label class="form-label">I want to</label><div class="slip-btns"><button type="button" class="slip-btn ${f.side === 0 ? 'active' : ''}" data-p-fside="0">Sell USDC</button><button type="button" class="slip-btn ${f.side === 1 ? 'active' : ''}" data-p-fside="1">Buy USDC</button></div></div>
    <div class="form-group"><label class="form-label">Country</label><div class="slip-btns">${P2P_COUNTRIES.map((c) => `<button type="button" class="slip-btn ${f.country === c.code ? 'active' : ''}" data-p-fcountry="${c.code}">${c.name} (${c.currency})</button>`).join('')}</div><div style="font-size:11px;color:var(--text2);margin-top:6px">${rateHtml(country.currency)}</div></div>
    ${field('Amount (USDC)', 'amount', '100')}${field(`Price per USDC (${country.currency})`, 'price', '280')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${field('Minimum order (USDC)', 'min', '10')}${field('Maximum order (USDC)', 'max', '100')}</div>
    <div class="form-group"><label class="form-label">Payment methods in ${esc(country.name)}</label><div style="display:flex;gap:12px;flex-wrap:wrap">${methods}</div></div>
    <div class="form-group"><label class="form-label">Payment window</label><div class="slip-btns">${['15', '30', '60'].map((w) => `<button type="button" class="slip-btn ${f.window === w ? 'active' : ''}" data-p-fwin="${w}">${w} min</button>`).join('')}</div></div>
    <div class="form-group"><label class="form-label">Payment details for the buyer</label><textarea class="form-input" data-p-ff="details" rows="3" maxlength="300" placeholder="Account name and number">${esc(f.details)}</textarea><div style="font-size:11px;color:var(--text2);margin-top:6px">Stored on the blockchain, so anyone can read it.</div>${demoNote()}</div>
    ${msgHtml()}<button type="button" class="tx-btn tx-btn-yellow" data-p-publish="1" ${p.busy ? 'disabled' : ''}>${!WalletState.connected() ? 'Connect Wallet' : p.busy ? '<div class="spinner"></div> Working…' : f.side === 0 ? 'Approve USDC, lock and publish' : 'Publish ad'}</button>`;
}

function orderHtml() {
  if (p.orderErr) return `${errorState(p.orderErr, `window.ALP2P.open('${esc(p.order?.id ?? '')}')`)}<button type="button" class="btn btn-ghost btn-sm" data-p-tab="orders" style="margin-top:12px">Back</button>`;
  const o = p.order; const a = p.orderAd;
  if (!o || !a) return loadingState('Loading order…');
  const isBuyer = lc(me()) === lc(o.buyer); const isSeller = lc(me()) === lc(o.seller);
  const expired = o.status === 0 && o.expiresAt <= Math.floor(Date.now() / 1000);
  const step = (state, n, t, d) => `<div class="tracker-step ${state}"><div class="tracker-step-dot">${state === 'done' ? '✓' : n}</div><div><div style="font-size:13px;font-weight:700">${t}</div><div style="font-size:11px;color:var(--text2)">${d}</div></div></div>`;
  const s = o.status;
  const timeline = [
    step('done', 1, 'Order created', `${new Date(o.createdAt * 1000).toLocaleString()} · ${fromUnits(o.amount, 6, 2)} USDC locked`),
    step(s >= 1 && s !== 3 ? 'done' : s === 0 ? 'active' : 'pending', 2, 'Buyer pays and marks "Paid"', s === 0 ? `Time left: <b id="p2p-countdown">${countdown(o.expiresAt)}</b>` : o.paidAt ? new Date(o.paidAt * 1000).toLocaleString() : ''),
    step(s === 2 ? 'done' : s === 1 ? 'active' : 'pending', 3, 'Seller confirms and USDC is released', s === 2 ? 'USDC released to the buyer.' : s === 1 ? 'Waiting for the seller.' : ''),
  ].join('');
  const btn = (label, attr, cls = 'btn-primary') => `<button type="button" class="btn ${cls}" ${attr} ${p.busy ? 'disabled' : ''}>${label}</button>`;
  let actions = '';
  if (s === 0 && isBuyer && !expired) actions += `<input class="form-input" id="p2p-ref" placeholder="Your payment transaction ID (optional)" maxlength="120" style="margin-bottom:8px">${btn('I have paid', 'data-p-paid="1"')} `;
  if (s === 1 && isSeller) actions += btn('Confirm payment received', 'data-p-confirm="1"') + ' ';
  if ((s === 0 && (isBuyer || expired)) ) actions += btn(expired ? 'Cancel expired order' : 'Cancel order', 'data-p-cancel="1"', 'btn-ghost') + ' ';
  if (s === 1 && (isBuyer || isSeller)) actions += btn('Dispute', 'data-p-dispute="1"', 'btn-ghost');
  const stat = p.stats[lc(a.owner)];
  return `<div class="section-header"><div class="section-title">Order #${o.id}</div>${statusBadge(s === 2 ? 'ok' : s === 3 ? 'info' : s === 4 ? 'fail' : 'pending', ORDER_STATUS[s] || '?')}</div>
    <div class="info-box" style="margin-bottom:14px">
      <div class="info-row"><span class="k">${isBuyer ? 'You buy' : 'You sell'}</span><span class="v yellow">${fromUnits(o.amount, 6, 2)} USDC</span></div>
      <div class="info-row"><span class="k">${isBuyer ? 'You pay' : 'You receive'}</span><span class="v">${fiatText(o.fiatAmount)} ${esc(a.currency)}</span></div>
      <div class="info-row"><span class="k">Price</span><span class="v">${fiatText(a.price)} ${esc(a.currency)} per USDC</span></div>
      <div class="info-row"><span class="k">Seller</span><span class="v">${shortAddress(o.seller)} · ${esc(repText(lc(a.owner) === lc(o.seller) ? stat : null))}</span></div>
      <div class="info-row"><span class="k">Payment reference</span><span class="v mono">ARCLANCE-${o.id}</span></div></div>
    ${isBuyer && s <= 1 ? `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:14px"><div class="form-label">Payment instructions</div><div style="font-size:13px;white-space:pre-wrap">${esc(a.paymentDetails)}</div><div style="font-size:11px;color:var(--text2);margin-top:6px">Methods: ${esc(methodsText(a.paymentMethods, a.currency).join(', '))}. Put the reference in your payment note.</div>${demoNote()}</div>` : ''}
    ${timeline}${o.paymentReference ? `<div style="font-size:11px;color:var(--text2);margin-top:8px">Buyer reference: ${esc(o.paymentReference)}</div>` : ''}
    ${actions ? `<div style="margin-top:14px">${actions}</div>` : ''}${actions.includes('data-p-dispute') ? `<div style="font-size:11px;color:var(--text2);margin-top:8px;line-height:1.5">Disputes are decided by a single arbiter address. This is a test deployment.</div>` : ''}${msgHtml()}
    <button type="button" class="btn btn-ghost btn-sm" data-p-tab="orders" style="margin-top:14px">Back to orders</button>`;
}

function render() {
  const root = $('p2p-root');
  if (!root) return;
  if (p.deployed === false || !P2P_ADDRESS) { root.innerHTML = notDeployed(); return; }
  const inner = p.tab === 'market' ? marketHtml() : p.tab === 'orders' ? ordersHtml() : p.tab === 'create' ? createHtml() : orderHtml();
  root.innerHTML = `<div class="card animate" style="max-width:820px;margin:0 auto;width:100%">${pageHead('P2P')}${inner}</div>`;
}

let bound = false;
function bind() {
  const root = $('p2p-root');
  if (!root || bound) return;
  bound = true;
  root.addEventListener('click', (e) => {
    const el = e.target.closest('button,[data-p-open]'); if (!el) return; const d = el.dataset;
    if (d.pTab) { p.tab = d.pTab; p.msg = ''; p.lastTx = ''; p.takeAd = null; render(); if (p.tab === 'market') loadAds(); if (p.tab === 'orders') loadOrders(); loadRates(); }
    else if (d.pSide) { p.side = d.pSide; render(); }
    else if (d.pCountry) { p.country = d.pCountry; p.method = 0; render(); }
    else if (d.pTake) { if (!WalletState.connected()) { WalletManager.openModal(); return; } p.takeAd = p.ads.find((a) => a.id === d.pTake); p.takeAmount = ''; p.msg = ''; render(); }
    else if (d.pCanceltake) { p.takeAd = null; render(); }
    else if (d.pCancelad) { act('Preparing…', async () => { p.lastTx = await runArcTx(P2P_ADDRESS, encodeCall(P2P_ABI, 'cancelAd', [BigInt(d.pCancelad)]), (t) => setMsg(t)); setMsg('Ad cancelled. Any USDC still locked in it was returned to you.', 'ok'); WalletState.triggerChainSync(); await loadAds(); }); }
    else if (d.pConfirmtake) takeOrderFlow();
    else if (d.pOpen) openOrder(d.pOpen);
    else if (d.pFside) { p.form.side = Number(d.pFside); render(); }
    else if (d.pFcountry) { p.form.country = d.pFcountry; p.form.methods = 1; render(); }
    else if (d.pFwin) { p.form.window = d.pFwin; render(); }
    else if (d.pPublish) { if (!WalletState.connected()) WalletManager.openModal(); else createAdFlow(); }
    else if (d.pPaid) { const ref = ($('p2p-ref')?.value || '').trim() || `ARCLANCE-${p.order.id}`; orderAction('markPaid', [BigInt(p.order.id), ref], 'Payment marked on-chain. The seller must open the page to confirm.'); }
    else if (d.pConfirm) orderAction('confirmPayment', [BigInt(p.order.id)], 'Payment confirmed. USDC released to the buyer.');
    else if (d.pCancel) orderAction('cancelOrder', [BigInt(p.order.id)], 'Order cancelled.');
    else if (d.pDispute) { const reason = window.prompt('Why are you opening a dispute?'); if (reason && reason.trim()) orderAction('openDispute', [BigInt(p.order.id), reason.trim()], 'Dispute opened.'); }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.pMethod !== undefined) { p.method = Number(t.value); render(); }
    else if (t.dataset.pFm) { p.form.methods = t.checked ? p.form.methods | Number(t.dataset.pFm) : p.form.methods & ~Number(t.dataset.pFm); }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    const keep = () => { const pos = t.selectionStart; render(); const sel = t.dataset.pAmount !== undefined ? '[data-p-amount]' : t.dataset.pTakeamt !== undefined ? '[data-p-takeamt]' : `[data-p-ff="${t.dataset.pFf}"]`; const n = document.querySelector(`#p2p-root ${sel}`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* not text */ } } };
    if (t.dataset.pAmount !== undefined) { p.amount = t.value; keep(); }
    else if (t.dataset.pTakeamt !== undefined) { p.takeAmount = t.value; keep(); }
    else if (t.dataset.pFf) { p.form[t.dataset.pFf] = t.value; if (t.dataset.pFf === 'details') return; keep(); }
  });
}

window.ALP2P = { reload: () => (p.tab === 'orders' ? loadOrders() : loadAds()), open: (id) => openOrder(id) };
window.AL_pages = window.AL_pages || {};
window.AL_pages.p2p = async () => { loadRates(); if (await checkDeployed()) { if (p.tab === 'orders') loadOrders(); else if (p.tab === 'market') loadAds(); else if (p.tab === 'order' && p.order) openOrderQuiet(p.order.id); else render(); } else render(); };
document.addEventListener('DOMContentLoaded', () => { if ($('p2p-root')) { bind(); render(); } });

publish({});
