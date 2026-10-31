// Core constants, simulated balances and App Kit button helpers
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { ARC } from '../config/chain-config';
// ── Arc Testnet Official Contract Addresses ──

// ── Global TOKEN_CONTRACTS (Arc Testnet official addresses from docs.arc.io) ──
const TOKEN_CONTRACTS = { ...ARC.tokens };

// ── Sepolia simulated balances for bridge direction 2 (Sepolia → Arc) ──
const SepoliaBalances = {
  // Real balances only. Filled from Ethereum Sepolia by WalletState.loadPeerBalances(); zero until read.
  _data: { USDC: 0, EURC: 0 },
  get(token) { return this._data[token] || 0; },
  set(token, val) { this._data[token] = val; },
  adjust(token, delta) { this._data[token] = Math.max(0, (this._data[token] || 0) + delta); }
};

// ── Search stub (Ctrl+K) ──
function openSearch() { showToast('Search coming soon!'); }
function closeSearch() { /* no-op */ }

/* ══════════════════════════════════════
   ETHEREUM SEPOLIA SIMULATED BALANCES
   (separate from Arc Testnet balances)
══════════════════════════════════════ */


// Global App Kit Ready/Loading flags & helpers
window.appKitLoading = false;
window.appKitReady = true;

const APP_KIT_BUTTONS = ['sendPayBtn', 'swapBtn', 'bridgeBtn'];

window.disableAppKitButtons = function() {
  APP_KIT_BUTTONS.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.style.pointerEvents = 'none';
      const cnt = document.getElementById(id + 'Content');
      if (cnt) {
        if (id === 'sendPayBtn') cnt.innerHTML = '<div class="spinner"></div> Loading App Kit...';
        else if (id === 'swapBtn') cnt.innerHTML = '<div class="spinner"></div> Loading App Kit...';
        else if (id === 'bridgeBtn') cnt.innerHTML = '<div class="spinner"></div> Loading App Kit...';
      }
      btn.classList.add('loading');
    }
  });
};

window.enableAppKitButtons = function() {
  window.appKitLoading = false;
  window.appKitReady = true;
  APP_KIT_BUTTONS.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
      btn.style.pointerEvents = '';
      const cnt = document.getElementById(id + 'Content');
      if (cnt) {
        if (id === 'sendPayBtn') cnt.innerHTML = 'SEND TOKEN ON ARC';
        else if (id === 'swapBtn') cnt.innerHTML = '⇄ SWAP TOKENS';
        else if (id === 'bridgeBtn') cnt.innerHTML = 'BRIDGE ASSETS';
      }
      btn.classList.remove('loading');
    }
  });
  console.log("[ArcLance] App Kit buttons fully enabled!");
};
window.enableAppKitButtons();



publish({ TOKEN_CONTRACTS, SepoliaBalances, openSearch, closeSearch, APP_KIT_BUTTONS });
