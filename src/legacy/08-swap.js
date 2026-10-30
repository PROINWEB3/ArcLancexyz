// Swap page: real Circle StableFX swaps on Arc Testnet (USDC and EURC).
import { publish } from './publish.js';
import { ARC, arcTxUrl, arcAltTxUrl } from '../config/chain-config';
import { esc, $, fmtAmount, tokIcon, bindMenu, menuBoxStyle, menuItemStyle, statusBadge } from './lib-ui.js';
import { toUnits, fromUnits, errorMessage } from '../lib/evm';
import { hasCode, readErc20Allowance } from '../lib/contract';
import {
  SWAP_TOKENS, MIN_SWAP_USDC, CIRBTC_REASON, SwapError, serviceMessage, serviceHttpStatus, pairSupport, fetchServiceState, requestQuote, createTrade,
  requestFundingPresign, submitFunding, getTradeStatus, checkQuote, checkFunding, requiredAllowance, mapTradeStatus,
  verifyPermit2, loadSwapRecords, saveSwapRecord, friendlyQuoteError,
} from '../lib/stablefx';
import { approveExact, ensureArcWallet } from './lib-tx.js';
import { mountAppKitSwap, update as akUpdate } from './swap-appkit.js';

/*
  Real two-step flow (see src/lib/stablefx.ts):
   1. Quote     live, tradable quote from Circle (through the server function that holds the API key)
   2. Approve   ERC-20 allowance for the Permit2 contract (on-chain)
   3. Swap      sign the quote, create the trade, sign the funding, submit it, then follow the status
  Nothing here fakes a price or sends tokens anywhere except through these steps.
*/
const TOKEN_NAMES = { USDC: 'USD Coin', EURC: 'Euro Coin', cirBTC: 'Circle Wrapped Bitcoin' };
const MENU_TOKENS = ['USDC', 'EURC', 'cirBTC'];
const MAX_USDC_RESERVE = 0.1; // USDC is also the gas token: MAX leaves a little for the approval's gas
const QUOTE_REFRESH_BEFORE_MS = 20000;

const sw = {
  tokenIn: 'USDC', tokenOut: 'EURC', amount: '', slip: 0, built: false,
  service: 'checking', quote: null, quoteKey: '', quoteLoading: false, quoteErr: '', baseline: null, moved: false,
  allowance: null, allowanceKey: '', failedKey: '', info: '', permit2Ok: null, busy: false, run: null, timer: null, debounce: null,
};

const me = () => WalletState.getAddr();
const provider = () => WalletManager.getProvider();
const fmt6 = (units) => fromUnits(units, 6, 6);
const balanceOf = (token) => (WalletState.connected() ? WalletState.getTokenBal(token, 'ARC') : 0);
const amountUnits = () => toUnits(sw.amount, 6);
// StableFX quotes a fixed rate: there is no slippage setting, so minimum received equals the quote (slip stays 0).
const slipBps = () => BigInt(Math.round(sw.slip * 100));

// ── Rendering helpers ──
function menuHtml(side) {
  return MENU_TOKENS.map((t) => {
    const supported = SWAP_TOKENS.includes(t);
    const style = supported ? menuItemStyle : `${menuItemStyle};opacity:.5;cursor:not-allowed`;
    const sub = supported ? esc(TOKEN_NAMES[t]) : esc(CIRBTC_REASON);
    return `<div data-side="${side}" data-tok="${t}" style="${style}" ${supported ? `onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''"` : ''}>${tokIcon(t, 24)}<div style="flex:1"><div>${t}</div><div style="font-size:11px;color:var(--text2);font-weight:500;line-height:1.4">${sub}</div></div><div style="font-size:11px;color:var(--text2)">${WalletState.connected() && supported ? fmtAmount(balanceOf(t), 2) : ''}</div></div>`;
  }).join('');
}

function build() {
  const root = $('swap-root');
  if (!root) return false;
  root.innerHTML = `
  <div style="max-width:480px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:18px">
    <div class="card animate" style="padding:12px 16px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="form-label" style="margin:0">Swap with</span>
        <div class="slip-btns" id="swap-route-btns"><button type="button" class="slip-btn" data-route="appkit">Circle App Kit</button><button type="button" class="slip-btn" data-route="stablefx">Circle StableFX</button></div></div>
      <div style="font-size:11px;color:var(--text2);margin-top:8px;line-height:1.6" id="swap-route-note"></div>
    </div>
    <div id="swap-appkit" style="display:none"></div>
    <div class="card animate" id="swap-sfx" style="display:none;background:linear-gradient(135deg,#0d1000,#111500);border-color:rgba(245,197,24,0.15)">
      <div class="section-header"><div class="section-title">Swap</div><span class="badge badge-yellow">Arc Testnet</span></div>

      <div class="swap-box">
        <div class="form-label">You pay</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <input class="swap-amount" id="sw-amount" placeholder="0.00" inputmode="decimal" autocomplete="off">
          <div style="position:relative">
            <button type="button" class="token-pill-sel" id="sw-in-btn"></button>
            <div id="sw-in-menu" style="${menuBoxStyle};left:auto;right:0;min-width:260px"></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:8px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text2)" id="swapInBalance">Balance: —</div>
          <div style="display:flex;gap:6px">
            <button type="button" class="pct-btn" data-pct="25">25%</button>
            <button type="button" class="pct-btn" data-pct="50">50%</button>
            <button type="button" class="pct-btn" data-pct="75">75%</button>
            <button type="button" class="pct-btn pct-btn-max" data-pct="100">MAX</button>
          </div>
        </div>
      </div>

      <div style="text-align:center;padding:12px 0"><button type="button" class="swap-arrow-btn" id="sw-flip" aria-label="Switch tokens">⇅</button></div>

      <div class="swap-box" style="margin-top:0">
        <div class="form-label">You receive</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <input class="swap-amount" id="sw-out" placeholder="0.00" readonly style="opacity:.7">
          <div style="position:relative">
            <button type="button" class="token-pill-sel" id="sw-out-btn"></button>
            <div id="sw-out-menu" style="${menuBoxStyle};left:auto;right:0;min-width:260px"></div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px" id="swapOutBalance">Balance: —</div>
      </div>

      <div class="info-box" style="margin-top:16px">
        <div class="info-row"><span class="k">Rate</span><span class="v" id="swapRate">—</span></div>
        <div class="info-row"><span class="k">Minimum received</span><span class="v yellow" id="swapMinReceived">—</span></div>
        <div class="info-row"><span class="k">StableFX fee</span><span class="v" id="swapFee">—</span></div>
        <div class="info-row"><span class="k">Network fee</span><span class="v green" id="swapNetFee" style="text-align:right">The swap itself needs no gas. Approval costs a little USDC gas.</span></div>
        <div class="info-row"><span class="k">Quote expires in</span><span class="v" id="swapExpiry">—</span></div>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:8px" id="swapRateNote">Quotes come from Circle StableFX. Minimum swap is ${MIN_SWAP_USDC} USDC.</div>

      <div id="swapNotice" style="display:none;margin-top:12px;padding:12px 14px;border-radius:12px;font-size:12px;line-height:1.6"></div>
      <div id="swapRun" style="margin-top:14px"></div>

      <button type="button" class="tx-btn tx-btn-yellow" id="swapBtn" style="margin-top:14px"><span id="swapBtnContent">Connect Wallet</span></button>
    </div>

    <div class="card animate">
      <div class="section-header"><div class="section-title">Swap history</div></div>
      <div id="swap-history"></div>
    </div>
  </div>`;

  mountAppKitSwap($('swap-appkit'), { renderHistory });
  $('swap-route-btns').addEventListener('click', (e) => { const b = e.target.closest('[data-route]'); if (b) setRoute(b.dataset.route); });
  setRoute(readRoute());
  bindMenu('sw-in-btn', 'sw-in-menu');
  bindMenu('sw-out-btn', 'sw-out-menu');
  root.addEventListener('click', (e) => {
    const item = e.target.closest('[data-tok]');
    if (item) { pick(item.dataset.side, item.dataset.tok); return; }
    const pct = e.target.closest('[data-pct]');
    if (pct) { setPercent(Number(pct.dataset.pct)); return; }
  });
  $('sw-amount').addEventListener('input', (e) => {
    const v = e.target.value.replace(',', '.');
    sw.amount = /^\d{0,12}(\.\d{0,6})?$/.test(v) ? v : sw.amount;
    e.target.value = sw.amount;
    sw.info = ''; if (!sw.busy && trackers.size === 0) sw.run = null;
    update();
  });
  $('sw-flip').onclick = () => { if (sw.busy) return; [sw.tokenIn, sw.tokenOut] = [sw.tokenOut, sw.tokenIn]; sw.amount = ''; $('sw-amount').value = ''; resetQuote(); update(); };
  $('swapBtn').onclick = onPrimary;
  sw.built = true;
  return true;
}

// Two ways to swap: Circle App Kit (default, no key needed) or Circle StableFX (fixed-rate quotes, needs StableFX access).
const ROUTE_KEY = 'arclance_swap_route';
const ROUTE_NOTES = {
  appkit: 'Works without any key. You see a real estimate before you swap and choose the maximum slippage.',
  stablefx: 'Fixed-rate quotes with a Permit2 approval and two signatures. Needs Circle StableFX access on this site.',
};
function readRoute() { try { return localStorage.getItem(ROUTE_KEY) === 'stablefx' ? 'stablefx' : 'appkit'; } catch { return 'appkit'; } }
function setRoute(route) {
  if (sw.busy) return;
  const r = route === 'stablefx' ? 'stablefx' : 'appkit';
  try { localStorage.setItem(ROUTE_KEY, r); } catch { /* the choice just is not remembered */ }
  $('swap-appkit').style.display = r === 'appkit' ? 'block' : 'none';
  $('swap-sfx').style.display = r === 'stablefx' ? 'block' : 'none';
  document.querySelectorAll('#swap-route-btns [data-route]').forEach((b) => b.classList.toggle('active', b.dataset.route === r));
  $('swap-route-note').textContent = ROUTE_NOTES[r];
}

function resetQuote() { sw.info = ''; sw.failedKey = ''; sw.quote = null; sw.quoteKey = ''; sw.quoteErr = ''; sw.baseline = null; sw.moved = false; sw.allowance = null; sw.allowanceKey = ''; sw.run = null; }

function pick(side, token) {
  if (!SWAP_TOKENS.includes(token) || sw.busy) return;
  if (side === 'in') { if (token === sw.tokenOut) sw.tokenOut = sw.tokenIn; sw.tokenIn = token; }
  else { if (token === sw.tokenIn) sw.tokenIn = sw.tokenOut; sw.tokenOut = token; }
  sw.amount = ''; if ($('sw-amount')) $('sw-amount').value = '';
  resetQuote();
  const menus = ['sw-in-menu', 'sw-out-menu']; menus.forEach((m) => { if ($(m)) $(m).style.display = 'none'; });
  update();
}


function setPercent(pct) {
  if (sw.busy) return;
  let bal = balanceOf(sw.tokenIn);
  if (pct === 100 && sw.tokenIn === 'USDC') bal = Math.max(0, bal - MAX_USDC_RESERVE);
  const amt = Math.floor((bal * pct / 100) * 1e6) / 1e6;
  sw.amount = amt > 0 ? String(amt) : '';
  $('sw-amount').value = sw.amount;
  update();
}

// ── Service, quote and allowance ──
async function refreshService() {
  sw.service = await fetchServiceState();
  update();
}

function quoteKeyNow() { return `${sw.tokenIn}>${sw.tokenOut}:${sw.amount}:${me() || ''}`; }

function wantQuote() {
  const units = amountUnits();
  if (!WalletState.connected() || sw.service !== 'ready' || sw.busy) return false;
  if (!(units > 0n) || (sw.tokenIn === 'USDC' && units < toUnits(String(MIN_SWAP_USDC), 6))) return false;
  if (Number(sw.amount) > balanceOf(sw.tokenIn)) return false;
  return true;
}

function scheduleQuote() {
  clearTimeout(sw.debounce);
  if (!wantQuote()) return;
  const key = quoteKeyNow();
  if ((sw.quoteKey === key && sw.quote) || sw.failedKey === key) return;
  sw.debounce = setTimeout(() => fetchQuote(key), 400);
}

async function fetchQuote(key, { refresh = false } = {}) {
  if (sw.quoteLoading) return;
  sw.quoteLoading = true; sw.quoteErr = ''; update();
  const req = { from: sw.tokenIn, to: sw.tokenOut, amount: sw.amount, address: me() };
  try {
    const q = await requestQuote(req);
    if (key !== quoteKeyNow()) { sw.quoteLoading = false; update(); return; } // the user changed the input meanwhile
    checkQuote(q, req);
    const toU = toUnits(q.to.amount, 6);
    if (!refresh || !sw.baseline) { sw.baseline = toU; sw.moved = false; }
    else if (toU * 10000n < sw.baseline * (10000n - slipBps())) sw.moved = true;
    sw.quote = q; sw.quoteKey = key; sw.allowanceKey = '';
  } catch (e) {
    sw.quote = null; sw.quoteKey = ''; sw.failedKey = key;
    if (e instanceof SwapError && (e.code === 'not_configured' || e.code === 'access_denied')) sw.service = e.code;
    else if (e instanceof SwapError && e.code === 'unreachable') sw.service = 'unreachable';
    sw.quoteErr = e instanceof SwapError ? friendlyQuoteError(e.code, e.message) : 'Quote request failed. Retry.';
    console.error('[swap] quote failed:', e instanceof SwapError ? `${e.code}: ${e.message}` : errorMessage(e));
  }
  sw.quoteLoading = false;
  update();
}

async function refreshAllowance() {
  if (!sw.quote || !WalletState.connected()) return;
  const key = `${sw.quote.id}:${me()}`;
  if (sw.allowanceKey === key) return;
  sw.allowanceKey = key;
  try {
    if (sw.permit2Ok === null || sw.permit2Ok === false) sw.permit2Ok = await verifyPermit2();
    sw.allowance = await readErc20Allowance(ARC.tokens[sw.tokenIn], me(), ARC.contracts.permit2);
  } catch { sw.allowance = null; sw.allowanceKey = ''; }
  update();
}

function quoteSecondsLeft() {
  if (!sw.quote || !sw.quote.expiresAt) return null;
  return Math.floor((Date.parse(sw.quote.expiresAt) - Date.now()) / 1000);
}

function tick() {
  const left = quoteSecondsLeft();
  const el = $('swapExpiry');
  if (el) el.textContent = left === null ? '—' : left > 0 ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : 'Expired';
  if (left !== null && left * 1000 < QUOTE_REFRESH_BEFORE_MS && !sw.busy && !sw.quoteLoading && sw.failedKey !== quoteKeyNow() && wantQuote() && $('page-swap')?.classList.contains('active')) fetchQuote(quoteKeyNow(), { refresh: true });
}

// ── Button ──
function buttonState() {
  const units = amountUnits();
  if (!WalletState.connected()) return { label: 'Connect Wallet', disabled: false, action: 'connect' };
  if (sw.service === 'checking') return { label: 'Checking swap service…', disabled: true };
  if (sw.service !== 'ready') return { label: 'Swap unavailable', disabled: true };
  if (!pairSupport(sw.tokenIn, sw.tokenOut).ok) return { label: 'Pair not supported', disabled: true };
  if (sw.busy) return { label: 'Working…', disabled: true };
  if (!(units > 0n)) return { label: 'Enter amount', disabled: true };
  if (Number(sw.amount) > balanceOf(sw.tokenIn)) return { label: 'Insufficient balance', disabled: true };
  if (sw.tokenIn === 'USDC' && units < toUnits(String(MIN_SWAP_USDC), 6)) return { label: `Minimum swap is ${MIN_SWAP_USDC} USDC`, disabled: true };
  if (WalletState.isWrongNetwork()) return { label: 'Switch to ' + ARC.name, disabled: false, action: 'switch' };
  if (sw.quoteLoading) return { label: 'Getting quote…', disabled: true };
  if (!sw.quote) return sw.quoteErr ? { label: 'Get quote again', disabled: false, action: 'requote' } : { label: 'Getting quote…', disabled: true };
  if (sw.moved) return { label: 'Accept new price', disabled: false, action: 'accept' };
  if (sw.permit2Ok === false) return { label: 'Approvals unavailable', disabled: true };
  if (sw.allowance === null) return { label: 'Checking approval…', disabled: true };
  if (sw.allowance < requiredAllowance(sw.quote)) return { label: `Approve ${sw.tokenIn}`, disabled: false, action: 'approve' };
  return { label: 'Swap', disabled: false, action: 'swap' };
}

async function onPrimary() {
  const st = buttonState();
  if (st.disabled) return;
  if (st.action === 'connect') { WalletManager.openModal(); return; }
  if (st.action === 'switch') { await WalletManager.switchToArc(); update(); return; }
  if (st.action === 'requote') { sw.failedKey = ''; fetchQuote(quoteKeyNow()); return; }
  if (st.action === 'accept') { sw.baseline = toUnits(sw.quote.to.amount, 6); sw.moved = false; update(); return; }
  if (st.action === 'approve') return runApprove();
  if (st.action === 'swap') return runSwap();
}

// ── Run status card ──
function setRun(steps, summary) { sw.run = { steps, summary }; renderRun(); }
function renderRun() {
  const el = $('swapRun');
  if (!el) return;
  if (!sw.run) { el.innerHTML = ''; return; }
  const dot = { done: '✓', active: '…', failed: '✕', pending: '' };
  const rows = sw.run.steps.map((s, i) => `<div class="tracker-step ${s.state === 'failed' ? 'pending' : s.state}"><div class="tracker-step-dot" ${s.state === 'failed' ? 'style="background:rgba(239,68,68,0.15);color:var(--red)"' : ''}>${dot[s.state] || i + 1}</div><div><div style="font-size:13px;font-weight:700;color:var(--text)">${esc(s.title)}</div><div style="font-size:11px;color:${s.state === 'failed' ? 'var(--red)' : 'var(--text2)'}">${esc(s.detail || '')}${s.tx ? ` <a href="${arcTxUrl(s.tx)}" target="_blank" rel="noopener" style="color:var(--yellow)">View on explorer ↗</a>` : ''}</div></div></div>`).join('');
  el.innerHTML = `<div style="border:1px solid var(--border);border-radius:14px;padding:12px 14px"><div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text2)">${esc(sw.run.summary)}</div>${rows}</div>`;
}

const STEP_TITLES = ['Approve', 'Sign the quote', 'Create the trade', 'Sign the funding', 'Settlement'];
const freshSteps = () => STEP_TITLES.map((title) => ({ title, state: 'pending', detail: '' }));

function rejectedText(e, what) {
  return e && e.code === 4001 ? `You rejected the ${what} in your wallet. Nothing was sent.` : errorMessage(e);
}

// ── Step 1: Permit2 approval (on-chain) ──
async function runApprove() {
  const q = sw.quote; const need = requiredAllowance(q); const token = sw.tokenIn;
  const steps = freshSteps(); steps[0] = { title: `Approve ${token} for Permit2`, state: 'active', detail: `Allowing up to ${fmt6(need)} ${token}. Confirm in your wallet.` };
  sw.busy = true; setRun(steps, 'Approval'); update();
  try {
    await ensureArcWallet();
    const hash = await approveExact(ARC.tokens[token], ARC.contracts.permit2, need, (t) => { steps[0].detail = `Allowing up to ${fmt6(need)} ${token}. ${t}`; renderRun(); });
    steps[0] = { title: `Approve ${token} for Permit2`, state: 'done', detail: `Approved ${fmt6(need)} ${token}.`, tx: hash };
    setRun(steps.slice(0, 1), 'Approval confirmed. Press Swap to continue.');
    sw.allowance = await readErc20Allowance(ARC.tokens[token], me(), ARC.contracts.permit2);
    WalletState.triggerChainSync();
  } catch (e) {
    steps[0] = { title: `Approve ${token} for Permit2`, state: 'failed', detail: rejectedText(e, 'approval') };
    setRun(steps.slice(0, 1), 'Approval failed');
  }
  sw.busy = false; update();
}

// ── Step 2: sign, trade, fund, follow status ──
async function signTyped(typedData) {
  const sig = await provider().request({ method: 'eth_signTypedData_v4', params: [me(), JSON.stringify(typedData)] });
  if (typeof sig !== 'string') throw new Error('Your wallet did not return a signature.');
  return sig;
}

async function runSwap() {
  const left = quoteSecondsLeft();
  if (left !== null && left < 20) { setMsg('The quote was about to expire, so I fetched a new one. Check it and press Swap again.'); fetchQuote(quoteKeyNow(), { refresh: true }); return; }
  const q = sw.quote; const tokenIn = sw.tokenIn; const tokenOut = sw.tokenOut; const wallet = me();
  const steps = freshSteps(); steps[0] = { title: 'Approve', state: 'done', detail: 'Permit2 is approved.' };
  const rec = { id: crypto.randomUUID(), tokenIn, tokenOut, amountIn: q.from.amount, amountOut: q.to.amount, status: 'pending', stage: 'signing', timestamp: Date.now() };
  const save = (patch) => { Object.assign(rec, patch); saveSwapRecord(wallet, rec); renderHistory(); };
  const mark = (i, state, detail, tx) => { steps[i] = { ...steps[i], state, detail: detail || '', ...(tx ? { tx } : {}) }; setRun(steps, `${q.from.amount} ${tokenIn} to ${q.to.amount} ${tokenOut}`); };
  sw.busy = true; update();
  let tradeCreated = false;
  try {
    await ensureArcWallet();
    checkQuote(q, { from: tokenIn, to: tokenOut, amount: sw.amount, address: wallet });
    mark(1, 'active', 'Confirm the signature in your wallet. No tokens move yet.');
    const sig1 = await signTyped(q.typedData);
    mark(1, 'done', 'Signed.'); save({});
    mark(2, 'active', 'Locking the rate with Circle…');
    const trade = await createTrade({ quoteId: q.id, address: wallet, message: q.typedData.message, signature: sig1 });
    tradeCreated = true;
    mark(2, 'done', 'Rate locked.'); save({ stage: 'trading', tradeId: trade.id, contractTradeId: trade.contractTradeId });
    mark(3, 'active', 'Getting the funding request…');
    const presign = await requestFundingPresign(String(trade.contractTradeId));
    checkFunding(presign, q, String(trade.contractTradeId));
    if (!(await hasCode(presign.typedData.message.spender))) throw new SwapError('bad_funding', 'The funding contract was not found on Arc Testnet. Nothing was signed.');
    mark(3, 'active', 'Confirm the funding signature in your wallet.');
    save({ stage: 'funding' });
    const sig2 = await signTyped(presign.typedData);
    mark(3, 'done', 'Signed.');
    mark(4, 'active', 'Sending the funding to Circle…');
    await submitFunding({ signature: sig2, permit2: presign.typedData.message });
    save({ stage: 'settling' });
    mark(4, 'active', 'Funded. Waiting for settlement on Arc Testnet…');
    sw.busy = false; resetAfterSwap(); update();
    await trackTrade(wallet, rec, steps, q);
  } catch (e) {
    const what = steps[3].state === 'active' || steps[3].state === 'done' ? 'funding signature' : 'signature';
    let msg = e instanceof SwapError ? e.message : rejectedText(e, what);
    if (tradeCreated && e && e.code === 4001) msg = 'You rejected the funding signature. The trade was created but not funded, so no tokens moved. It expires on its own in about 10 minutes.';
    const at = steps.findIndex((s) => s.state === 'active');
    mark(at === -1 ? 1 : at, 'failed', msg);
    save({ status: 'failed', error: msg });
    if (e instanceof SwapError && (e.code === 'access_denied' || e.code === 'not_configured')) sw.service = e.code;
    sw.busy = false; update();
  }
}

function resetAfterSwap() { sw.quote = null; sw.quoteKey = ''; sw.baseline = null; sw.moved = false; sw.allowance = null; sw.allowanceKey = ''; sw.amount = ''; if ($('sw-amount')) $('sw-amount').value = ''; }

const trackers = new Set();
async function trackTrade(wallet, rec, steps, q) {
  if (trackers.has(rec.id) || !rec.tradeId) return;
  trackers.add(rec.id);
  const show = (state, detail, tx) => { if (steps) { steps[4] = { ...steps[4], state, detail, ...(tx ? { tx } : {}) }; setRun(steps, q ? `${q.from.amount} ${rec.tokenIn} to ${q.to.amount} ${rec.tokenOut}` : 'Swap'); } };
  try {
    for (let i = 0; i < 240; i++) {
      let s;
      try { s = await getTradeStatus(rec.tradeId); } catch (e) {
        if (e instanceof SwapError && e.code === 'access_denied') { sw.service = 'access_denied'; update(); }
        await new Promise((r) => setTimeout(r, 6000)); continue;
      }
      const status = mapTradeStatus(s.status);
      const tx = s.settlementTransactionHash || undefined;
      rec = { ...rec, ...(tx ? { settlementTx: tx } : {}) };
      if (status === 'confirmed') {
        saveSwapRecord(wallet, { ...rec, status: 'confirmed', stage: 'done' });
        show('done', `Swap complete. ${rec.amountOut} ${rec.tokenOut} on its way to your wallet.`, tx);
        if (typeof showToast === 'function') showToast(`Swapped ${rec.amountIn} ${rec.tokenIn} to ${rec.tokenOut}`, tx ? { url: arcTxUrl(tx), label: 'View on explorer' } : undefined);
        WalletState.triggerChainSync(); renderHistory(); update(); return;
      }
      if (status === 'failed') {
        const msg = s.status === 'refunded' ? 'The swap was refunded. Your tokens were returned.' : 'The swap did not settle. Check your balances; nothing more will be taken.';
        saveSwapRecord(wallet, { ...rec, status: 'failed', error: msg });
        show('failed', msg, tx); renderHistory(); update(); return;
      }
      saveSwapRecord(wallet, { ...rec, status: 'pending' });
      show('active', s.status === 'taker_funded' ? 'Funded. Waiting for the liquidity provider to settle…' : 'Waiting for settlement on Arc Testnet…', tx);
      renderHistory();
      await new Promise((r) => setTimeout(r, 5000));
    }
    show('active', 'Still pending. It stays in your history and updates when you reopen this page.');
  } finally { trackers.delete(rec.id); }
}

function setMsg(text) { sw.info = text; update(); }

function paintNotice(text, kind) {
  const n = $('swapNotice'); if (!n) return;
  const c = { info: ['rgba(245,197,24,0.07)', 'rgba(245,197,24,0.25)', 'var(--yellow)'], error: ['rgba(239,68,68,0.08)', 'rgba(239,68,68,0.25)', 'var(--red)'] }[kind];
  n.style.cssText = `display:block;margin-top:12px;padding:12px 14px;border-radius:12px;font-size:12px;line-height:1.6;background:${c[0]};border:1px solid ${c[1]};color:${c[2]}`;
  n.textContent = text;
}

// ── Page update ──
function update() {
  if (!sw.built && !build()) return;
  akUpdate();
  const inBtn = $('sw-in-btn'); const outBtn = $('sw-out-btn');
  if (!inBtn) return;
  inBtn.innerHTML = `${tokIcon(sw.tokenIn, 24)}<span>${sw.tokenIn}</span><span style="font-size:10px;opacity:.7">▾</span>`;
  outBtn.innerHTML = `${tokIcon(sw.tokenOut, 24)}<span>${sw.tokenOut}</span><span style="font-size:10px;opacity:.7">▾</span>`;
  $('sw-in-menu').innerHTML = menuHtml('in');
  $('sw-out-menu').innerHTML = menuHtml('out');

  const connected = WalletState.connected();
  $('swapInBalance').textContent = connected ? `Balance: ${fmtAmount(balanceOf(sw.tokenIn), 6)} ${sw.tokenIn}` : 'Balance: —';
  $('swapOutBalance').textContent = connected ? `Balance: ${fmtAmount(balanceOf(sw.tokenOut), 6)} ${sw.tokenOut}` : 'Balance: —';

  const q = sw.quote;
  $('sw-out').value = q ? q.to.amount : '';
  $('swapRate').textContent = q ? `1 ${q.from.currency} = ${q.rate} ${q.to.currency}` : '—';
  $('swapMinReceived').textContent = q ? `${fmt6((toUnits(q.to.amount, 6) * (10000n - slipBps())) / 10000n)} ${q.to.currency}` : '—';
  $('swapFee').textContent = q && q.fee ? `${q.fee.amount} ${q.fee.currency}` : '—';
  tick();

  // One message area: service problems first, then quote problems, then a moved price
  if (sw.service !== 'ready' && sw.service !== 'checking') paintNotice(serviceMessage(sw.service, serviceHttpStatus()), 'info');
  else if (!WalletState.connected() || WalletState.isWrongNetwork()) paintNotice('Connect your wallet and switch to Arc Testnet.', 'info');
  else if (!pairSupport(sw.tokenIn, sw.tokenOut).ok) paintNotice(pairSupport(sw.tokenIn, sw.tokenOut).reason, 'error');
  else if (sw.permit2Ok === false) paintNotice('The Permit2 contract could not be verified on Arc Testnet, so approvals are switched off.', 'error');
  else if (sw.quoteErr) paintNotice(sw.quoteErr, 'error');
  else if (sw.info) paintNotice(sw.info, 'info');
  else if (sw.moved) paintNotice('The quote changed to a worse rate. Review the new amount, then press "Accept new price".', 'info');
  else if (sw.quote && sw.allowance !== null && sw.allowance < requiredAllowance(sw.quote)) paintNotice(`Step 1 of 2: approve ${sw.tokenIn} for the Permit2 contract (up to ${fmt6(requiredAllowance(sw.quote))} ${sw.tokenIn}). Step 2 signs and sends the swap.`, 'info');
  else $('swapNotice').style.display = 'none';

  const st = buttonState();
  const btn = $('swapBtn');
  btn.disabled = st.disabled; btn.style.opacity = st.disabled ? '.55' : ''; btn.style.cursor = st.disabled ? 'not-allowed' : '';
  $('swapBtnContent').innerHTML = sw.busy ? `<div class="spinner"></div> ${esc(st.label)}` : esc(st.label);
  renderRun();
  renderHistory();
  scheduleQuote();
  refreshAllowance();
}

// ── Swap history, saved per wallet address ──
export function loadSwapHistory(addr) { return loadSwapRecords(addr); }

function renderHistory() {
  const el = $('swap-history');
  if (!el) return;
  if (!WalletState.connected()) { el.innerHTML = '<div class="history-empty">Connect your wallet to see your swaps</div>'; return; }
  const list = loadSwapRecords(WalletState.getAddr());
  if (!list.length) { el.innerHTML = '<div class="history-empty">No swaps yet</div>'; return; }
  el.innerHTML = list.map((s) => `<div class="tx-row" style="gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center">${tokIcon(s.tokenIn, 26)}<span style="margin-left:-8px">${tokIcon(s.tokenOut, 26)}</span></div>
      <div style="flex:1;min-width:150px"><div style="font-size:13px;font-weight:600">${esc(s.amountIn)} ${esc(s.tokenIn)} → ${esc(s.amountOut)} ${esc(s.tokenOut)}</div>
      <div style="font-size:11px;color:var(--text2)">${new Date(s.timestamp).toLocaleString()}${s.error ? ' · ' + esc(s.error) : ''}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">${statusBadge(s.status === 'confirmed' ? 'ok' : s.status === 'failed' ? 'fail' : 'pending', s.status)}
      ${s.settlementTx ? `<a href="${(s.route === 'appkit' ? arcAltTxUrl : arcTxUrl)(s.settlementTx)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--yellow)">Explorer ↗</a>` : ''}</div>
    </div>`).join('');
}

// Resume following swaps that were still pending when the page was closed
function resumePending() {
  if (!WalletState.connected() || sw.service !== 'ready') return;
  const wallet = me();
  loadSwapRecords(wallet).filter((r) => r.status === 'pending' && r.tradeId && r.stage === 'settling').forEach((r) => trackTrade(wallet, r, null, null));
}

// ── Compatibility with the rest of the app ──
function calcSwapOut() { update(); }

function setPayPercent(pct) {
  const token = document.getElementById('payToken')?.value || 'USDC';
  const bal = WalletState.getTokenBal(token, 'ARC');
  if (!bal || bal <= 0) return;
  const amt = (bal * pct / 100);
  const el = document.getElementById('payAmount');
  if (el) { el.value = parseFloat(amt.toFixed(token === 'cirBTC' ? 8 : 6)); el.dispatchEvent(new Event('input')); }
}

window.AL_pages = window.AL_pages || {};
window.AL_pages.swap = async () => { update(); await refreshService(); resumePending(); };
document.addEventListener('DOMContentLoaded', () => { build(); update(); sw.timer = setInterval(tick, 1000); refreshService(); });

publish({ calcSwapOut, setPayPercent });
