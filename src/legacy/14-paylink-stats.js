// Freelancer stats and pay links
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { buildPayLink } from './lib-paylink.js';
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
function updateMainPayLink() {
  const wallet = document.getElementById('pl-wallet')?.value?.trim() || 'your-wallet-address';
  const amt = document.getElementById('pl-amount')?.value?.trim() || 'amount';
  const service = document.getElementById('pl-service')?.value?.trim() || 'Freelance Services';
  const serviceSlug = service.replace(/\s+/g,'-');
  const el = id => document.getElementById(id);
  
  if(el('pl-wallet-preview')) el('pl-wallet-preview').textContent = wallet;
  if(el('main-pay-link-display')) el('main-pay-link-display').innerHTML = `https://arclance.xyz/pay/<span style="color:var(--green)">${wallet}</span>/<span style="color:var(--yellow)">${amt}</span>/<span style="color:#a78bfa">${serviceSlug}</span>`;
  if(el('pl-service-preview')) el('pl-service-preview').textContent = service;
  
  const numAmt = parseFloat(amt) || 0;
  if(el('pl-amount-preview')) el('pl-amount-preview').textContent = (numAmt || '—') + ' USDC';
  if(el('pl-usd-preview')) el('pl-usd-preview').textContent = numAmt ? `≈ $${numAmt.toFixed(2)} USD` : '≈ $— USD';
  
  if(numAmt > 0 && typeof LocalRates !== 'undefined') {
    if(el('pl-pkr')) el('pl-pkr').textContent = formatLocal(numAmt, LocalRates.PKR);
    if(el('pl-inr')) el('pl-inr').textContent = formatLocal(numAmt, LocalRates.INR);
    if(el('pl-bdt')) el('pl-bdt').textContent = formatLocal(numAmt, LocalRates.BDT);
  } else {
    if(el('pl-pkr')) el('pl-pkr').textContent = '—';
    if(el('pl-inr')) el('pl-inr').textContent = '—';
    if(el('pl-bdt')) el('pl-bdt').textContent = '—';
  }
}

async function handlePayLinkPreviewPay() {
  if (!WalletState.connected()) {
    WalletManager.openModal();
    return;
  }
  
  const recipient = document.getElementById('pl-wallet')?.value?.trim();
  const amtStr = document.getElementById('pl-amount')?.value?.trim();
  const service = document.getElementById('pl-service')?.value?.trim() || 'Freelance Services';
  const amount = parseFloat(amtStr) || 0;
  
  if (!recipient || recipient === 'your-wallet-address') {
    showToast("No recipient wallet address available");
    return;
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

function copyMainPayLink() {
  const wallet = document.getElementById('pl-wallet')?.value?.trim() || 'your-wallet-address';
  const amt = document.getElementById('pl-amount')?.value?.trim() || '0';
  const service = (document.getElementById('pl-service')?.value?.trim() || 'Freelance Services').replace(/\s+/g,'-');
  navigator.clipboard.writeText(buildPayLink(wallet, amt, service)).then(()=>showToast('Payment link copied!')).catch(()=>showToast('Copy failed'));
}

function sharePayLinkWhatsApp() {
  const wallet = document.getElementById('pl-wallet')?.value?.trim() || 'your-wallet-address';
  const amt = document.getElementById('pl-amount')?.value?.trim() || '0';
  const service = document.getElementById('pl-service')?.value?.trim() || 'Freelance Services';
  const serviceSlug = service.replace(/\s+/g,'-');
  const link = buildPayLink(wallet, amt, service);
  const msg = encodeURIComponent(`Hi! Here's my payment link for ${service}:\n\n${link}\n\nAmount: ${amt} USDC (≈ $${amt} USD)\n\nPay with any crypto wallet. Powered by ArcLance.`);
  window.open('https://wa.me/?text=' + msg, '_blank');
}

function renderCountries() {
  const countries=[['PK','Pakistan'],['IN','India'],['BD','Bangladesh'],['NG','Nigeria'],['ID','Indonesia'],['PH','Philippines'],['KE','Kenya'],['EG','Egypt'],['ZA','South Africa'],['BR','Brazil'],['MX','Mexico'],['TR','Turkey'],['VN','Vietnam'],['TH','Thailand'],['MA','Morocco'],['LK','Sri Lanka'],['NP','Nepal'],['AE','UAE'],['AR','Argentina'],['CO','Colombia']];
  const grid=document.getElementById('countries-grid');
  if(!grid)return;
  grid.innerHTML=countries.map(([code,name])=>`<div class="country-card"><span class="country-code">${code}</span><div class="country-info"><h4>${name}</h4><div class="country-status"><span class="c-dot"></span>Active</div></div></div>`).join('');
}


publish({ updateHomeFreelancerStats, updateMainPayLink, handlePayLinkPreviewPay, copyMainPayLink, sharePayLinkWhatsApp, renderCountries });
