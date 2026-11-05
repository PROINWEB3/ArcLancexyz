// Pay link payer view and recipient helpers
import { publish } from './publish.js';
import { parsePayPath } from './lib-paylink.js';
import { ARC } from '../config/chain-config';
import { isRegistryConfigured, resolveNameOnChain, formatShortAddr } from './16-rates-username.js';

let sendResolveSeq = 0;

function ensureSendResolveHint() {
  let hint = document.getElementById('username-resolve-hint');
  if (hint) return hint;
  const input = document.getElementById('payRecipient');
  const row = input && input.parentElement;
  if (!row || !row.parentElement) return null;
  hint = document.createElement('div');
  hint.id = 'username-resolve-hint';
  hint.setAttribute('role', 'status');
  hint.style.cssText = 'display:none;font-size:12px;margin-top:6px;line-height:1.5';
  row.insertAdjacentElement('afterend', hint);
  return hint;
}

export async function onPayRecipientInput(val) {
  const input = document.getElementById('payRecipient');
  const raw = String(val !== undefined ? val : (input ? input.value : '')).trim();
  const hint = ensureSendResolveHint();
  const sendBtn = document.getElementById('sendPayBtn');
  const modeRadio = document.querySelector('input[name="payRecipientType"]:checked');
  const isUsernameMode = modeRadio ? modeRadio.value === 'username' : false;

  if (!isRegistryConfigured()) {
    if (hint) { hint.style.display = 'none'; hint.textContent = ''; }
    if (sendBtn && !sendBtn.classList.contains('loading')) sendBtn.disabled = false;
    return;
  }

  const looksLikeUsername = isUsernameMode || raw.startsWith('@') || (raw.length > 0 && !raw.startsWith('0x'));
  if (!looksLikeUsername || !raw) {
    if (hint) { hint.style.display = 'none'; hint.textContent = ''; }
    if (sendBtn && !sendBtn.classList.contains('loading')) sendBtn.disabled = false;
    return;
  }

  const clean = raw.replace(/^@/, '').trim().toLowerCase();
  const seq = ++sendResolveSeq;
  if (hint) {
    hint.style.display = 'block';
    hint.style.color = 'var(--text2)';
    hint.textContent = `Resolving @${clean} on Arc Testnet…`;
  }

  const res = await resolveNameOnChain(clean);
  if (seq !== sendResolveSeq) return;

  if (res.ok && res.address) {
    if (hint) {
      hint.style.display = 'block';
      hint.style.color = 'var(--green)';
      hint.textContent = `✓ @${res.name} (${res.shortAddress})`;
    }
    if (sendBtn && !sendBtn.classList.contains('loading')) sendBtn.disabled = false;
  } else {
    if (hint) {
      hint.style.display = 'block';
      hint.style.color = 'var(--red)';
      hint.textContent = 'Name not registered';
    }
    if (sendBtn) sendBtn.disabled = true;
  }
}
window.onPayRecipientInput = onPayRecipientInput;

// 5. Toggle Recipient inputs on Send
function toggleRecipientType(type) {
  const label = document.getElementById('recipientLabel');
  const input = document.getElementById('payRecipient');
  if (!label || !input) return;
  if (type === 'username') {
    label.textContent = 'Recipient Username';
    input.placeholder = 'e.g. ali-hassan (without @)';
    input.classList.remove('mono');
  } else {
    label.textContent = 'Recipient Address';
    input.placeholder = '0x742d35Cc6634C0532925a3b8...';
    input.classList.add('mono');
  }
  onPayRecipientInput(input.value);
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('payRecipient');
  if (input && !input.dataset.usernameListenerAttached) {
    input.dataset.usernameListenerAttached = '1';
    input.addEventListener('input', () => onPayRecipientInput(input.value));
  }
});

// 6. Live Currency Preview on Send page typing
function updateSendLocalCurrency() {
  const amt = parseFloat(document.getElementById('payAmount')?.value) || 0;
  const preview = document.getElementById('pay-local-preview');
  if (!amt || amt <= 0) {
    if (preview) preview.style.display = 'none';
    return;
  }
  if (preview) preview.style.display = 'flex';
  
  const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  el('pay-pkr', formatLocal(amt, ExchangeRates.PKR));
  el('pay-inr', formatLocal(amt, ExchangeRates.INR));
  el('pay-bdt', formatLocal(amt, ExchangeRates.BDT));
  el('pay-ngn', formatLocal(amt, ExchangeRates.NGN));
}

// 7. Routing for Pay Link and invoice links: /pay/<name-or-address>/<amount>/<service>
async function handleHashPaymentRouting() {
  const link = parsePayPath(window.location.pathname, window.location.hash, window.location.search);
  if (!link) return;

  if (isRegistryConfigured()) {
    const isDirectAddress = /^0x[0-9a-fA-F]{40}$/.test(link.target);
    if (!isDirectAddress) {
      // Resolve username ONLY via the on-chain registry resolve() call on Arc Testnet RPC
      const res = await resolveNameOnChain(link.target);
      if (!res.ok || !res.address) {
        setTimeout(() => {
          openPayLinkPayerView('', link.amount || 0, link.label || 'Payment', res.name || link.target, {
            blocked: true,
            reason: 'Name not registered',
          });
          showToast('Name not registered');
        }, 100);
        return;
      }
      if (!(link.amount > 0)) {
        setTimeout(() => showToast('This link has no amount. Ask the sender for a link with an amount.'), 100);
        return;
      }
      setTimeout(() => {
        openPayLinkPayerView(res.address, link.amount, link.label, res.name, {
          onChain: true,
          shortAddress: res.shortAddress,
        });
      }, 100);
      return;
    }

    // Direct 0x address link when registry is configured: never resolve or trust ?u= without on-chain resolve()
    if (link.name) {
      const res = await resolveNameOnChain(link.name);
      if (!res.ok || !res.address || res.address.toLowerCase() !== link.target.toLowerCase()) {
        setTimeout(() => {
          openPayLinkPayerView('', link.amount || 0, link.label || 'Payment', link.name, {
            blocked: true,
            reason: 'Name not registered',
          });
          showToast('Name not registered');
        }, 100);
        return;
      }
      if (!(link.amount > 0)) {
        setTimeout(() => showToast('This link has no amount. Ask the sender for a link with an amount.'), 100);
        return;
      }
      setTimeout(() => {
        openPayLinkPayerView(res.address, link.amount, link.label, res.name, {
          onChain: true,
          shortAddress: res.shortAddress,
        });
      }, 100);
      return;
    }

    if (!(link.amount > 0)) {
      setTimeout(() => showToast('This link has no amount. Ask the sender for a link with an amount.'), 100);
      return;
    }
    setTimeout(() => openPayLinkPayerView(link.target, link.amount, link.label, ''), 100);
    return;
  }

  // Fallback demo behavior when VITE_USERNAME_REGISTRY_ADDRESS is empty
  let walletAddress = link.target;
  let displayName = link.name; // from ?u=: shown only, never used to find the recipient
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    displayName = link.target; // an older username link: it resolved on this device
    walletAddress = typeof resolveUsername === 'function' ? resolveUsername(link.target) : null;
    if (!walletAddress) { setTimeout(() => showToast('This username is not known on this device. Ask the sender for a link with a wallet address.'), 500); return; }
  }
  if (!(link.amount > 0)) { setTimeout(() => showToast('This link has no amount. Ask the sender for a link with an amount.'), 500); return; }
  setTimeout(() => openPayLinkPayerView(walletAddress, link.amount, link.label, displayName), 500);
}

// 8. Open Payer Modal View
let currentPayLinkWalletAddress = '';
let currentPayLinkAmount = 0;
let currentPayLinkService = '';
let currentPayLinkBlocked = false;

function openPayLinkPayerView(walletAddress, amount, service, displayName, meta = {}) {
  currentPayLinkBlocked = Boolean(meta && meta.blocked);
  currentPayLinkWalletAddress = currentPayLinkBlocked ? '' : walletAddress;
  currentPayLinkAmount = amount || 0;
  currentPayLinkService = service || 'Freelance Services';
  
  const modal = document.getElementById('paylink-modal');
  if (!modal) return;
  
  const shortAddr = walletAddress && walletAddress.length > 10 ? formatShortAddr(walletAddress) : walletAddress;
  const userEl = document.getElementById('pl-modal-user');
  if (userEl) {
    if (currentPayLinkBlocked) {
      userEl.textContent = displayName ? `@${String(displayName).replace(/^@/, '')} — Name not registered` : 'Name not registered';
      userEl.style.color = 'var(--red)';
    } else if (meta && meta.onChain && displayName) {
      const cleanName = String(displayName).replace(/^@/, '');
      userEl.textContent = `@${cleanName} (${shortAddr})`;
      userEl.style.color = 'var(--text)';
    } else {
      userEl.textContent = shortAddr;
      userEl.style.color = 'var(--text)';
    }
  }
  document.getElementById('pl-modal-amount').textContent = Number(amount || 0).toFixed(2) + ' USDC';
  document.getElementById('pl-modal-service').textContent = 'for ' + (service || 'Freelance Services');
  
  // Before anything is signed: the full recipient address and the network, in plain sight.
  const addrEl = document.getElementById('pl-modal-addr');
  if (addrEl) {
    addrEl.textContent = currentPayLinkBlocked ? 'Name not registered' : walletAddress;
    addrEl.style.cssText += ';color:' + (currentPayLinkBlocked ? 'var(--red)' : 'var(--text)') + ';font-family:"JetBrains Mono",monospace;font-size:12px;word-break:break-all;line-height:1.5';
    let info = document.getElementById('pl-modal-network');
    if (!info) { info = document.createElement('div'); info.id = 'pl-modal-network'; info.style.cssText = 'font-size:11px;color:var(--text2);margin-top:6px;line-height:1.6;text-align:center'; addrEl.insertAdjacentElement('afterend', info); }
    const safe = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    if (currentPayLinkBlocked) {
      info.innerHTML = `<span style="color:var(--red);font-weight:700">Name not registered</span> on ${safe(ARC.name)} (chain ID ${ARC.chainId}). Sending is blocked.`;
    } else if (meta && meta.onChain && displayName) {
      const cleanName = String(displayName).replace(/^@/, '');
      info.innerHTML = `Resolved on-chain: <strong style="color:var(--text)">@${safe(cleanName)} (${safe(shortAddr)})</strong>.<br>Recipient wallet (full address) above. Network: <strong style="color:var(--text)">${safe(ARC.name)}</strong> (chain ID ${ARC.chainId}). Check the address before you pay.`;
    } else {
      info.innerHTML = `Recipient wallet (full address) above. Network: <strong style="color:var(--text)">${safe(ARC.name)}</strong> (chain ID ${ARC.chainId}). Check the address before you pay.` +
        (displayName ? `<br>Name in the link: <strong style="color:var(--text)">${safe(displayName)}</strong> (a label only, not verified: the address above is what you pay).` : '');
    }
  }
  
  // Calculate exchange rates
  document.getElementById('pl-modal-pkr').textContent = (ExchangeRates.PKR ? (amount * ExchangeRates.PKR).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '—');
  document.getElementById('pl-modal-inr').textContent = (ExchangeRates.INR ? (amount * ExchangeRates.INR).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '—');
  document.getElementById('pl-modal-bdt').textContent = (ExchangeRates.BDT ? (amount * ExchangeRates.BDT).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '—');
  document.getElementById('pl-modal-ngn').textContent = (ExchangeRates.NGN ? (amount * ExchangeRates.NGN).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '—');
  
  updatePayLinkModalActions();
  modal.classList.add('visible');
}

function closePayLinkPayerView() {
  const modal = document.getElementById('paylink-modal');
  if (modal) modal.classList.remove('visible');
  window.location.hash = '';
}

function updatePayLinkModalActions() {
  const container = document.getElementById('pl-modal-actions');
  if (!container) return;

  if (currentPayLinkBlocked) {
    container.innerHTML = `<button class="tx-btn tx-btn-yellow" id="plModalPayBtn" disabled style="opacity:0.5;cursor:not-allowed">
      <span id="plModalPayBtnContent">NAME NOT REGISTERED</span>
    </button>`;
    return;
  }
  
  if (!WalletState.connected()) {
    container.innerHTML = `<button class="tx-btn tx-btn-yellow" onclick="WalletManager.openModal(); setTimeout(updatePayLinkModalActions, 1000);">CONNECT WALLET TO PAY</button>`;
  } else {
    container.innerHTML = `<button class="tx-btn tx-btn-yellow" id="plModalPayBtn" onclick="executePayLinkPayment()">
      <span id="plModalPayBtnContent">SEND PAYMENT ON ARC</span>
    </button>`;
  }
}

async function executePayLinkPayment() {
  if (currentPayLinkBlocked) { showToast('Name not registered'); return; }
  if (!WalletState.connected()) { showToast('Connect wallet first'); return; }
  
  const recipient = currentPayLinkWalletAddress;
  if (!recipient || recipient === 'your-wallet-address' || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    showToast(isRegistryConfigured() ? 'Name not registered' : 'Recipient address is invalid');
    return;
  }
  
  const token = document.getElementById('pl-modal-token')?.value || 'USDC';
  const amount = currentPayLinkAmount;
  if (amount <= 0) { showToast('Invalid amount'); return; }
  
  const tokenBal = WalletState.getTokenBal(token, 'ARC');
  const fee = token === 'USDC' ? 0.12 : 0;
  if (token === 'USDC' && amount + fee > WalletState.getTokenBal('USDC', 'ARC')) { showToast(`Insufficient USDC (need ${(amount+fee).toFixed(2)} USDC)`); return; }
  if (token !== 'USDC' && amount > tokenBal) { showToast(`Insufficient ${token} balance`); return; }
  
  const base = 'SEND PAYMENT ON ARC';
  const btn = document.getElementById('plModalPayBtn');
  const cnt = document.getElementById('plModalPayBtnContent');
  
  try {
    if (btn && cnt) { btn.disabled = true; cnt.innerHTML = '<div class="spinner"></div> Signing...'; }
    const shortRecipient = recipient.slice(0,6) + '...' + recipient.slice(-4);
    showToast(`Sign payment transaction to ${shortRecipient}...`);
    const provider = WalletManager.getProvider();
    if (!provider) return;
    
    let txHash;
    if (token === 'USDC') {
      txHash = await TxManager._sendNativeTx(provider, recipient, amount);
    } else {
      const contract = TOKEN_CONTRACTS[token];
      if (!contract) throw new Error(`Unsupported token: ${token}`);
      txHash = await TxManager._sendTokenTx(provider, contract, recipient, amount);
    }
    
    if (btn && cnt) { cnt.innerHTML = '<div class="spinner"></div> Submitting...'; }
    let recorded = false, reverted = false;
    const markFailed = () => { const row = WalletState.getTxHistory().find((t) => t.hash === txHash); if (row) row.status = 'failed'; WalletState.save(); UISync.refreshHistory(); };
    trackTxToast(txHash, `Payment to ${shortRecipient}`, { receipt: { amount, token, sender: WalletState.getAddr(), recipient }, onRetry: () => openPayLinkPayerView(recipient, amount, currentPayLinkService), onFail: () => { reverted = true; if (recorded) markFailed(); } });
    await new Promise(r => setTimeout(r, 700));
    
    if (btn && cnt) { cnt.innerHTML = '<div class="spinner"></div> Confirming...'; }
    await new Promise(r => setTimeout(r, 2000));
    
    if (btn && cnt) { cnt.innerHTML = '✓ SUCCESS'; }
    
    // Deduct and add history row
    WalletState.addTx({
      type: 'send',
      label: `Paid ${shortRecipient} for ${currentPayLinkService}`,
      display: `-${amount} ${token}`,
      hash: txHash,
      to: recipient,
      status: 'confirmed'
    });
    
    recorded = true; if (reverted) markFailed();
    WalletState.triggerChainSync();
    setTimeout(closePayLinkPayerView, 2000);
  } catch (err) {
    failToast('Payment', err, () => openPayLinkPayerView(recipient, amount, currentPayLinkService));
    if (btn && cnt) { btn.disabled = false; cnt.textContent = base; }
  }
}


publish({ toggleRecipientType, onPayRecipientInput, updateSendLocalCurrency, handleHashPaymentRouting, openPayLinkPayerView, closePayLinkPayerView, updatePayLinkModalActions, executePayLinkPayment });
