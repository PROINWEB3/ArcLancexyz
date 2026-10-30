// Site chrome and shared UX: testnet banner, wrong-network notice, footer, rate labels, send confirmation and tx toasts.
import { isAddress } from 'viem';
import { publish } from './publish.js';
import { ARC, ESCROW_ADDRESS, arcAltTxUrl } from '../config/chain-config';
import { SITE } from '../config/site';
import { switchWalletChain, waitForReceipt, getBlockTimestampMs, shortAddress, errorMessage } from '../lib/evm';
import { esc } from './lib-ui.js';

const $ = (id) => document.getElementById(id);
const ZERO = '0x0000000000000000000000000000000000000000';
const BANNER_KEY = 'arclance_testnet_banner_dismissed';

// ── Testnet banner: dismissible for the session ──
function initBanner() {
  const banner = $('testnetBanner'); const close = $('testnetBannerClose');
  if (!banner) return;
  if (sessionStorage.getItem(BANNER_KEY) === '1') banner.style.display = 'none';
  if (close) close.addEventListener('click', () => { banner.style.display = 'none'; sessionStorage.setItem(BANNER_KEY, '1'); });
}

// ── Wrong network: inline notice with a one-click switch (switch first, add the network if the wallet lacks it) ──
function updateNetworkNotice() {
  const box = $('wrongNetNotice'); if (!box) return;
  const wrong = typeof WalletState !== 'undefined' && WalletState.connected() && WalletState.isWrongNetwork();
  box.style.display = wrong ? 'flex' : 'none';
}
async function switchToArcNow() {
  const btn = $('wrongNetBtn');
  const provider = WalletManager.getProvider();
  if (!provider) { WalletManager.openModal(); return; }
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Switching…'; }
    await switchWalletChain(provider, { chainIdHex: ARC.chainIdHex, name: ARC.name, rpcUrl: ARC.rpcUrl, explorerUrl: ARC.explorerUrl, nativeCurrency: ARC.nativeCurrency });
    await WalletState.loadFromChain(WalletState.getAddr());
  } catch (e) { showToast(errorMessage(e)); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Switch to Arc Testnet'; } updateNetworkNotice(); }
}

// ── Footer ──
function initFooter() {
  const main = document.querySelector('.main');
  if (!main || $('siteFooter')) return;
  const f = document.createElement('footer');
  f.id = 'siteFooter';
  f.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap;padding:8px 20px;border-top:1px solid var(--border);background:var(--bg2);font-size:11px;color:var(--text2);flex-shrink:0';
  const a = (href, label, ext = true) => `<a href="${href}" ${ext ? 'target="_blank" rel="noopener"' : ''} style="color:var(--text2);text-decoration:none;padding:6px 2px">${label}</a>`;
  f.innerHTML = `<div><strong style="color:var(--text)">${SITE.name}</strong> · Testnet build</div>
    <nav style="display:flex;gap:14px;flex-wrap:wrap" aria-label="Footer">
      <a href="#" onclick="navigate('docs');return false" style="color:var(--text2);text-decoration:none;padding:6px 2px">Docs</a>
      ${a(SITE.arcscan, 'Arcscan')}${a(SITE.github, 'GitHub')}${a(SITE.x, `X (${esc(SITE.xHandle)})`)}
    </nav>`;
  main.appendChild(f);
}

// ── Rate labels under local-currency previews ──
const pad = (n) => String(n).padStart(2, '0');
function rateText() {
  const st = typeof RateStatus !== 'undefined' ? RateStatus : null;
  if (!st) return '';
  const time = st.updatedAt ? `${pad(st.updatedAt.getHours())}:${pad(st.updatedAt.getMinutes())}` : '';
  if (st.updatedAt) return st.failed ? `Rate from ${time} (could not refresh)` : `Rate updated ${time}`;
  if (st.failed) return 'Rate unavailable right now';
  return 'Loading rate…';
}
function renderRateNotes() {
  const anchors = ['local-currency-row', 'inv-local-preview', 'pl-local-preview', 'pay-local-preview'].map($);
  const modal = $('pl-modal-pkr'); if (modal && modal.parentElement && modal.parentElement.parentElement) anchors.push(modal.parentElement.parentElement);
  anchors.filter(Boolean).forEach((el) => {
    let note = el.nextElementSibling;
    if (!note || !note.classList.contains('rate-note')) {
      note = document.createElement('div'); note.className = 'rate-note';
      note.style.cssText = 'font-size:10px;color:var(--text3);margin-top:6px';
      el.insertAdjacentElement('afterend', note);
    }
    note.textContent = rateText();
  });
}

// ── Real contract link in the invoice escrow notice ──
function fillEscrowLink() {
  const a = $('inv-escrow-link'); if (!a) return;
  if (!ESCROW_ADDRESS) { a.textContent = 'not deployed'; a.removeAttribute('href'); return; }
  a.href = `${SITE.arcscan}/address/${ESCROW_ADDRESS}`;
  a.textContent = shortAddress(ESCROW_ADDRESS);
  a.title = ESCROW_ADDRESS;
}

// ── Send: validate the recipient, then show a summary before the wallet is asked to sign ──
function validateRecipient(address) {
  const a = String(address || '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return { ok: false, reason: 'Enter a valid recipient address (0x followed by 40 characters).' };
  if (a.toLowerCase() === ZERO) return { ok: false, reason: 'That is the zero address. Funds sent there are lost.' };
  const hasMixedCase = a.slice(2) !== a.slice(2).toLowerCase() && a.slice(2) !== a.slice(2).toUpperCase();
  if (hasMixedCase && !isAddress(a, { strict: true })) return { ok: false, reason: 'This address has a checksum error. Check every character or copy it again.' };
  if (!isAddress(a, { strict: false })) return { ok: false, reason: 'Enter a valid recipient address.' };
  return { ok: true, reason: '' };
}

function confirmSendSummary({ token, amount, recipient }) {
  return new Promise((resolve) => {
    const old = $('sendConfirmModal'); if (old) old.remove();
    const o = document.createElement('div');
    o.id = 'sendConfirmModal'; o.className = 'wallet-overlay visible'; o.style.zIndex = '10010';
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Confirm payment');
    const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid var(--border)"><span style="color:var(--text2)">${k}</span><strong style="text-align:right;word-break:break-all">${v}</strong></div>`;
    o.innerHTML = `<div class="wallet-modal" style="max-width:440px">
      <div class="wm-header"><div class="wm-title">Confirm payment</div></div>
      <div style="font-size:13px;margin-bottom:14px">${row('Token', esc(token))}${row('Amount', `${esc(String(amount))} ${esc(token)}`)}
        ${row('Recipient', `<span class="mono" style="font-family:'JetBrains Mono',monospace;font-size:12px">${esc(recipient)}</span>`)}
        ${row('Network', esc(ARC.name))}${row('Network fee', 'Paid in USDC. Your wallet shows the exact amount.')}</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:14px;line-height:1.6">Transactions cannot be reversed. Check the recipient before you confirm.</div>
      <div style="display:flex;gap:10px"><button type="button" class="tx-btn tx-btn-yellow" id="sendConfirmOk" style="flex:1">Confirm and sign</button><button type="button" class="btn btn-ghost" id="sendConfirmCancel" style="padding:12px 20px">Cancel</button></div></div>`;
    document.body.appendChild(o);
    const done = (v) => { o.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    o.querySelector('#sendConfirmOk').onclick = () => done(true);
    o.querySelector('#sendConfirmCancel').onclick = () => done(false);
    o.addEventListener('click', (e) => { if (e.target === o) done(false); });
    o.querySelector('#sendConfirmOk').focus();
  });
}

// ── Transaction toasts: pending, then confirmed or failed, each with an Arcscan link ──
// opts.receipt = { amount, token, sender, recipient } adds "View receipt" to the confirmed toast (with the confirmed block time).
// opts.onRetry adds "Retry" to the failed toast. opts.onFail runs when the transaction reverts (to undo what was recorded optimistically).
function readableReason(err) {
  if (!err) return 'Something went wrong.';
  if (typeof err === 'string') return err.length > 140 ? err.slice(0, 137) + '...' : err;
  if (err.code === 4001 || err.code === 'ACTION_REJECTED') return 'You rejected the request in your wallet. Nothing was sent.';
  const msg = String(err.message || '').split('\n')[0];
  if (/insufficient funds|exceeds balance/i.test(msg)) return 'Not enough USDC for the amount plus network fee.';
  return errorMessage(err).slice(0, 140) || 'Something went wrong.';
}
function failToast(label, reason, onRetry, link) {
  const actions = [];
  if (link) actions.push(link);
  if (onRetry) actions.push({ label: 'Retry', onClick: onRetry });
  showToast(`${label}: failed. ${readableReason(reason)}`, actions.length ? actions : undefined);
}
function trackTxToast(hash, label = 'Transaction', opts = {}) {
  const link = { url: arcAltTxUrl(hash), label: 'View on Arcscan' };
  showToast(`${label}: pending`, link);
  waitForReceipt(ARC.rpcUrl, hash).then(async (r) => {
    if (!r) { showToast(`${label}: still pending`, link); return; }
    if (r.status !== 'success') { if (typeof opts.onFail === 'function') opts.onFail(); failToast(label, 'The transaction was reverted on Arc Testnet.', opts.onRetry, link); return; }
    const actions = [link];
    if (opts.receipt && typeof window.showReceipt === 'function') {
      const when = await getBlockTimestampMs(ARC.rpcUrl, r.blockNumber);
      const rc = opts.receipt;
      actions.push({ label: 'View receipt', onClick: () => window.showReceipt(hash, rc.amount, rc.token, rc.recipient, when, rc.sender) });
    }
    showToast(`${label}: confirmed`, actions);
  }).catch(() => showToast(`${label}: status unknown. Check Arcscan.`, link));
}

document.addEventListener('DOMContentLoaded', () => {
  initBanner(); initFooter(); fillEscrowLink(); renderRateNotes();
  const btn = $('wrongNetBtn'); if (btn) btn.addEventListener('click', switchToArcNow);
  setInterval(updateNetworkNotice, 1500);
  setInterval(() => { if (typeof fetchLiveExchangeRates === 'function') fetchLiveExchangeRates(); }, 10 * 60 * 1000);
});

publish({ renderRateNotes, validateRecipient, confirmSendSummary, trackTxToast, failToast, updateNetworkNotice });
