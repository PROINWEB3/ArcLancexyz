// Freelancer stats and pay links
import { publish } from './publish.js';
import { buildPayLink } from './lib-paylink.js';
import { isRegistryConfigured, resolveNameOnChain, formatShortAddr } from './16-rates-username.js';

/* ══════════════════════════════════════
   HOME FREELANCER STATS UPDATE
══════════════════════════════════════ */
function updateHomeFreelancerStats() {
  const stats = WalletState.getInvStats();
  const txs = WalletState.getTxHistory();
  const usdc = WalletState.getTokenBal('USDC', 'ARC');
  const totalUSD = WalletState.getTotalUSD();

  // Total earned = paid invoices + USDC balance
  const earned = stats.paid + totalUSD;
  const el = id => document.getElementById(id);
  if(el('home-total-earned')) el('home-total-earned').textContent = (typeof eurcApprox === 'function' && eurcApprox() ? '≈ ' : '') + '$' + earned.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  if (typeof renderApproxNotes === 'function') renderApproxNotes();
  updateLocalCurrencies(totalUSD);

  // Pending invoices
  if(el('home-pending-inv')) el('home-pending-inv').textContent = stats.pendingCount;
  if(el('home-pending-amt')) el('home-pending-amt').textContent = '$' + stats.pending.toFixed(2) + ' awaiting';

  // Fees saved vs PayPal (4.4% fee)
  const feesSaved = earned * 0.044;
  if(el('home-fees-saved')) el('home-fees-saved').textContent = '$' + feesSaved.toFixed(2);
}

/* ══════════════════════════════════════
   PAY LINK PAGE FUNCTIONS
══════════════════════════════════════ */
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
let plResolveSeq = 0;
let plWalletBlocked = false;
let plResolvedAddress = '';
let plResolvedName = '';

function ensurePlWalletEditable() {
  const input = document.getElementById('pl-wallet');
  if (!input) return null;
  if (input.hasAttribute('readonly')) input.removeAttribute('readonly');
  if (input.readOnly) input.readOnly = false;
  return input;
}

function ensurePlResolveEl() {
  let el = document.getElementById('pl-wallet-resolve');
  if (el) return el;
  const input = document.getElementById('pl-wallet');
  if (!input || !input.parentElement) return null;
  el = document.createElement('div');
  el.id = 'pl-wallet-resolve';
  el.setAttribute('role', 'status');
  el.style.cssText = 'display:none;font-size:12px;margin-top:6px;line-height:1.5';
  input.insertAdjacentElement('afterend', el);
  return el;
}

function setPlCopyButtonsDisabled(disabled) {
  document.querySelectorAll('#page-paylink button[onclick*="copyMainPayLink"], #pl-copy-btn').forEach((btn) => {
    btn.disabled = Boolean(disabled);
  });
}

async function resolvePlUsername(raw) {
  const clean = String(raw || '').trim().replace(/^@/, '').toLowerCase();
  if (!clean) return { ok: false, name: '', address: null, shortAddress: '' };
  if (isRegistryConfigured()) {
    return resolveNameOnChain(clean);
  }
  const addr = typeof resolveUsername === 'function' ? resolveUsername(clean) : null;
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr) || addr.toLowerCase() === ZERO_ADDR) {
    return { ok: false, name: clean, address: null, shortAddress: '', reason: 'Name not registered' };
  }
  return { ok: true, name: clean, address: addr, shortAddress: formatShortAddr(addr), reason: '' };
}

function onPlWalletInput(val) {
  const input = ensurePlWalletEditable();
  if (input) {
    input.dataset.userEdited = '1';
    if (val !== undefined && input.value !== val) input.value = val;
  }
  updateMainPayLink();
}
window.onPlWalletInput = onPlWalletInput;

function useMyWalletForPayLink() {
  const input = ensurePlWalletEditable();
  const addr = (typeof WalletState !== 'undefined' && WalletState.getAddr()) || '';
  if (!addr) {
    showToast('Connect your wallet first');
    if (typeof WalletManager !== 'undefined' && WalletManager.openModal) WalletManager.openModal();
    return;
  }
  if (input) {
    input.value = addr;
    input.dataset.prefilled = '1';
    delete input.dataset.userEdited;
  }
  updateMainPayLink();
}
window.useMyWalletForPayLink = useMyWalletForPayLink;

function updateMainPayLink() {
  ensurePlWalletEditable();
  const rawWallet = document.getElementById('pl-wallet')?.value?.trim() || '';
  const wallet = rawWallet || 'your-wallet-address';
  const amt = document.getElementById('pl-amount')?.value?.trim() || 'amount';
  const service = document.getElementById('pl-service')?.value?.trim() || 'Freelance Services';
  const serviceSlug = service.replace(/\s+/g,'-');
  const el = id => document.getElementById(id);
  const resolveEl = ensurePlResolveEl();

  if (el('pl-service-preview')) el('pl-service-preview').textContent = service;

  const numAmt = parseFloat(amt) || 0;
  if (el('pl-amount-preview')) el('pl-amount-preview').textContent = (numAmt || '—') + ' USDC';
  if (el('pl-usd-preview')) el('pl-usd-preview').textContent = numAmt ? `≈ $${numAmt.toFixed(2)} USD` : '≈ $— USD';

  if (numAmt > 0 && typeof LocalRates !== 'undefined') {
    if (el('pl-pkr')) el('pl-pkr').textContent = formatLocal(numAmt, LocalRates.PKR);
    if (el('pl-inr')) el('pl-inr').textContent = formatLocal(numAmt, LocalRates.INR);
    if (el('pl-bdt')) el('pl-bdt').textContent = formatLocal(numAmt, LocalRates.BDT);
  } else {
    if (el('pl-pkr')) el('pl-pkr').textContent = '—';
    if (el('pl-inr')) el('pl-inr').textContent = '—';
    if (el('pl-bdt')) el('pl-bdt').textContent = '—';
  }

  // If VITE_USERNAME_REGISTRY_ADDRESS is empty, keep the old behavior
  if (!isRegistryConfigured()) {
    plWalletBlocked = false;
    plResolvedAddress = '';
    plResolvedName = '';
    setPlCopyButtonsDisabled(false);
    if (resolveEl) { resolveEl.style.display = 'none'; resolveEl.textContent = ''; }
    if (el('pl-wallet-preview')) { el('pl-wallet-preview').style.color = 'var(--green)'; el('pl-wallet-preview').textContent = wallet; }
    if (el('main-pay-link-display')) el('main-pay-link-display').innerHTML = `https://arclance.xyz/pay/<span style="color:var(--green)">${wallet}</span>/<span style="color:var(--yellow)">${amt}</span>/<span style="color:#a78bfa">${serviceSlug}</span>`;
    return;
  }

  // Case 1: Empty or default placeholder
  if (!rawWallet || rawWallet === 'your-wallet-address') {
    plWalletBlocked = false;
    plResolvedAddress = '';
    plResolvedName = '';
    setPlCopyButtonsDisabled(false);
    if (resolveEl) { resolveEl.style.display = 'none'; resolveEl.textContent = ''; }
    if (el('pl-wallet-preview')) { el('pl-wallet-preview').style.color = 'var(--green)'; el('pl-wallet-preview').textContent = 'your-wallet-address'; }
    if (el('main-pay-link-display')) el('main-pay-link-display').innerHTML = `https://arclance.xyz/pay/<span style="color:var(--green)">your-wallet-address</span>/<span style="color:var(--yellow)">${amt}</span>/<span style="color:#a78bfa">${serviceSlug}</span>`;
    return;
  }

  // Case 2: Direct 0x EVM address
  if (/^0x[0-9a-fA-F]{40}$/.test(rawWallet)) {
    plWalletBlocked = false;
    plResolvedAddress = rawWallet;
    plResolvedName = '';
    setPlCopyButtonsDisabled(false);
    if (resolveEl) { resolveEl.style.display = 'none'; resolveEl.textContent = ''; }
    if (el('pl-wallet-preview')) { el('pl-wallet-preview').style.color = 'var(--green)'; el('pl-wallet-preview').textContent = rawWallet; }
    if (el('main-pay-link-display')) el('main-pay-link-display').innerHTML = `https://arclance.xyz/pay/<span style="color:var(--green)">${rawWallet}</span>/<span style="color:var(--yellow)">${amt}</span>/<span style="color:#a78bfa">${serviceSlug}</span>`;
    return;
  }

  // Case 3: @username — resolve via registry resolve() call, show short address next to name, block on zero address
  const clean = rawWallet.replace(/^@/, '').trim().toLowerCase();
  const seq = ++plResolveSeq;
  plWalletBlocked = true;
  setPlCopyButtonsDisabled(true);
  if (resolveEl) {
    resolveEl.style.display = 'block';
    resolveEl.style.color = 'var(--text2)';
    resolveEl.textContent = `Resolving @${clean} on Arc Testnet…`;
  }

  resolvePlUsername(clean).then((res) => {
    if (seq !== plResolveSeq) return;
    if (res.ok && res.address) {
      plWalletBlocked = false;
      plResolvedAddress = res.address;
      plResolvedName = res.name;
      setPlCopyButtonsDisabled(false);
      if (resolveEl) {
        resolveEl.style.display = 'block';
        resolveEl.style.color = 'var(--green)';
        resolveEl.textContent = `✓ @${res.name} (${res.shortAddress})`;
      }
      if (el('pl-wallet-preview')) {
        el('pl-wallet-preview').style.color = 'var(--green)';
        el('pl-wallet-preview').textContent = `${res.name} (${res.shortAddress})`;
      }
      if (el('main-pay-link-display')) {
        el('main-pay-link-display').innerHTML = `https://arclance.xyz/pay/<span style="color:var(--green)">${res.name}</span>/<span style="color:var(--yellow)">${amt}</span>/<span style="color:#a78bfa">${serviceSlug}</span> <span style="font-size:12px;color:var(--text2)">(${res.shortAddress})</span>`;
      }
    } else {
      plWalletBlocked = true;
      plResolvedAddress = '';
      plResolvedName = '';
      setPlCopyButtonsDisabled(true);
      if (resolveEl) {
        resolveEl.style.display = 'block';
        resolveEl.style.color = 'var(--red)';
        resolveEl.textContent = 'Name not registered';
      }
      if (el('pl-wallet-preview')) {
        el('pl-wallet-preview').style.color = 'var(--red)';
        el('pl-wallet-preview').textContent = 'Name not registered';
      }
      if (el('main-pay-link-display')) {
        el('main-pay-link-display').innerHTML = `<span style="color:var(--red)">Name not registered</span>`;
      }
    }
  });
}
window.updatePayLinkMain = updateMainPayLink;

document.addEventListener('DOMContentLoaded', () => {
  const input = ensurePlWalletEditable();
  if (input && !input.dataset.plListenerAttached) {
    input.dataset.plListenerAttached = '1';
    input.addEventListener('input', () => onPlWalletInput(input.value));
  }
});

async function handlePayLinkPreviewPay() {
  if (!WalletState.connected()) {
    WalletManager.openModal();
    return;
  }
  
  const rawRecipient = document.getElementById('pl-wallet')?.value?.trim() || '';
  const amtStr = document.getElementById('pl-amount')?.value?.trim();
  const service = document.getElementById('pl-service')?.value?.trim() || 'Freelance Services';
  const amount = parseFloat(amtStr) || 0;
  
  if (!rawRecipient || rawRecipient === 'your-wallet-address') {
    showToast("No recipient wallet address available");
    return;
  }

  let recipient = rawRecipient;
  if (!/^0x[0-9a-fA-F]{40}$/.test(rawRecipient)) {
    const res = await resolvePlUsername(rawRecipient);
    if (!res.ok || !res.address) {
      showToast('Name not registered');
      return;
    }
    recipient = res.address;
  }

  if (amount <= 0) {
    showToast("Please enter a valid payment amount first");
    return;
  }
  
  const fee = 0.12;
  if (amount + fee > WalletState.getTokenBal('USDC', 'ARC')) {
    showToast(`Insufficient USDC (need ${(amount + fee).toFixed(2)} USDC)`);
    return;
  }
  
  const btn = document.getElementById('plPreviewPayBtn');
  
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Signing...'; }
    const shortRecipient = recipient.slice(0,6) + '...' + recipient.slice(-4);
    showToast(`Sign payment of ${amount} USDC to ${shortRecipient}...`);
    const provider = WalletManager.getProvider();
    if (!provider) throw new Error("No wallet connected");
    
    const txHash = await TxManager._sendNativeTx(provider, recipient, amount);
    
    if (btn) { btn.innerHTML = '<div class="spinner"></div> Confirming...'; }
    showToast(`Payment submitted! Tx: ${txHash.slice(0,10)}…`);
    await new Promise(r => setTimeout(r, 2000));
    
     // Deduct and add history row
    WalletState.addTx({
      type: 'send',
      label: `Paid ${shortRecipient} for ${service}`,
      display: `-${amount} USDC`,
      hash: txHash,
      to: recipient,
      status: 'confirmed'
    });
    
    showToast(`Paid ${amount} USDC successfully to ${shortRecipient}!`);
    UISync.refresh();
    WalletState.triggerChainSync();
  } catch (err) {
    showToast('Payment failed: ' + (err.message || err));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Connect Wallet &amp; Pay'; }
  }
}

async function copyMainPayLink() {
  const rawWallet = document.getElementById('pl-wallet')?.value?.trim() || '';
  const amt = document.getElementById('pl-amount')?.value?.trim() || '0';
  const service = (document.getElementById('pl-service')?.value?.trim() || 'Freelance Services').replace(/\s+/g,'-');

  let target = rawWallet || 'your-wallet-address';
  if (isRegistryConfigured() && rawWallet && rawWallet !== 'your-wallet-address' && !/^0x[0-9a-fA-F]{40}$/.test(rawWallet)) {
    const res = await resolvePlUsername(rawWallet);
    if (!res.ok || !res.address) {
      plWalletBlocked = true;
      setPlCopyButtonsDisabled(true);
      const resolveEl = ensurePlResolveEl();
      if (resolveEl) {
        resolveEl.style.display = 'block';
        resolveEl.style.color = 'var(--red)';
        resolveEl.textContent = 'Name not registered';
      }
      showToast('Name not registered');
      return;
    }
    plWalletBlocked = false;
    setPlCopyButtonsDisabled(false);
    target = res.name;
  } else if (isRegistryConfigured() && plWalletBlocked) {
    showToast('Name not registered');
    return;
  }

  navigator.clipboard.writeText(buildPayLink(target, amt, service)).then(()=>showToast('Payment link copied!')).catch(()=>showToast('Copy failed'));
}

async function sharePayLinkWhatsApp() {
  const rawWallet = document.getElementById('pl-wallet')?.value?.trim() || '';
  const amt = document.getElementById('pl-amount')?.value?.trim() || '0';
  const service = document.getElementById('pl-service')?.value?.trim() || 'Freelance Services';

  let target = rawWallet || 'your-wallet-address';
  if (isRegistryConfigured() && rawWallet && rawWallet !== 'your-wallet-address' && !/^0x[0-9a-fA-F]{40}$/.test(rawWallet)) {
    const res = await resolvePlUsername(rawWallet);
    if (!res.ok || !res.address) {
      plWalletBlocked = true;
      setPlCopyButtonsDisabled(true);
      showToast('Name not registered');
      return;
    }
    plWalletBlocked = false;
    setPlCopyButtonsDisabled(false);
    target = res.name;
  } else if (isRegistryConfigured() && plWalletBlocked) {
    showToast('Name not registered');
    return;
  }

  const link = buildPayLink(target, amt, service);
  const msg = encodeURIComponent(`Hi! Here's my payment link for ${service}:\n\n${link}\n\nAmount: ${amt} USDC (≈ $${amt} USD)\n\nPay with any crypto wallet. Powered by ArcLance.`);
  window.open('https://wa.me/?text=' + msg, '_blank');
}

function renderCountries() {
  const countries=[['PK','Pakistan'],['IN','India'],['BD','Bangladesh'],['NG','Nigeria'],['ID','Indonesia'],['PH','Philippines'],['KE','Kenya'],['EG','Egypt'],['ZA','South Africa'],['BR','Brazil'],['MX','Mexico'],['TR','Turkey'],['VN','Vietnam'],['TH','Thailand'],['MA','Morocco'],['LK','Sri Lanka'],['NP','Nepal'],['AE','UAE'],['AR','Argentina'],['CO','Colombia']];
  const grid=document.getElementById('countries-grid');
  if(!grid)return;
  grid.innerHTML=countries.map(([code,name])=>`<div class="country-card"><span class="country-code">${code}</span><div class="country-info"><h4>${name}</h4><div class="country-status"><span class="c-dot"></span>Active</div></div></div>`).join('');
}


publish({ updateHomeFreelancerStats, onPlWalletInput, useMyWalletForPayLink, updateMainPayLink, handlePayLinkPreviewPay, copyMainPayLink, sharePayLinkWhatsApp, renderCountries });
