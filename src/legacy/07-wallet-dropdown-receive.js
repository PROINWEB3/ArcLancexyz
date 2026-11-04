// Wallet dropdown, Receive QR, and Buy USDC / Testnet Faucet panel
import QRCode from 'qrcode';
import { isAddress } from 'viem';
import { publish } from './publish.js';
import { ARC } from '../config/chain-config';
import { SITE } from '../config/site';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

/* ══════════════════════════════════════
   WALLET DROPDOWN HANDLERS
══════════════════════════════════════ */
window.toggleWalletDropdown = function(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('walletDropdownMenu');
  const arrow = document.getElementById('walletDropdownArrow');
  if (!menu) return;
  const isHidden = menu.style.display === 'none' || window.getComputedStyle(menu).display === 'none';
  menu.style.display = isHidden ? 'flex' : 'none';
  if (arrow) {
    arrow.style.transform = isHidden ? 'rotate(180deg)' : '';
  }
};

window.addEventListener('click', function(e) {
  const menu = document.getElementById('walletDropdownMenu');
  const arrow = document.getElementById('walletDropdownArrow');
  if (menu && menu.style.display !== 'none') {
    const dropdown = document.getElementById('walletDropdown');
    if (dropdown && !dropdown.contains(e.target)) {
      menu.style.display = 'none';
      if (arrow) arrow.style.transform = '';
    }
  }
});

/* ══════════════════════════════════════
   RECEIVE QR CODE (client-side, bundled qrcode)
══════════════════════════════════════ */
export function validateReceiveAddress(address) {
  const a = String(address || '').trim();
  if (!a) {
    return { ok: false, empty: true, address: '', reason: 'Connect wallet or enter address to generate QR' };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
    return { ok: false, empty: false, address: '', reason: 'Enter a valid wallet address (0x followed by 40 hex characters).' };
  }
  if (a.toLowerCase() === ZERO_ADDR) {
    return { ok: false, empty: false, address: '', reason: 'That is the zero address. Enter a valid wallet address.' };
  }
  const hasMixedCase = a.slice(2) !== a.slice(2).toLowerCase() && a.slice(2) !== a.slice(2).toUpperCase();
  if (hasMixedCase && !isAddress(a, { strict: true })) {
    return { ok: false, empty: false, address: '', reason: 'This address has a checksum error. Check every character or copy it again.' };
  }
  if (!isAddress(a, { strict: false })) {
    return { ok: false, empty: false, address: '', reason: 'Enter a valid wallet address.' };
  }
  return { ok: true, empty: false, address: a, reason: '' };
}

function generateQR() {
  const input = document.getElementById('receive-addr-input');
  const connectedAddr = (typeof WalletState !== 'undefined' && WalletState.getAddr) ? WalletState.getAddr() : null;
  if (input && connectedAddr && !input.value.trim()) {
    input.value = connectedAddr;
  }
  const rawAddr = (input ? input.value.trim() : '') || connectedAddr || '';

  const qrImg = document.getElementById('qr-image');
  const canvas = document.getElementById('qr-canvas');
  const statusMsg = document.getElementById('qr-status-msg');
  const display = document.getElementById('receive-addr-display');
  const copyBtn = document.getElementById('qr-copy-btn');

  if (canvas) canvas.style.display = 'none';

  const check = validateReceiveAddress(rawAddr);
  if (!check.ok) {
    if (qrImg) {
      qrImg.style.display = 'none';
      qrImg.removeAttribute('src');
      qrImg.removeAttribute('data-qr-address');
    }
    if (statusMsg) {
      statusMsg.textContent = check.reason;
      statusMsg.style.color = check.empty ? 'var(--text2)' : 'var(--red)';
      statusMsg.style.display = 'block';
    }
    if (display) {
      display.textContent = '';
      display.style.display = 'none';
    }
    if (copyBtn) copyBtn.style.display = 'none';
    return false;
  }

  const addr = check.address;
  const showFailure = () => {
    if (qrImg) {
      qrImg.style.display = 'none';
      qrImg.removeAttribute('src');
    }
    if (statusMsg) {
      statusMsg.textContent = 'Could not generate QR code. You can still copy the wallet address below.';
      statusMsg.style.color = 'var(--red)';
      statusMsg.style.display = 'block';
    }
    if (display) {
      display.textContent = addr;
      display.style.display = 'block';
    }
    if (copyBtn) copyBtn.style.display = 'flex';
  };

  try {
    const qrFn = (typeof window !== 'undefined' && typeof window.__qrToString === 'function')
      ? window.__qrToString
      : QRCode.toString;
    let rendered = false;
    qrFn(
      addr,
      { type: 'svg', width: 180, margin: 2, color: { dark: '#000000', light: '#ffffff' } },
      (err, svg) => {
        if (err || !svg || typeof svg !== 'string' || !svg.includes('<svg')) {
          showFailure();
          return;
        }
        rendered = true;
        if (qrImg) {
          qrImg.onerror = () => showFailure();
          qrImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
          qrImg.alt = `QR code for ${addr}`;
          qrImg.setAttribute('data-qr-address', addr);
          const chainId = (typeof WalletState !== 'undefined' && WalletState.getStatus && WalletState.getStatus().chainId) || ARC.chainIdHex;
          qrImg.setAttribute('data-qr-chain', String(chainId));
          qrImg.style.display = 'block';
        }
        if (statusMsg) {
          statusMsg.textContent = '';
          statusMsg.style.display = 'none';
        }
        if (display) {
          display.textContent = addr;
          display.style.display = 'block';
        }
        if (copyBtn) copyBtn.style.display = 'flex';
      }
    );
    return rendered;
  } catch (e) {
    showFailure();
    return false;
  }
}

function copyAddress() {
  const inputVal = document.getElementById('receive-addr-input')?.value?.trim();
  const addr = inputVal || ((typeof WalletState !== 'undefined' && WalletState.getAddr) ? WalletState.getAddr() : '');
  const check = validateReceiveAddress(addr);
  if (!check.ok) return;
  navigator.clipboard.writeText(check.address).then(()=>showToast('Address copied!')).catch(()=>showToast('Copy failed'));
}

function updateReceiveToken() {
  const token = document.getElementById('receiveToken')?.value || 'USDC';
  const eurcInfo = document.getElementById('receive-eurc-info');
  const addrLabel = document.getElementById('receive-addr-label');
  const copyEurcBtn = document.getElementById('copyEurcContractBtn');
  const tokenNames = { USDC: 'USDC', EURC: 'EURC', cirBTC: 'cirBTC' };
  if (addrLabel) addrLabel.textContent = `Wallet Address (${tokenNames[token] || token})`;
  if (eurcInfo) eurcInfo.style.display = (token === 'EURC') ? 'block' : 'none';
  if (copyEurcBtn) copyEurcBtn.style.display = (token === 'EURC') ? 'inline-flex' : 'none';
  generateQR();
}

function copyEurcContract() {
  const addr = ARC.tokens.EURC;
  navigator.clipboard.writeText(addr).then(()=>showToast('EURC Contract address copied!')).catch(()=>showToast('Copy failed'));
}

/* ══════════════════════════════════════
   BUY USDC / TESTNET FAUCET PANEL
══════════════════════════════════════ */
export function buildOnrampUrl(baseUrl, walletAddress) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw, typeof window !== 'undefined' && window.location ? window.location.origin : 'https://arclance.xyz');
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    const addr = String(walletAddress || '').trim();
    u.searchParams.set('address', addr);
    return u.toString();
  } catch {
    return '';
  }
}

function openBuyUsdcModal() {
  const configuredUrl = (typeof SITE !== 'undefined' && SITE.onrampUrl) ? String(SITE.onrampUrl).trim() : '';
  const walletAddr = ((typeof WalletState !== 'undefined' && WalletState.getAddr) ? WalletState.getAddr() : '') || '';
  if (configuredUrl) {
    const targetUrl = buildOnrampUrl(configuredUrl, walletAddr);
    if (targetUrl) {
      const w = window.open(targetUrl, '_blank', 'noopener,noreferrer');
      if (w) {
        try { w.opener = null; } catch (_) {}
      }
      return targetUrl;
    }
  }
  const modal = document.getElementById('buyUsdcModal');
  if (modal) modal.classList.add('visible');
  return null;
}

function closeBuyUsdcModal() {
  const modal = document.getElementById('buyUsdcModal');
  if (modal) modal.classList.remove('visible');
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('buyUsdcModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeBuyUsdcModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBuyUsdcModal();
  });
});

publish({
  validateReceiveAddress,
  generateQR,
  copyAddress,
  updateReceiveToken,
  copyEurcContract,
  buildOnrampUrl,
  openBuyUsdcModal,
  closeBuyUsdcModal,
});
