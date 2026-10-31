// Faucet page: shows the real USDC balance with a refresh button, and refreshes after the user returns from the faucet.
import { publish } from './publish.js';
import { $, fmtAmount } from './lib-ui.js';

let pollTimer = null;

function paint(state) {
  const el = $('faucet-balance');
  if (!el) return;
  if (!WalletState.connected()) { el.textContent = 'Connect wallet'; return; }
  if (state === 'loading') { el.textContent = 'Loading…'; return; }
  if (state === 'error' || WalletState.getStatus().status === 'error') { el.textContent = 'Could not load. Press Refresh.'; return; }
  el.textContent = `${fmtAmount(WalletState.getUSDC(), 6)} USDC`;
}

async function refreshFaucetBalance() {
  const btn = $('faucet-refresh');
  if (!WalletState.connected()) { WalletManager.openModal(); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
  paint('loading');
  try { await WalletState.loadFromChain(WalletState.getAddr()); paint('ok'); } catch { paint('error'); }
  if (btn) { btn.disabled = false; btn.textContent = 'Refresh balance'; }
}

// After pressing the claim link, check a few times in case the user comes back with funds.
function startPolling() {
  clearInterval(pollTimer);
  let n = 0;
  pollTimer = setInterval(() => {
    n += 1;
    if (n > 8 || !$('faucet-balance') || !WalletState.connected()) { clearInterval(pollTimer); return; }
    WalletState.loadFromChain(WalletState.getAddr()).then(() => paint('ok')).catch(() => {});
  }, 15000);
}

document.addEventListener('DOMContentLoaded', () => {
  const claim = $('faucet-claim');
  if (claim) claim.addEventListener('click', startPolling);
  document.addEventListener('visibilitychange', () => {
    const page = document.getElementById('page-faucet');
    if (!document.hidden && page && page.classList.contains('active') && WalletState.connected()) refreshFaucetBalance();
  });
});

window.AL_pages = window.AL_pages || {};
window.AL_pages.faucet = () => { paint('ok'); if (WalletState.connected()) refreshFaucetBalance(); };

window.AL_faucetPaint = () => paint('ok');

publish({ refreshFaucetBalance });
