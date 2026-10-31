// Swap through Circle App Kit, run from the browser with the user's own wallet (EIP-1193). Needs no key.
// Real estimate from the SDK, allowance handled by the SDK, result with an Arcscan link. Nothing is faked.
import { ARC, arcAltTxUrl } from '../config/chain-config';
import { esc, $, fmtAmount, tokIcon, bindMenu, menuBoxStyle, menuItemStyle, statusBadge } from './lib-ui.js';
import { saveSwapRecord } from '../lib/stablefx';
import {
  AK_TOKENS, AK_DECIMALS, AK_SLIPPAGE_PRESETS, AK_DEFAULT_SLIPPAGE_BPS, AK_USDC_GAS_RESERVE,
  normalizeAmountIn, estimatedRate, gasShortfall, explainAkError,
} from '../lib/appkit-swap';
import { estimateWithAppKit, swapWithAppKit } from '../lib/appkit-sdk';
import { ensureArcWallet } from './lib-tx.js';

const NAMES = { USDC: 'USD Coin', EURC: 'Euro Coin', cirBTC: 'Circle Wrapped Bitcoin' };
const ak = {
  tokenIn: 'USDC', tokenOut: 'EURC', amount: '', slipBps: AK_DEFAULT_SLIPPAGE_BPS,
  est: null, estKey: '', estAt: 0, loadingKey: '', loading: false, err: '', failedKey: '', seq: 0, busy: false, run: null, debounce: null, ctx: null,
};

// A swap estimate older than this is asked for again before the user can swap with it (rates can move).
const ESTIMATE_MAX_AGE_MS = 30000;
const me = () => WalletState.getAddr();
const bal = (t) => (WalletState.connected() ? WalletState.getTokenBal(t, 'ARC') : 0);
const fmtTok = (n, t) => fmtAmount(n, AK_DECIMALS[t] > 6 ? 8 : 6);
const amountNum = () => { const n = normalizeAmountIn(ak.amount, AK_DECIMALS[ak.tokenIn]); return n ? Number(n) : 0; };
const keyNow = () => `${ak.tokenIn}>${ak.tokenOut}:${normalizeAmountIn(ak.amount, AK_DECIMALS[ak.tokenIn]) || ''}:${ak.slipBps}:${me() || ''}`;

function menuHtml(side) {
  return AK_TOKENS.map((t) => `<div data-ak-side="${side}" data-ak-tok="${t}" style="${menuItemStyle}" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">${tokIcon(t, 24)}<div style="display:flex;flex-direction:column;line-height:1.25"><span>${t}</span><span style="font-size:11px;font-weight:400;color:var(--text2)">${esc(NAMES[t])}</span></div></div>`).join('');
}

export function mountAppKitSwap(container, ctx) {
  ak.ctx = ctx || {};
  container.innerHTML = `
    <div class="card animate" style="background:linear-gradient(135deg,#0d1000,#111500);border-color:rgba(245,197,24,0.15)">
      <div class="section-header"><div class="section-title">Swap</div><span class="badge badge-yellow">Arc Testnet</span></div>
      <div class="swap-box">
        <div class="form-label">You pay</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <input class="swap-amount" id="ak-amount" placeholder="0.00" inputmode="decimal" autocomplete="off">
          <div style="position:relative"><button type="button" class="token-pill-sel" id="ak-in-btn"></button><div id="ak-in-menu" style="${menuBoxStyle};left:auto;right:0;min-width:260px">${menuHtml('in')}</div></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:8px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text2)" id="ak-in-bal">Balance: —</div>
          <div style="display:flex;gap:6px">${[25, 50, 75, 100].map((p) => `<button type="button" class="pct-btn" data-ak-pct="${p}">${p === 100 ? 'MAX' : p + '%'}</button>`).join('')}</div>
        </div>
      </div>
      <div style="text-align:center;padding:12px 0"><button type="button" class="swap-arrow-btn" id="ak-flip" aria-label="Switch tokens">⇅</button></div>
      <div class="swap-box">
        <div class="form-label">You receive (estimate)</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <input class="swap-amount" id="ak-out" placeholder="0.00" readonly>
          <div style="position:relative"><button type="button" class="token-pill-sel" id="ak-out-btn"></button><div id="ak-out-menu" style="${menuBoxStyle};left:auto;right:0;min-width:260px">${menuHtml('out')}</div></div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px" id="ak-out-bal">Balance: —</div>
      </div>
      <div style="margin-top:16px">
        <div class="form-label" style="margin-bottom:0">Maximum slippage</div>
        <div class="slip-btns" style="margin-top:8px">${AK_SLIPPAGE_PRESETS.map((b) => `<button type="button" class="slip-btn" data-ak-slip="${b}">${b / 100}%</button>`).join('')}</div>
      </div>
      <div class="info-box" style="margin-top:16px">
        <div class="info-row"><span class="k">Estimated rate</span><span class="v" id="ak-rate">—</span></div>
        <div class="info-row"><span class="k">Minimum received</span><span class="v yellow" id="ak-min">—</span></div>
        <div class="info-row"><span class="k">Provider fee</span><span class="v" id="ak-fee-provider">—</span></div>
        <div class="info-row"><span class="k">Network fee (gas, paid in USDC)</span><span class="v" id="ak-fee-gas">—</span></div>
        <div class="info-row"><span class="k">Route</span><span class="v" id="ak-route">—</span></div>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:8px;line-height:1.6">Swaps run through Circle App Kit and are routed by a swap provider (a third-party aggregator such as LiFi, or Circle). The provider can change by route and its terms apply. Testnet pools can be unbalanced, so estimates may not match market prices. Your wallet asks you to sign and confirm.</div>
      <div id="ak-notice" style="display:none;margin-top:12px;padding:12px 14px;border-radius:12px;font-size:12px;line-height:1.6"></div>
      <div id="ak-run" style="margin-top:14px"></div>
      <button type="button" class="tx-btn tx-btn-yellow" id="ak-btn" style="margin-top:14px"><span id="ak-btn-content">Connect Wallet</span></button>
    </div>`;

  bindMenu('ak-in-btn', 'ak-in-menu');
  bindMenu('ak-out-btn', 'ak-out-menu');
  container.addEventListener('click', (e) => {
    const item = e.target.closest('[data-ak-tok]');
    if (item) { pick(item.dataset.akSide, item.dataset.akTok); return; }
    const pct = e.target.closest('[data-ak-pct]');
    if (pct) { setPercent(Number(pct.dataset.akPct)); return; }
    const slip = e.target.closest('[data-ak-slip]');
    if (slip && !ak.busy) { ak.slipBps = Number(slip.dataset.akSlip); reset(false); update(); }
  });
  $('ak-amount').addEventListener('input', (e) => {
    const v = e.target.value.replace(',', '.');
    const max = AK_DECIMALS[ak.tokenIn];
    ak.amount = new RegExp(`^\\d{0,12}(\\.\\d{0,${max}})?$`).test(v) ? v : ak.amount;
    e.target.value = ak.amount;
    if (!ak.busy) ak.run = null;
    update();
  });
  $('ak-flip').onclick = () => { if (ak.busy) return; [ak.tokenIn, ak.tokenOut] = [ak.tokenOut, ak.tokenIn]; ak.amount = ''; $('ak-amount').value = ''; reset(true); update(); };
  $('ak-btn').onclick = onPrimary;
  update();
  return { update };
}

function reset(clearRun) { ak.est = null; ak.estKey = ''; ak.err = ''; ak.failedKey = ''; ak.seq += 1; ak.loading = false; ak.loadingKey = ''; if (clearRun) ak.run = null; }

function pick(side, token) {
  if (ak.busy) return;
  if (side === 'in') { if (token === ak.tokenOut) ak.tokenOut = ak.tokenIn; ak.tokenIn = token; }
  else { if (token === ak.tokenIn) ak.tokenIn = ak.tokenOut; ak.tokenOut = token; }
  ak.amount = ''; if ($('ak-amount')) $('ak-amount').value = '';
  reset(true);
  ['ak-in-menu', 'ak-out-menu'].forEach((m) => { if ($(m)) $(m).style.display = 'none'; });
  update();
}

function setPercent(pct) {
  if (ak.busy) return;
  const d = AK_DECIMALS[ak.tokenIn];
  let b = bal(ak.tokenIn);
  if (pct === 100 && ak.tokenIn === 'USDC') b = Math.max(0, b - AK_USDC_GAS_RESERVE);
  const f = 10 ** d;
  const amt = Math.floor(((b * pct) / 100) * f) / f;
  ak.amount = amt > 0 ? amt.toFixed(d).replace(/\.?0+$/, '') : '';
  $('ak-amount').value = ak.amount;
  update();
}

// ── Estimate: debounced (400 ms); an answer that is no longer current is ignored ──
function wantEstimate() {
  if (!WalletState.connected() || ak.busy || ak.tokenIn === ak.tokenOut) return false;
  const n = amountNum();
  return n > 0 && n <= bal(ak.tokenIn) && !WalletState.isWrongNetwork();
}

function scheduleEstimate() {
  if (ak.busy) return; // a swap is in progress: keep what the user is looking at
  const key = keyNow();
  if (!wantEstimate()) { if (ak.est || ak.loading) { ak.est = null; ak.estKey = ''; ak.loading = false; ak.loadingKey = ''; ak.seq += 1; } return; }
  if (ak.loading && ak.loadingKey === key) return; // already asking for exactly this
  if ((ak.estKey === key && Date.now() - ak.estAt < ESTIMATE_MAX_AGE_MS) || ak.failedKey === key) return;
  clearTimeout(ak.debounce);
  ak.debounce = setTimeout(() => runEstimate(key), 400);
}

async function runEstimate(key) {
  if (key !== keyNow() || !wantEstimate()) return;
  const seq = ++ak.seq;
  ak.loading = true; ak.loadingKey = key; ak.err = ''; update();
  try {
    const provider = WalletManager.getProvider();
    if (!provider) throw new Error('Connect your wallet first.');
    const est = await estimateWithAppKit(provider, { tokenIn: ak.tokenIn, tokenOut: ak.tokenOut, amount: normalizeAmountIn(ak.amount, AK_DECIMALS[ak.tokenIn]), slippageBps: ak.slipBps });
    if (seq !== ak.seq || key !== keyNow()) return; // a newer request replaced this one
    ak.est = est; ak.estKey = key; ak.estAt = Date.now();
  } catch (e) {
    if (seq !== ak.seq) return;
    ak.est = null; ak.estKey = ''; ak.failedKey = key;
    ak.err = explainAkError(e).message;
    console.error('[swap] App Kit estimate failed:', explainAkError(e).code ?? '', explainAkError(e).kind);
  }
  ak.loading = false; ak.loadingKey = ''; update();
}

// ── Button ──
function gasMessage() {
  return gasShortfall(ak.est, bal('USDC'), ak.tokenIn, amountNum());
}

function buttonState() {
  if (!WalletState.connected()) return { label: 'Connect Wallet', disabled: false, action: 'connect' };
  if (ak.busy) return { label: 'Working…', disabled: true };
  if (!normalizeAmountIn(ak.amount, AK_DECIMALS[ak.tokenIn])) return { label: 'Enter amount', disabled: true };
  if (amountNum() > bal(ak.tokenIn)) return { label: 'Insufficient balance', disabled: true };
  if (WalletState.isWrongNetwork()) return { label: 'Switch to ' + ARC.name, disabled: false, action: 'switch' };
  if (gasMessage()) return { label: 'Not enough USDC for gas', disabled: true };
  if (ak.loading) return { label: 'Getting estimate…', disabled: true };
  if (!ak.est) return ak.err ? { label: 'Get estimate again', disabled: false, action: 'retry' } : { label: 'Getting estimate…', disabled: true };
  return { label: 'Swap', disabled: false, action: 'swap' };
}

function paintNotice(text, kind) {
  const n = $('ak-notice'); if (!n) return;
  n.style.display = 'block'; n.textContent = text;
  n.style.background = kind === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(245,197,24,0.06)';
  n.style.border = `1px solid ${kind === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(245,197,24,0.2)'}`;
  n.style.color = 'var(--text)';
}

function renderRun() {
  const el = $('ak-run'); if (!el) return;
  const r = ak.run;
  if (!r) { el.innerHTML = ''; return; }
  const link = r.txHash ? `<a href="${esc(arcAltTxUrl(r.txHash))}" target="_blank" rel="noopener" style="color:var(--yellow);font-size:12px">View on Arcscan ↗</a>` : '';
  const badge = statusBadge(r.state === 'confirmed' ? 'ok' : r.state === 'failed' ? 'fail' : 'pending', r.state === 'working' ? 'waiting for wallet' : r.state);
  el.innerHTML = `<div class="info-box" style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><strong style="font-size:13px">Swap status</strong>${badge}</div><div style="font-size:12px;color:var(--text2);line-height:1.6">${esc(r.text)}</div>${link}</div>`;
}

export function update() {
  if (!$('ak-amount')) return;
  scheduleEstimate();
  $('ak-in-btn').innerHTML = `${tokIcon(ak.tokenIn, 24)} ${esc(ak.tokenIn)} ▾`;
  $('ak-out-btn').innerHTML = `${tokIcon(ak.tokenOut, 24)} ${esc(ak.tokenOut)} ▾`;
  $('ak-in-bal').textContent = WalletState.connected() ? `Balance: ${fmtTok(bal(ak.tokenIn), ak.tokenIn)} ${ak.tokenIn}` : 'Balance: —';
  $('ak-out-bal').textContent = WalletState.connected() ? `Balance: ${fmtTok(bal(ak.tokenOut), ak.tokenOut)} ${ak.tokenOut}` : 'Balance: —';
  document.querySelectorAll('#swap-appkit [data-ak-slip]').forEach((b) => b.classList.toggle('active', Number(b.dataset.akSlip) === ak.slipBps));

  const e = ak.est;
  const fee = (f) => (f ? `${fmtAmount(Number(f.amount), 6)} ${f.token}` : '—');
  $('ak-out').value = e ? e.out : '';
  $('ak-rate').textContent = e && estimatedRate(e) ? `1 ${e.tokenIn} ≈ ${estimatedRate(e)} ${e.tokenOut}` : '—';
  $('ak-min').textContent = e && e.minOut ? `${e.minOut} ${e.tokenOut}` : '—';
  $('ak-fee-provider').textContent = e ? fee(e.providerFee) : '—';
  $('ak-fee-gas').textContent = e ? fee(e.gas) : '—';
  $('ak-route').textContent = e && (e.provider || e.tool) ? [e.tool, e.provider ? `via ${e.provider}` : ''].filter(Boolean).join(' ') : '—';

  const gas = WalletState.connected() && !WalletState.isWrongNetwork() && amountNum() > 0 ? gasMessage() : null;
  if (!WalletState.connected() || WalletState.isWrongNetwork()) paintNotice('Connect your wallet and switch to Arc Testnet.', 'info');
  else if (ak.err) paintNotice(ak.err, 'error');
  else if (gas) paintNotice(gas, 'error');
  else if (amountNum() > bal(ak.tokenIn)) paintNotice(`Your ${ak.tokenIn} balance is lower than this amount.`, 'error');
  else if ($('ak-notice')) $('ak-notice').style.display = 'none';
  renderRun();

  const b = buttonState();
  $('ak-btn-content').textContent = b.label;
  $('ak-btn').disabled = !!b.disabled;
  $('ak-btn').dataset.action = b.action || '';
}

// ── Actions ──
async function onPrimary() {
  const action = $('ak-btn').dataset.action;
  if (action === 'connect') { WalletManager.openModal(); return; }
  if (action === 'switch') { try { await ensureArcWallet(); WalletState.triggerChainSync(); } catch (e) { ak.err = explainAkError(e).message; } update(); return; }
  if (action === 'retry') { ak.failedKey = ''; ak.err = ''; update(); return; }
  if (action === 'swap') {
    if (Date.now() - ak.estAt > ESTIMATE_MAX_AGE_MS) { ak.estKey = ''; ak.est = null; update(); return; } // too old: ask again first
    await doSwap();
  }
}

async function doSwap() {
  const est = ak.est; if (!est) return;
  const amount = normalizeAmountIn(ak.amount, AK_DECIMALS[ak.tokenIn]);
  const wallet = me();
  ak.busy = true; ak.err = '';
  ak.run = { state: 'working', text: 'Check your wallet. It may ask you to sign a permit and then confirm the swap transaction.' };
  update();
  try {
    await ensureArcWallet();
    const res = await swapWithAppKit(WalletManager.getProvider(), { tokenIn: ak.tokenIn, tokenOut: ak.tokenOut, amount, slippageBps: ak.slipBps });
    const out = res.amountOut || est.out;
    const state = res.status;
    ak.run = {
      state, txHash: res.txHash || '',
      text: state === 'confirmed' ? `Swapped ${amount} ${ak.tokenIn} for about ${out} ${ak.tokenOut}.` : state === 'pending' ? 'The swap was submitted and is still pending.' : 'The swap did not complete.',
    };
    saveSwapRecord(wallet, { id: res.txHash || `ak-${Date.now()}`, tokenIn: ak.tokenIn, tokenOut: ak.tokenOut, amountIn: amount, amountOut: out, status: state, stage: 'done', settlementTx: res.txHash || undefined, route: 'appkit', timestamp: Date.now() });
    if (ak.ctx.renderHistory) ak.ctx.renderHistory();
    if (res.txHash && typeof showToast === 'function') showToast(`Swap ${state}`, { url: arcAltTxUrl(res.txHash), label: 'View on Arcscan' });
    ak.amount = ''; $('ak-amount').value = ''; ak.est = null; ak.estKey = '';
    WalletState.triggerChainSync(res.txHash || undefined);
  } catch (e) {
    const info = explainAkError(e);
    ak.run = { state: 'failed', text: info.message };
    console.error('[swap] App Kit swap failed:', info.code ?? '', info.kind);
  }
  ak.busy = false; update();
}
