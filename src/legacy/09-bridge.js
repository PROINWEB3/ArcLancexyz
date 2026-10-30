// Bridge page: Circle CCTP V2 between Arc Testnet and other testnets (USDC and EURC).
import { publish } from './publish.js';
import { ARC, BRIDGE_CHAINS, BRIDGE_TOKENS, CCTPX, getBridgeChain, chainTxUrl, bridgeTokenAddress, tokenRouteSupport } from '../config/chain-config';
import { esc, $, fmtAmount, netIcon, tokIcon, bindMenu, menuBoxStyle, menuItemStyle, statusBadge } from './lib-ui.js';
import { toUnits, fromUnits, waitForReceipt, switchWalletChain, walletChainId, shortAddress, errorMessage } from '../lib/evm';
import {
  encodeApprove, encodeDepositForBurn, encodeReceiveMessage, readBalance, readAllowance,
  getStandardFeeBps, maxFeeFor, getAttestation, isNonceUsed, spenderFor, getCctpxQuote, encodeCctpxTransfer,
} from '../lib/cctp';
import { loadBridgeHistory, saveBridgeRecord, isUnfinished } from '../lib/bridge-store';

/*
  Flow (all real transactions, nothing simulated):
   USDC:
   1. Approve   USDC allowance for TokenMessengerV2 on the source network (only if needed)
   2. Burn      TokenMessengerV2.depositForBurn(amount, domain, recipient, usdc, 0x0, maxFee, 2000)
   EURC (Circle "CCTP for non-USDC", routes confirmed by the Circle docs only):
   1. Approve   EURC allowance for the EURC TokenManager (only if needed)
   2. Burn      CrossChainTokenService.crossChainTransfer(tokenId, amount, domain, recipient, 0x0, 2000, quote, false, 0x)
   Both tokens then share steps 3 and 4:
   3. Attest    Circle's Iris API signs the burn (we poll it)
   4. Mint      MessageTransmitterV2.receiveMessage(message, attestation) on the destination
*/

const br = {
  from: 'arc', to: 'sepolia', token: 'USDC', amount: '', busy: false,
  balance: null, balanceErr: '', balanceKey: '',
  allowance: null, allowanceKey: '',
  feeBps: null, feeErr: '', feeKey: '',
  cctpxFee: null,
  active: null, msg: '', msgKind: 'info', built: false,
};
const pollers = new Set();

const chainOf = (key) => getBridgeChain(key);
const provider = () => WalletManager.getProvider();
const me = () => WalletState.getAddr();

function setMsg(text, kind = 'info') { br.msg = text; br.msgKind = kind; renderMsg(); }

function renderMsg() {
  const el = $('br-msg');
  if (!el) return;
  if (!br.msg) { el.style.display = 'none'; return; }
  const colors = { info: ['rgba(245,197,24,0.07)', 'rgba(245,197,24,0.25)', 'var(--yellow)'], error: ['rgba(239,68,68,0.08)', 'rgba(239,68,68,0.25)', 'var(--red)'], ok: ['rgba(0,230,118,0.08)', 'rgba(0,230,118,0.25)', 'var(--green)'] }[br.msgKind];
  el.style.cssText = `display:block;margin-top:12px;padding:12px 14px;border-radius:12px;background:${colors[0]};border:1px solid ${colors[1]};color:${colors[2]};font-size:12px;line-height:1.6`;
  el.textContent = br.msg;
}

function menuHtml(side) {
  return BRIDGE_CHAINS.map((c) => `<div data-side="${side}" data-chain="${c.key}" style="${menuItemStyle}" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">${netIcon(c.key, 26, c.name)}<div style="flex:1">${esc(c.name)}</div>${c.isArc ? '<span class="badge badge-yellow" style="font-size:9px">Arc</span>' : ''}</div>`).join('');
}

function tokMenuHtml() {
  return BRIDGE_TOKENS.map((t) => {
    const sup = tokenRouteSupport(t, br.from, br.to);
    const style = sup.ok ? menuItemStyle : menuItemStyle + ';opacity:.5;cursor:not-allowed';
    return `<div data-tok="${t}" style="${style}" ${sup.ok ? `onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''"` : ''}>${tokIcon(t, 26)}<div style="flex:1"><div>${t}</div>${sup.ok ? '' : `<div style="font-size:11px;font-weight:500;color:var(--text2);line-height:1.4">${esc(sup.reason)}</div>`}</div></div>`;
  }).join('');
}

function pickToken(t) {
  if (!tokenRouteSupport(t, br.from, br.to).ok) return;
  if (br.token !== t) { br.token = t; br.amount = ''; if ($('br-amount')) $('br-amount').value = ''; setMsg(''); }
  const menu = $('br-tok-menu'); if (menu) menu.style.display = 'none';
  update();
}

// If the chosen network pair does not support the selected token, fall back to USDC and say why.
function ensureTokenSupported() {
  const sup = tokenRouteSupport(br.token, br.from, br.to);
  if (!sup.ok) { const t = br.token; br.token = 'USDC'; br.amount = ''; if ($('br-amount')) $('br-amount').value = ''; setMsg(`${t} is not available for this route. ${sup.reason} Switched to USDC.`); }
}

function build() {
  const root = $('bridge-root');
  if (!root) return false;
  root.innerHTML = `
  <div style="max-width:520px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:18px">
    <div class="card animate" style="background:linear-gradient(135deg,#0a0d20,#0e0a20);border-color:rgba(108,63,196,0.18)">
      <div class="section-header"><div class="section-title">Bridge USDC and EURC</div><span class="badge badge-purple">Circle CCTP V2</span></div>
      <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:14px">Move test USDC or EURC from one network to another. Your tokens are burned on the first network and the same amount is created on the second one. Testnet only.</div>

      <div class="swap-box">
        <div class="form-label">From</div>
        <div style="position:relative;margin-top:8px">
          <button type="button" class="token-pill-sel" id="br-from-btn" style="width:100%;justify-content:space-between"></button>
          <div id="br-from-menu" style="${menuBoxStyle};width:100%"></div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px" id="br-from-bal">Balance: —</div>
      </div>

      <div style="text-align:center;padding:12px 0"><button type="button" class="swap-arrow-btn" id="br-flip" aria-label="Swap networks">⇅</button></div>

      <div class="swap-box" style="margin-top:0">
        <div class="form-label">To</div>
        <div style="position:relative;margin-top:8px">
          <button type="button" class="token-pill-sel" id="br-to-btn" style="width:100%;justify-content:space-between"></button>
          <div id="br-to-menu" style="${menuBoxStyle};width:100%"></div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px" id="br-to-note">You receive on your connected wallet address.</div>
      </div>

      <div class="swap-box" style="margin-top:14px">
        <div class="form-label">Amount</div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <input class="swap-amount" id="br-amount" placeholder="0.00" inputmode="decimal" autocomplete="off">
          <div style="position:relative">
            <button type="button" class="token-pill-sel" id="br-tok-btn"></button>
            <div id="br-tok-menu" style="${menuBoxStyle};left:auto;right:0;min-width:260px"></div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px">
          <button type="button" class="pct-btn" data-pct="25">25%</button>
          <button type="button" class="pct-btn" data-pct="50">50%</button>
          <button type="button" class="pct-btn" data-pct="75">75%</button>
          <button type="button" class="pct-btn pct-btn-max" data-pct="100">MAX</button>
        </div>
      </div>

      <div class="info-box" style="margin-top:16px">
        <div class="info-row"><span class="k">Estimated time</span><span class="v" id="br-time">—</span></div>
        <div class="info-row"><span class="k">Bridge fee</span><span class="v green" id="br-fee">—</span></div>

        <div class="info-row"><span class="k">You receive</span><span class="v yellow" id="br-receive">—</span></div>
        <div class="info-row"><span class="k">Gas you need</span><span class="v" id="br-gas" style="text-align:right">—</span></div>
      </div>
      <div id="br-msg" style="display:none"></div>
      <button type="button" class="tx-btn tx-btn-yellow" id="br-btn" style="margin-top:14px"><span id="br-btn-content">Connect Wallet</span></button>
      <div style="font-size:11px;color:var(--text2);margin-top:10px">Need test USDC? <a href="${ARC.faucetUrl}" target="_blank" rel="noopener" style="color:var(--yellow)">Circle faucet</a></div>
    </div>

    <div class="card animate" id="br-track-card" style="display:none">
      <div class="section-header"><div class="section-title">Transfer progress</div><span id="br-track-badge"></span></div>
      <div id="br-track"></div>
    </div>

    <div class="card animate">
      <div class="section-header"><div class="section-title">Bridge history</div></div>
      <div id="br-history"></div>
    </div>
  </div>`;
  bindMenu('br-from-btn', 'br-from-menu');
  bindMenu('br-to-btn', 'br-to-menu');
  bindMenu('br-tok-btn', 'br-tok-menu');
  root.addEventListener('click', (e) => {
    const tok = e.target.closest('[data-tok]');
    if (tok) { pickToken(tok.dataset.tok); return; }
    const item = e.target.closest('[data-chain]');
    if (item) { pickChain(item.dataset.side, item.dataset.chain); return; }
    const pct = e.target.closest('[data-pct]');
    if (pct) { setPercent(Number(pct.dataset.pct)); return; }
    const resume = e.target.closest('[data-resume]');
    if (resume) { resumeTransfer(resume.dataset.resume); return; }
    const view = e.target.closest('[data-view]');
    if (view) { viewTransfer(view.dataset.view); return; }
    const mint = e.target.closest('[data-mint]');
    if (mint) { doMint(mint.dataset.mint); }
  });
  $('br-amount').addEventListener('input', (e) => {
    const v = e.target.value.replace(',', '.');
    br.amount = /^\d*\.?\d*$/.test(v) ? v : br.amount;
    e.target.value = br.amount;
    setMsg('');
    update();
  });
  $('br-flip').onclick = () => { [br.from, br.to] = [br.to, br.from]; br.amount = ''; $('br-amount').value = ''; setMsg(''); ensureTokenSupported(); update(); };
  $('br-btn').onclick = onPrimary;
  br.built = true;
  return true;
}

function pickChain(side, key) {
  if (side === 'from') { if (key === br.to) br.to = br.from; br.from = key; }
  else { if (key === br.from) br.from = br.to; br.to = key; }
  br.amount = ''; if ($('br-amount')) $('br-amount').value = '';
  setMsg('');
  ensureTokenSupported();
  update();
}

function setPercent(pct) {
  if (br.balance === null) return;
  const units = (br.balance * BigInt(pct)) / 100n;
  br.amount = fromUnits(units, 6, 6);
  if (br.amount === '0') br.amount = '';
  $('br-amount').value = br.amount;
  update();
}

// ── Data that depends on the selected route and wallet ──
async function refreshRouteData() {
  const from = chainOf(br.from); const to = chainOf(br.to);
  const addr = me();
  const tok = br.token;
  const bKey = `${br.from}:${tok}:${addr || ''}`;
  if (addr && br.balanceKey !== bKey) {
    br.balanceKey = bKey; br.balance = null; br.balanceErr = '';
    readBalance(from, addr, tok).then((v) => { if (br.balanceKey === bKey) { br.balance = v; update(); } })
      .catch((e) => { if (br.balanceKey === bKey) { br.balanceErr = e.message || 'Could not read balance'; update(); } });
  }
  const amt = toUnits(br.amount, 6);
  const fKey = `${br.from}>${br.to}:${tok}`;
  if (br.feeKey !== fKey) {
    br.feeKey = fKey; br.feeBps = null; br.cctpxFee = null; br.feeErr = '';
    if (tok === 'EURC') {
      getCctpxQuote(from.cctpDomain, to.cctpDomain, 1000000n) /* estimate only; a fresh quote is signed at send time */.then((q) => { if (br.feeKey === fKey) { br.cctpxFee = q.feeTotalAmount; update(); } })
        .catch((e) => { if (br.feeKey === fKey) { br.feeErr = e.message || 'Could not load fee'; update(); } });
    } else {
      getStandardFeeBps(from.cctpDomain, to.cctpDomain).then((v) => { if (br.feeKey === fKey) { br.feeBps = v; update(); } })
        .catch((e) => { if (br.feeKey === fKey) { br.feeErr = e.message || 'Could not load fee'; update(); } });
    }
  }
  const aKey = `${br.from}:${tok}:${addr || ''}`;
  if (addr && amt > 0n && br.allowanceKey !== aKey) {
    br.allowanceKey = aKey;
    readAllowance(from, addr, tok).then((v) => { if (br.allowanceKey === aKey) { br.allowance = v; update(); } })
      .catch(() => { if (br.allowanceKey === aKey) { br.allowance = null; } });
  }
}

const feeReady = () => (br.token === 'EURC' ? br.cctpxFee !== null : br.feeBps !== null);

function buttonState() {
  const from = chainOf(br.from); const to = chainOf(br.to);
  const amt = toUnits(br.amount, 6);
  const sup = tokenRouteSupport(br.token, br.from, br.to);
  if (!sup.ok) return { label: 'Token not supported on this route', disabled: true };
  if (!WalletState.connected()) return { label: 'Connect Wallet', disabled: false, action: 'connect' };
  if (br.from === br.to) return { label: 'Choose two different networks', disabled: true };
  if (!(amt > 0n)) return { label: 'Enter amount', disabled: true };
  if (br.balance !== null && amt > br.balance) return { label: 'Insufficient balance', disabled: true };
  if (br.busy) return { label: 'Working…', disabled: true };
  if (!feeReady()) return { label: br.feeErr ? 'Fee unavailable' : 'Loading fee…', disabled: true };
  if (br.walletChain && br.walletChain !== from.chainIdHex.toLowerCase()) return { label: `Switch to ${from.name}`, disabled: false, action: 'switch' };
  if (br.allowance !== null && br.allowance < amt) return { label: `Approve ${br.token}`, disabled: false, action: 'approve' };
  return { label: `Bridge to ${to.name}`, disabled: false, action: 'burn' };
}

async function onPrimary() {
  const st = buttonState();
  if (st.disabled) return;
  if (st.action === 'connect') { WalletManager.openModal(); return; }
  const from = chainOf(br.from);
  try {
    br.busy = true; update();
    if (st.action === 'switch') { await switchWalletChain(provider(), from); await refreshWalletChain(); }
    else if (st.action === 'approve') await doApprove();
    else if (st.action === 'burn') await doBurn();
  } catch (err) {
    setMsg(errorMessage(err), 'error');
  } finally {
    br.busy = false; update();
  }
}

async function refreshWalletChain() {
  try { br.walletChain = provider() ? await walletChainId(provider()) : ''; } catch { br.walletChain = ''; }
}

async function sendTx(tx) {
  const hash = await provider().request({ method: 'eth_sendTransaction', params: [{ from: me(), ...tx }] });
  if (typeof hash !== 'string') throw new Error('Wallet did not return a transaction hash.');
  return hash;
}

async function doApprove() {
  const from = chainOf(br.from); const amt = toUnits(br.amount, 6);
  const tok = br.token;
  setMsg(`Approving ${tok} on ${from.name}. Confirm in your wallet.`);
  // Approve exactly the amount being bridged, never unlimited
  const hash = await sendTx({ to: bridgeTokenAddress(from, tok), data: encodeApprove(spenderFor(from, tok), amt) });
  if (typeof showToast === 'function') showToast(`${tok} approval: pending`, { url: chainTxUrl(from, hash), label: 'View on explorer' });
  setMsg(`Approval sent. Waiting for ${from.name} to confirm…`);
  const receipt = await waitForReceipt(from.rpcUrl, hash);
  if (!receipt) throw new Error('The approval is still pending. Check the explorer, then try again.');
  if (receipt.status !== 'success') { if (typeof showToast === 'function') showToast(`${tok} approval: failed`, { url: chainTxUrl(from, hash), label: 'View on explorer' }); throw new Error('The approval failed on the network.'); }
  if (typeof showToast === 'function') showToast(`${tok} approved`, { url: chainTxUrl(from, hash), label: 'View on explorer' });
  br.allowance = await readAllowance(from, me(), tok);
  setMsg('Approved. Now press Bridge.', 'ok');
}

async function doBurn() {
  const from = chainOf(br.from); const to = chainOf(br.to);
  const tok = br.token;
  const amt = toUnits(br.amount, 6);
  setMsg(`Sending your ${tok} from ${from.name}. Confirm in your wallet.`);
  let burnTx;
  if (tok === 'EURC') {
    // Fresh signed quote right before sending, because quotes expire. The fee is the transaction value.
    const quote = await getCctpxQuote(from.cctpDomain, to.cctpDomain, amt);
    const data = encodeCctpxTransfer({ amount: amt, destinationDomain: to.cctpDomain, recipient: me(), quote });
    burnTx = await sendTx({ to: CCTPX.crossChainTokenService, data, value: '0x' + quote.feeTotalAmount.toString(16) });
  } else {
    const maxFee = maxFeeFor(amt, br.feeBps);
    const data = encodeDepositForBurn({ amount: amt, destinationDomain: to.cctpDomain, recipient: me(), burnToken: from.usdc, maxFee });
    burnTx = await sendTx({ to: from.tokenMessengerV2, data });
  }
  const rec = {
    id: burnTx, from: br.from, to: br.to, token: tok, amount: fromUnits(amt, 6, 6), sender: me(), recipient: me(),
    stage: 'burn', burnTx, createdAt: Date.now(), updatedAt: Date.now(),
  };
  saveBridgeRecord(me(), rec);
  if (typeof showToast === 'function') showToast(`${tok} transfer: pending`, { url: chainTxUrl(from, burnTx), label: 'View on explorer' });
  br.active = rec.id;
  br.amount = ''; $('br-amount').value = '';
  renderAll();
  setMsg(`Transfer sent. Waiting for ${from.name} to confirm…`);
  const receipt = await waitForReceipt(from.rpcUrl, burnTx);
  if (!receipt) { setMsg('Your transfer is still pending. It is saved in Bridge history; press Resume when it confirms.', 'info'); return; }
  if (receipt.status !== 'success') {
    saveBridgeRecord(me(), { ...rec, stage: 'failed', error: 'The burn transaction failed on the network.' });
    if (typeof showToast === 'function') showToast(`${tok} transfer: failed`, { url: chainTxUrl(from, burnTx), label: 'View on explorer' });
    renderAll();
    throw new Error(`The transfer failed on the network. No ${tok} was moved.`);
  }
  saveBridgeRecord(me(), { ...rec, stage: 'attestation' });
  renderAll();
  if (typeof showToast === 'function') showToast(`${tok} sent from ${from.name}`, { url: chainTxUrl(from, burnTx), label: 'View on explorer' });
  WalletState.triggerChainSync(burnTx);
  br.balanceKey = ''; br.allowanceKey = ''; br.allowance = null; br.feeKey = '';
  startPolling(rec.id);
}

// ── Attestation polling and mint ──
const findRecord = (id) => loadBridgeHistory(me()).find((r) => r.id === id);

function startPolling(id) {
  if (pollers.has(id)) return;
  pollers.add(id);
  setMsg('Waiting for Circle to confirm your transfer. You can leave this page and come back with Resume.');
  (async () => {
    try {
      for (;;) {
        const rec = findRecord(id);
        if (!rec || rec.stage === 'complete' || rec.stage === 'failed') break;
        const from = chainOf(rec.from);
        let att;
        try { att = await getAttestation(from.cctpDomain, rec.burnTx); } catch { att = { status: 'pending' }; }
        if (att.status === 'complete') {
          saveBridgeRecord(rec.sender, { ...rec, stage: 'mint', message: att.message, attestation: att.attestation, eventNonce: att.eventNonce });
          renderAll();
          setMsg(`Circle confirmed your transfer. Press "Receive on ${chainOf(rec.to).name}" to finish.`, 'ok');
          break;
        }
        await new Promise((r) => setTimeout(r, 6000));
      }
    } finally { pollers.delete(id); }
  })();
}

async function doMint(id) {
  const rec = findRecord(id);
  if (!rec || !rec.message || !rec.attestation) { setMsg('Attestation is not ready yet.', 'info'); return; }
  const to = chainOf(rec.to);
  try {
    br.busy = true; update();
    if (rec.eventNonce && await isNonceUsed(to, rec.eventNonce)) {
      saveBridgeRecord(rec.sender, { ...rec, stage: 'complete' });
      setMsg('This transfer was already received on ' + to.name + '.', 'ok');
      renderAll(); return;
    }
    setMsg(`Switching your wallet to ${to.name}…`);
    await switchWalletChain(provider(), to);
    await refreshWalletChain();
    setMsg(`Receiving your ${rec.token || 'USDC'} on ${to.name}. Confirm in your wallet.`);
    const hash = await sendTx({ to: to.messageTransmitterV2, data: encodeReceiveMessage(rec.message, rec.attestation) });
    saveBridgeRecord(rec.sender, { ...rec, stage: 'mint', mintTx: hash });
    if (typeof showToast === 'function') showToast(`Receive on ${to.name}: pending`, { url: chainTxUrl(to, hash), label: 'View on explorer' });
    renderAll();
    const receipt = await waitForReceipt(to.rpcUrl, hash);
    if (!receipt) { setMsg('The receive transaction is still pending. Press Resume to check it later.', 'info'); return; }
    if (receipt.status !== 'success') { if (typeof showToast === 'function') showToast(`Receive on ${to.name}: failed`, { url: chainTxUrl(to, hash), label: 'View on explorer' }); throw new Error('The receive transaction failed on the network. You can try again.'); }
    saveBridgeRecord(rec.sender, { ...rec, stage: 'complete', mintTx: hash });
    if (typeof showToast === 'function') showToast(`${rec.token || 'USDC'} received on ${to.name}`, { url: chainTxUrl(to, hash), label: 'View on explorer' });
    setMsg(`Done. ${rec.amount} ${rec.token || 'USDC'} arrived on ${to.name}.`, 'ok');
    WalletState.loadPeerBalances(rec.sender);
    WalletState.loadFromChain(rec.sender);
  } catch (err) {
    setMsg(errorMessage(err), 'error');
  } finally {
    br.busy = false; renderAll(); update();
  }
}

function resumeTransfer(id) {
  const rec = findRecord(id);
  if (!rec) return;
  br.active = id;
  if (rec.stage === 'mint' && rec.message) { renderAll(); setMsg(`Press "Receive on ${chainOf(rec.to).name}" to finish.`, 'ok'); return; }
  if (rec.stage === 'mint' && rec.mintTx) { checkMintTx(rec); return; }
  saveBridgeRecord(rec.sender, { ...rec, stage: 'attestation' });
  renderAll();
  startPolling(id);
}

async function checkMintTx(rec) {
  const to = chainOf(rec.to);
  const receipt = await waitForReceipt(to.rpcUrl, rec.mintTx, 15000);
  if (receipt && receipt.status === 'success') { saveBridgeRecord(rec.sender, { ...rec, stage: 'complete' }); setMsg('That transfer is complete.', 'ok'); }
  else { saveBridgeRecord(rec.sender, { ...rec, stage: 'attestation', mintTx: undefined }); startPolling(rec.id); }
  renderAll();
}

function viewTransfer(id) { br.active = id; renderAll(); }

// ── Rendering ──
function stepHtml(state, n, title, detail) {
  const dot = state === 'done' ? '✓' : String(n);
  return `<div class="tracker-step ${state}"><div class="tracker-step-dot">${dot}</div><div><div style="font-size:13px;font-weight:700;color:var(--text)">${n}. ${title}</div><div style="font-size:11px;color:var(--text2)">${detail}</div></div></div>`;
}

function renderTracker() {
  const card = $('br-track-card');
  if (!card) return;
  const rec = br.active ? findRecord(br.active) : null;
  if (!rec) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  const from = chainOf(rec.from); const to = chainOf(rec.to);
  const link = (c, h) => h ? ` <a href="${chainTxUrl(c, h)}" target="_blank" rel="noopener" style="color:var(--yellow)">View ↗</a>` : '';
  const tk = rec.token || 'USDC';
  const s = rec.stage;
  const burnDone = ['attestation', 'mint', 'complete'].includes(s);
  const attDone = ['mint', 'complete'].includes(s) && !!rec.attestation || s === 'complete';
  const steps = [
    stepHtml('done', 1, 'Approve ' + esc(tk), 'Allowance set on ' + esc(from.name)),
    stepHtml(burnDone ? 'done' : s === 'failed' ? 'pending' : 'active', 2, 'Send ' + esc(tk) + ' from ' + esc(from.name), (burnDone ? 'Confirmed.' : s === 'failed' ? esc(rec.error || 'Failed.') : 'Waiting for the network to confirm…') + link(from, rec.burnTx)),
    stepHtml(attDone ? 'done' : s === 'attestation' ? 'active' : 'pending', 3, 'Circle confirms the transfer', attDone ? 'Confirmed by Circle.' : 'About ' + esc(from.attestationTime) + '. You can leave and come back.'),
    stepHtml(s === 'complete' ? 'done' : s === 'mint' ? 'active' : 'pending', 4, 'Receive on ' + esc(to.name),
      s === 'complete' ? 'Arrived.' + link(to, rec.mintTx)
        : s === 'mint' ? (rec.mintTx ? 'Waiting for ' + esc(to.name) + ' to confirm…' + link(to, rec.mintTx) : `<button class="btn btn-sm btn-primary" style="margin-top:6px" data-mint="${esc(rec.id)}">Receive on ${esc(to.name)}</button>`)
        : 'Unlocks after Circle confirms.'),
  ];
  $('br-track').innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;font-weight:600">${netIcon(rec.from, 22, from.name)}<span>${esc(from.name)}</span><span style="color:var(--text2)">→</span>${netIcon(rec.to, 22, to.name)}<span>${esc(to.name)}</span><span style="margin-left:auto">${tokIcon(tk, 18)} ${esc(rec.amount)} ${esc(tk)}</span></div>${steps.join('')}`;
  $('br-track-badge').innerHTML = s === 'complete' ? statusBadge('ok', 'Complete') : s === 'failed' ? statusBadge('fail', 'Failed') : statusBadge('pending', 'In progress');
}

function renderHistory() {
  const el = $('br-history');
  if (!el) return;
  if (!WalletState.connected()) { el.innerHTML = '<div class="history-empty">Connect your wallet to see your transfers</div>'; return; }
  const list = loadBridgeHistory(me());
  if (!list.length) { el.innerHTML = '<div class="history-empty">No bridge transfers yet</div>'; return; }
  el.innerHTML = list.map((r) => {
    const from = chainOf(r.from); const to = chainOf(r.to);
    if (!from || !to) return '';
    const badge = r.stage === 'complete' ? statusBadge('ok', 'Complete') : r.stage === 'failed' ? statusBadge('fail', 'Failed') : statusBadge('pending', 'In progress');
    return `<div class="tx-row" style="gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center">${netIcon(r.from, 26, from.name)}<span style="margin-left:-8px">${netIcon(r.to, 26, to.name)}</span></div>
      <div style="flex:1;min-width:140px"><div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px">${tokIcon(r.token || 'USDC', 16)}${esc(r.amount)} ${esc(r.token || 'USDC')} · ${esc(from.name)} → ${esc(to.name)}</div>
      <div style="font-size:11px;color:var(--text2)">${new Date(r.createdAt).toLocaleString()}</div></div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${badge}
        ${r.burnTx ? `<a href="${chainTxUrl(from, r.burnTx)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--yellow)">Sent ↗</a>` : ''}
        ${r.mintTx ? `<a href="${chainTxUrl(to, r.mintTx)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--yellow)">Received ↗</a>` : ''}
        ${isUnfinished(r) ? `<button class="btn btn-sm btn-primary" data-resume="${esc(r.id)}">Resume</button>` : `<button class="btn btn-sm btn-ghost" data-view="${esc(r.id)}">Details</button>`}
      </div></div>`;
  }).join('');
}

function renderAll() { renderTracker(); renderHistory(); }

function update() {
  if (!br.built && !build()) return;
  const from = chainOf(br.from); const to = chainOf(br.to);
  if (!$('br-from-btn')) return;
  $('br-from-btn').innerHTML = `<span style="display:flex;align-items:center;gap:8px">${netIcon(br.from, 24, from.name)}<span>${esc(from.name)}</span></span><span style="font-size:10px;opacity:.7">▾</span>`;
  $('br-to-btn').innerHTML = `<span style="display:flex;align-items:center;gap:8px">${netIcon(br.to, 24, to.name)}<span>${esc(to.name)}</span></span><span style="font-size:10px;opacity:.7">▾</span>`;
  $('br-from-menu').innerHTML = menuHtml('from');
  $('br-to-menu').innerHTML = menuHtml('to');
  $('br-tok-btn').innerHTML = `<span style="display:flex;align-items:center;gap:8px">${tokIcon(br.token, 24)}<span>${br.token}</span></span><span style="font-size:10px;opacity:.7">▾</span>`;
  $('br-tok-menu').innerHTML = tokMenuHtml();

  const connected = WalletState.connected();
  $('br-from-bal').textContent = !connected ? 'Balance: —' : br.balanceErr ? 'Balance unavailable. ' + br.balanceErr : br.balance === null ? 'Balance: loading…' : `Balance: ${fmtAmount(Number(fromUnits(br.balance, 6, 6)), 6)} ${br.token}`;
  $('br-to-note').textContent = connected ? `You receive on ${shortAddress(me())} (your wallet).` : 'You receive on your connected wallet address.';

  const amt = toUnits(br.amount, 6);
  $('br-time').textContent = `About ${from.attestationTime}`;
  const tk = br.token;
  const nat = from.nativeCurrency.symbol;
  let fee = 0n;
  if (!feeReady()) $('br-fee').textContent = br.feeErr ? 'Could not load. Try changing the route.' : 'Loading…';
  else if (tk === 'EURC') $('br-fee').textContent = br.cctpxFee === 0n ? '0 (standard transfer)' : `${fromUnits(br.cctpxFee, 18, 6)} ${nat} (paid in gas token)`;
  else if (br.feeBps === 0) $('br-fee').textContent = '0 USDC (standard transfer)';
  else $('br-fee').textContent = `Up to ${fromUnits(maxFeeFor(amt > 0n ? amt : 1000000n, br.feeBps), 6, 6)} USDC`;
  if (tk === 'USDC') fee = br.feeBps ? maxFeeFor(amt, br.feeBps) : 0n;
  $('br-receive').textContent = amt > 0n ? `${fromUnits(amt > fee ? amt - fee : 0n, 6, 6)} ${tk} on ${to.name}` : '—';
  $('br-gas').innerHTML = `${esc(from.nativeCurrency.symbol)} on ${esc(from.name)}<br>${esc(to.nativeCurrency.symbol)} on ${esc(to.name)}`;

  const st = buttonState();
  const btn = $('br-btn');
  btn.disabled = st.disabled; btn.style.opacity = st.disabled ? '.55' : ''; btn.style.cursor = st.disabled ? 'not-allowed' : '';
  $('br-btn-content').innerHTML = br.busy ? `<div class="spinner"></div> ${esc(st.label)}` : esc(st.label);
  if (from.slowSource && !br.msg) setMsg(`${from.name} takes ${from.attestationTime} to confirm transfers sent from it. Receiving on ${from.name} is quick.`, 'info');
  renderAll();
  refreshWalletChain().then(() => { const s2 = buttonState(); if (s2.label !== st.label) $('br-btn-content').textContent = s2.label; });
  refreshRouteData();
}

function updateBridgeUI() { update(); }

window.AL_pages = window.AL_pages || {};
window.AL_pages.bridge = () => {
  update();
  // pick up unfinished transfers for the connected wallet
  if (WalletState.connected()) loadBridgeHistory(me()).filter((r) => r.stage === 'attestation' && r.burnTx).forEach((r) => startPolling(r.id));
};
document.addEventListener('DOMContentLoaded', () => { build(); update(); });

publish({ updateBridgeUI });
