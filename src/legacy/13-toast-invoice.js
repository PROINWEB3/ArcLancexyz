// Toasts, local currencies, pay link preview and invoice PDF
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { uiIcon, stripPictographs } from '../assets/ui-icons';
import { buildPayLink } from './lib-paylink.js';
import { ARC } from '../config/chain-config';
import { formatDue } from '../lib/invoice-due';
/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
const activeToasts = new Map(); // msg -> element

function showToast(msg, link) {
  // If this exact message is already displayed, ignore to prevent spam
  if (activeToasts.has(msg)) {
    return;
  }

  const container = document.getElementById('toast-container');
  if (!container) return;
  
  // Enforce single active notification at a time by clearing container
  container.innerHTML = '';
  activeToasts.clear();

  // `link` can be one { url, label } / { label, onClick } or a list of them
  const links = (Array.isArray(link) ? link : link ? [link] : []).filter(Boolean);
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<div class="toast-icon">${uiIcon(/^(✅|🎉)/u.test(String(msg).trim()) ? 'check' : /^(⚠|❌)/u.test(String(msg).trim()) ? 'alert' : /^⏳/u.test(String(msg).trim()) ? 'clock' : 'zap', 16)}</div><div class="toast-body"><div class="toast-title">${stripPictographs(String(msg))}</div>${links.length ? `<div class="toast-sub">${links.map((l, i) => (l.url ? `<a href="${l.url}" target="_blank" rel="noopener" style="color:var(--yellow)">${l.label || 'View on explorer'} ↗</a>` : `<a href="#" data-toast-action="${i}" style="color:var(--yellow)">${l.label}</a>`)).join(' &nbsp;·&nbsp; ')}</div>` : ''}</div><button class="toast-close" onclick="removeToast('${msg.replace(/'/g, "\\'")}')">✕</button>`;
  
  toast.querySelectorAll('[data-toast-action]').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    const action = links[Number(a.dataset.toastAction)];
    toast.remove(); activeToasts.delete(msg);
    if (action && typeof action.onClick === 'function') action.onClick();
  }));
  container.appendChild(toast);
  activeToasts.set(msg, toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    if (activeToasts.has(msg)) {
      toast.classList.add('exiting');
      setTimeout(() => {
        toast.remove();
        activeToasts.delete(msg);
      }, 400);
    }
  }, links.length ? 9000 : 4000);
}

window.removeToast = function(msg) {
  const toast = activeToasts.get(msg);
  if (toast) {
    toast.remove();
    activeToasts.delete(msg);
  }
};

/* ══════════════════════════════════════
   LOCAL CURRENCY RATES (approx)
══════════════════════════════════════ */
// Filled from a live rate source (see fetchLiveExchangeRates). No built-in numbers: until a rate loads, previews show a dash.
const LocalRates = { PKR: null, INR: null, BDT: null, NGN: null };

function formatLocal(usd, rate) {
  if (!rate) return '—';
  const val = usd * rate;
  if (val >= 100000) return (val/100000).toFixed(1) + 'L'; // Lakh for INR/PKR
  if (val >= 1000) return Math.round(val).toLocaleString();
  return val.toFixed(0);
}

function updateLocalCurrencies(usdAmount) {
  const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  const effectiveUsd = (typeof usdAmount === 'number' && usdAmount > 0) ? usdAmount : 1;
  el('local-pkr',    formatLocal(effectiveUsd, LocalRates.PKR));
  el('local-inr',    formatLocal(effectiveUsd, LocalRates.INR));
  el('local-bdt',    formatLocal(effectiveUsd, LocalRates.BDT));
  el('local-ngn',    formatLocal(effectiveUsd, LocalRates.NGN));
  el('home-total-earned-local', LocalRates.PKR ? '≈ PKR ' + formatLocal(usdAmount > 0 ? usdAmount : 0, LocalRates.PKR) : 'Local rate unavailable');
}

/* ══════════════════════════════════════
   INVOICE LOCAL CURRENCY PREVIEW
══════════════════════════════════════ */
function updateInvLocalCurrency() {
  const amt = parseFloat(document.getElementById('inv-amount')?.value) || 0;
  const preview = document.getElementById('inv-local-preview');
  if (!amt) { if(preview) preview.style.display='none'; return; }
  if(preview) preview.style.display='flex';
  const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  el('inv-pkr', formatLocal(amt, LocalRates.PKR) + ' PKR');
  el('inv-inr', formatLocal(amt, LocalRates.INR) + ' INR');
  el('inv-bdt', formatLocal(amt, LocalRates.BDT) + ' BDT');
  el('inv-ngn', formatLocal(amt, LocalRates.NGN) + ' NGN');
}

/* ══════════════════════════════════════
   PAYMENT LINK
══════════════════════════════════════ */
function updatePayLinkPreview() {
  const typed = (document.getElementById('inv-username')?.value?.trim() || '').replace(/\s+/g,'-').toLowerCase();
  // The link pays the wallet address (it opens on any device). The username is only a display label (?u=).
  const entered = document.getElementById('inv-addr')?.value?.trim() || '';
  const address = /^0x[0-9a-fA-F]{40}$/.test(entered) ? entered : (typeof WalletState !== 'undefined' && WalletState.getAddr()) || '';
  const inv = document.getElementById('inv-number')?.value?.trim() || 'INV-001';
  const amt = document.getElementById('inv-amount')?.value?.trim() || '';
  const link = buildPayLink(address, amt, inv, typed);
  const el = document.getElementById('inv-link-text');
  if(el) el.textContent = link;
}

function copyPayLink() {
  const text = document.getElementById('inv-link-text')?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(()=>showToast('Payment link copied!')).catch(()=>showToast('Copy failed'));
}

function shareViaWhatsApp() {
  const client = document.getElementById('inv-client')?.value?.trim() || 'Client';
  const yourName = document.getElementById('inv-your-name')?.value?.trim() || 'Freelancer';
  const invNumber = document.getElementById('inv-number')?.value?.trim() || 'INV-001';
  const amount = document.getElementById('inv-amount')?.value || '0';
  const desc = document.getElementById('inv-desc')?.value?.trim() || 'Services';
  const due = document.getElementById('inv-due')?.value || '';
  const link = document.getElementById('inv-link-text')?.textContent || '';
  
  let msgText = `Hi ${client},\n\nThis is ${yourName}. Please find the invoice details below:\n\nInvoice #: ${invNumber}\nService: ${desc}\nAmount: ${amount} USDC`;
  if (due) {
    msgText += `\nDue Date: ${formatDue(due)}`;
  }
  msgText += `\n\nPay here: ${link}\n\nThank you!\nPowered by ArcLance — Borderless Payments on Arc Network`;
  
  window.open('https://wa.me/?text=' + encodeURIComponent(msgText), '_blank');
}

/* ══════════════════════════════════════
   PDF INVOICE DOWNLOAD
══════════════════════════════════════ */
function downloadInvoicePDF() {
  const client    = document.getElementById('inv-client')?.value?.trim();
  const yourName  = document.getElementById('inv-your-name')?.value?.trim();
  const number    = document.getElementById('inv-number')?.value?.trim();
  const amount    = parseFloat(document.getElementById('inv-amount')?.value) || 0;
  const desc      = document.getElementById('inv-desc')?.value?.trim();

  if (!client || !yourName || !number || !amount || !desc) {
    showToast('Please fill all required fields first');
    return;
  }

  const due         = document.getElementById('inv-due')?.value?.trim() || 'On receipt';
  const notes       = document.getElementById('inv-notes')?.value?.trim() || '';
  const addr        = document.getElementById('inv-addr')?.value?.trim() || WalletState.getAddr() || 'Not specified';
  const clientEmail = document.getElementById('inv-client-email')?.value?.trim() || '';
  const username    = document.getElementById('inv-username')?.value?.trim() || '';
  const today       = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

  // Parse line items from description — one per line if user used newlines
  const lines = desc.split('\n').map(l => l.trim()).filter(Boolean);
  const hasMultipleItems = lines.length > 1;

  // Subtotal, tax (0% default — freelancer can set), total
  const subtotal = amount;
  const taxRate  = 0; // editable in future
  const taxAmt   = +(subtotal * taxRate / 100).toFixed(2);
  const total    = +(subtotal + taxAmt).toFixed(2);

  // Local currency conversions
  const pkrVal = LocalRates.PKR ? formatLocal(total, LocalRates.PKR) : 'Rate unavailable right now';
  const inrVal = LocalRates.INR ? formatLocal(total, LocalRates.INR) : 'Rate unavailable right now';
  const bdtVal = LocalRates.BDT ? formatLocal(total, LocalRates.BDT) : 'Rate unavailable right now';
  const ngnVal = LocalRates.NGN ? formatLocal(total, LocalRates.NGN) : 'Rate unavailable right now';

  // Build line items HTML
  const itemRows = hasMultipleItems
    ? lines.map((line, i) => {
        const unitPrice = (amount / lines.length).toFixed(2);
        return `<tr>
          <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333">${i+1}</td>
          <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333">${line}</td>
          <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:center">1</td>
          <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right">${unitPrice}</td>
          <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#1a1a1a;text-align:right">${unitPrice} USDC</td>
        </tr>`;
      }).join('')
    : `<tr>
        <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333">1</td>
        <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333">${desc}</td>
        <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:center">1</td>
        <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right">${amount.toFixed(2)}</td>
        <td style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600;color:#1a1a1a;text-align:right">${amount.toFixed(2)} USDC</td>
      </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${number} — ArcLance</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',Arial,sans-serif;background:#f7f7f7;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:820px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,0.1)}
  /* TOP ACCENT BAR */
  .top-bar{background:#f5c518;height:6px;width:100%}
  /* HEADER */
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding:40px 48px 32px;border-bottom:1px solid #f0f0f0}
  .logo-block{display:flex;align-items:center;gap:14px}
  .logo-box{width:52px;height:52px;background:#f5c518;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#000;letter-spacing:1px;flex-shrink:0}
  .logo-text{font-size:22px;font-weight:900;letter-spacing:3px;color:#1a1a1a}
  .logo-sub{font-size:11px;color:#999;margin-top:3px;letter-spacing:1px;font-weight:500}
  .inv-meta{text-align:right}
  .inv-badge{display:inline-block;background:#fff9e0;color:#b8860b;border:1.5px solid #f5c518;border-radius:8px;padding:5px 14px;font-size:13px;font-weight:700;letter-spacing:2px;margin-bottom:10px}
  .inv-number{font-size:13px;color:#888;font-family:'Courier New',monospace;margin-bottom:4px}
  .inv-date{font-size:13px;color:#555}
  .inv-due{display:inline-block;margin-top:8px;background:#fff3cd;color:#856404;border:1px solid #ffc107;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600}
  /* STATUS */
  .status-pending{background:#fff8e1;color:#f59e0b;border:1px solid #fcd34d;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:1px}
  /* FROM / TO */
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:32px 48px;background:#fafafa;border-bottom:1px solid #f0f0f0}
  .party-label{font-size:10px;font-weight:700;letter-spacing:2px;color:#aaa;text-transform:uppercase;margin-bottom:8px}
  .party-name{font-size:17px;font-weight:700;color:#1a1a1a;margin-bottom:3px}
  .party-sub{font-size:13px;color:#888;line-height:1.5}
  /* ITEMS TABLE */
  .items-wrap{padding:32px 48px}
  .items-label{font-size:10px;font-weight:700;letter-spacing:2px;color:#aaa;text-transform:uppercase;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#f8f8f8;border-radius:8px}
  th{padding:11px 16px;font-size:11px;font-weight:700;letter-spacing:1px;color:#999;text-transform:uppercase;text-align:left}
  th:last-child,th:nth-child(3),th:nth-child(4){text-align:right}
  /* TOTALS */
  .totals-wrap{padding:0 48px 32px;display:flex;justify-content:flex-end}
  .totals-box{width:340px;background:#fafafa;border-radius:12px;border:1px solid #f0f0f0;overflow:hidden}
  .totals-row{display:flex;justify-content:space-between;align-items:center;padding:11px 20px;font-size:14px;border-bottom:1px solid #f0f0f0}
  .totals-row:last-child{border-bottom:none}
  .totals-k{color:#888}
  .totals-v{font-weight:600;color:#1a1a1a}
  .totals-total{background:#f5c518;padding:16px 20px;display:flex;justify-content:space-between;align-items:center}
  .totals-total .totals-k{color:rgba(0,0,0,0.6);font-weight:700;font-size:13px}
  .totals-total .totals-v{color:#000;font-size:22px;font-weight:900}
  /* LOCAL CURRENCIES */
  .local-row{padding:16px 48px;background:#fffbea;border-top:1px solid #f5e68c;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
  .local-label{font-size:11px;color:#999;font-weight:600;margin-right:4px}
  .local-pill{background:#fff;border:1px solid #f5c518;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;color:#b8860b}
  /* PAYMENT SECTION */
  .payment-section{margin:0 48px 32px;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:12px;padding:20px 24px}
  .payment-title{font-size:11px;font-weight:700;letter-spacing:2px;color:#0369a1;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:8px}
  .wallet-addr{font-family:'Courier New',monospace;font-size:12px;color:#0c4a6e;background:#e0f2fe;border-radius:8px;padding:10px 14px;word-break:break-all;line-height:1.6;margin-bottom:10px}
  .payment-meta{display:flex;gap:8px;flex-wrap:wrap}
  .pay-chip{background:#fff;border:1px solid #bae6fd;border-radius:20px;padding:4px 11px;font-size:11px;font-weight:600;color:#0369a1}
  /* NOTES */
  .notes-section{margin:0 48px 32px;background:#f8f8f8;border-radius:10px;padding:16px 20px}
  .notes-label{font-size:10px;font-weight:700;letter-spacing:2px;color:#aaa;text-transform:uppercase;margin-bottom:8px}
  .notes-text{font-size:13px;color:#555;line-height:1.7}
  /* FOOTER */
  .footer{padding:20px 48px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#fafafa}
  .footer-left{font-size:12px;color:#aaa}
  .footer-right{display:flex;gap:8px;flex-wrap:wrap}
  .foot-badge{background:#fff;border:1px solid #e5e5e5;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:#888}
  /* BOTTOM ACCENT */
  .bottom-bar{background:linear-gradient(90deg,#f5c518,#d4a017);height:4px}
  @media print{
    body{background:#fff}
    .page{box-shadow:none;border-radius:0;margin:0}
    .print-btn{display:none!important}
  }
</style>
</head>
<body>
<div style="text-align:center;padding:20px;font-family:Inter,Arial,sans-serif">
  <button class="print-btn" onclick="window.print()" style="background:#f5c518;color:#000;border:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:20px;letter-spacing:1px">PRINT / SAVE AS PDF</button>
</div>
<div class="page">
  <div class="top-bar"></div>

  <!-- HEADER -->
  <div class="header">
    <div class="logo-block">
      <div class="logo-box">A</div>
      <div>
        <div class="logo-text">ARCLANCE</div>
        <div class="logo-sub">BORDERLESS USDC PAYMENTS</div>
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-badge">INVOICE</div>
      <div class="inv-number">${number}</div>
      <div class="inv-date">Issue Date: ${today}</div>
      <div class="inv-due">Due: ${formatDue(due)}</div>
      <div style="margin-top:10px"><span class="status-pending">PAYMENT PENDING</span></div>
    </div>
  </div>

  <!-- FROM / TO -->
  <div class="parties">
    <div>
      <div class="party-label">From (Freelancer)</div>
      <div class="party-name">${yourName}</div>
      <div class="party-sub">ArcLance Freelancer${username ? '<br>@'+username : ''}</div>
    </div>
    <div>
      <div class="party-label">Bill To (Client)</div>
      <div class="party-name">${client}</div>
      <div class="party-sub">${clientEmail || 'Client'}</div>
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <div class="items-wrap">
    <div class="items-label">Services Rendered</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th>Description</th>
          <th style="width:60px;text-align:center">Qty</th>
          <th style="width:100px;text-align:right">Unit Price</th>
          <th style="width:120px;text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
  </div>

  <!-- TOTALS -->
  <div class="totals-wrap">
    <div class="totals-box">
      <div class="totals-row"><span class="totals-k">Subtotal</span><span class="totals-v">${subtotal.toFixed(2)} USDC</span></div>
      <div class="totals-row"><span class="totals-k">Tax (not applied)</span><span class="totals-v">${taxAmt.toFixed(2)} USDC</span></div>
      <div class="totals-row"><span class="totals-k">ArcLance platform fee</span><span class="totals-v" style="color:#16a34a">None on testnet</span></div>
      <div class="totals-total">
        <span class="totals-k">TOTAL DUE</span>
        <span class="totals-v">${total.toFixed(2)} USDC</span>
      </div>
    </div>
  </div>

  <!-- LOCAL CURRENCY ROW -->
  <div class="local-row">
    <span class="local-label">≈ Equivalent:</span>
    <span class="local-pill">🇵🇰 PKR ${pkrVal}</span>
    <span class="local-pill">🇮🇳 INR ${inrVal}</span>
    <span class="local-pill">🇧🇩 BDT ${bdtVal}</span>
    <span class="local-pill">🇳🇬 NGN ${ngnVal}</span>
  </div>

  <!-- PAYMENT INSTRUCTIONS -->
  <div class="payment-section">
    <div class="payment-title">Payment Instructions — USDC on Arc Network</div>
    <div class="wallet-addr">${addr}</div>
    <div class="payment-meta">
      <span class="pay-chip">USDC Token</span>
      <span class="pay-chip">${ARC.name} · Chain ID ${ARC.chainId}</span>
      <span class="pay-chip">Settles when confirmed on Arc Testnet</span>
      <span class="pay-chip">Network fee applies</span>
      <span class="pay-chip">No platform fee on testnet</span>
    </div>
  </div>

  ${notes ? `
  <!-- NOTES -->
  <div class="notes-section">
    <div class="notes-label">Notes</div>
    <div class="notes-text">${notes}</div>
  </div>` : ''}

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-left">
      Generated by ArcLance &nbsp;·&nbsp; arclance.xyz<br>
      <span style="font-family:'Courier New',monospace">${number}</span> &nbsp;·&nbsp; ${today}
    </div>
    <div class="footer-right">
      <span class="foot-badge">USDC</span>
      <span class="foot-badge">Self-Custodial</span>
      <span class="foot-badge">Arc Network</span>
      <span class="foot-badge">150+ Countries</span>
    </div>
  </div>

  <div class="bottom-bar"></div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${number}-ArcLance-Invoice.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Invoice ${number} downloaded! Open and press Ctrl+P → Save as PDF`);
}


publish({ activeToasts, showToast, LocalRates, formatLocal, updateLocalCurrencies, updateInvLocalCurrency, updatePayLinkPreview, copyPayLink, shareViaWhatsApp, downloadInvoicePDF });
