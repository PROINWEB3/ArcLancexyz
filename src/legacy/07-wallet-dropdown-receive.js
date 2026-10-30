// Wallet dropdown and Receive
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { ARC } from '../config/chain-config';
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
   QR CODE (canvas-based, no library)
══════════════════════════════════════ */
function generateQR() {
  const input = document.getElementById('receive-addr-input');
  const addr = (input?.value?.trim()) || WalletState.getAddr();
  
  const qrImg = document.getElementById('qr-image');
  const statusMsg = document.getElementById('qr-status-msg');
  const display = document.getElementById('receive-addr-display');
  const copyBtn = document.getElementById('qr-copy-btn');
  
  if (!addr) {
    if (qrImg) qrImg.style.display = 'none';
    if (statusMsg) {
      statusMsg.textContent = 'Connect wallet or enter address to generate QR';
      statusMsg.style.display = 'block';
    }
    if (display) display.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
    return;
  }
  
  if (qrImg) {
    qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(addr) + "&margin=10&bgcolor=ffffff&color=000000";
    qrImg.style.display = 'block';
  }
  
  const canvas = document.getElementById('qr-canvas');
  if (canvas) canvas.style.display = 'none';
  
  if (statusMsg) statusMsg.style.display = 'none';
  
  if (display) {
    display.textContent = addr;
    display.style.display = 'block';
  }
  
  if (copyBtn) copyBtn.style.display = 'block';
}

function copyAddress() {
  const addr = document.getElementById('receive-addr-input')?.value || WalletState.getAddr();
  if (!addr) return;
  navigator.clipboard.writeText(addr).then(()=>showToast('Address copied!')).catch(()=>showToast('Copy failed'));
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


publish({ generateQR, copyAddress, updateReceiveToken, copyEurcContract });
