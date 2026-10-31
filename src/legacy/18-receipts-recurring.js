// Receipts, recurring payments, contacts and CSV export
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { buildPayLink } from './lib-paylink.js';
import { ARC, arcAltTxUrl } from '../config/chain-config';
// ==========================================
// 1. PAYMENT RECEIPT FUNCTIONS
// ==========================================
let currentReceiptData = null;

// timestamp: confirmed block time in ms. Any value the caller does not have is shown as "Not available" (never a placeholder).
// sender is kept with the receipt data; the receipt layout has no sender row.
const NA = 'Not available';
window.showReceipt = function(txHash, amount, token, recipient, timestamp, sender) {
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const dateStr = Number(timestamp) > 0 ? new Date(Number(timestamp)).toLocaleString() : NA;
  const amountStr = has(amount) && has(token) ? `${amount} ${token}` : NA;
  const recipientStr = has(recipient) ? String(recipient) : NA;
  currentReceiptData = { txHash: has(txHash) ? txHash : NA, amount: has(amount) ? amount : NA, token: has(token) ? token : '', recipient: recipientStr, sender: has(sender) ? sender : NA, date: dateStr };

  document.getElementById('rec-amount').textContent = amountStr;
  const to = document.getElementById('rec-to');
  to.textContent = recipientStr === NA ? NA : recipientStr.slice(0,8) + '...' + recipientStr.slice(-6);
  to.title = recipientStr;

  const txLink = document.getElementById('rec-tx');
  if (has(txHash)) { txLink.href = arcAltTxUrl(txHash); txLink.textContent = String(txHash).slice(0,10) + '...' + String(txHash).slice(-8); }
  else { txLink.removeAttribute('href'); txLink.textContent = NA; }

  document.getElementById('rec-date').textContent = dateStr;

  document.getElementById('receiptModal').classList.add('visible');
};

window.closeReceiptModal = function() {
  document.getElementById('receiptModal').classList.remove('visible');
};

window.downloadHTMLReceipt = function() {
  if (!currentReceiptData) return;
  const d = currentReceiptData;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ArcLance Payment Receipt</title>
  <style>
    body { font-family: sans-serif; background: #08071a; color: #e8e6ff; padding: 40px; text-align: center; }
    .receipt { max-width: 500px; margin: 0 auto; background: #0d0c22; border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { color: #f5c518; font-size: 24px; margin-bottom: 5px; }
    .status { color: #00e676; font-weight: bold; margin-bottom: 25px; letter-spacing: 1px; }
    .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .label { color: #7a78a0; }
    .val { font-weight: bold; }
    .mono { font-family: monospace; font-size: 13px; }
    .footer { margin-top: 30px; font-size: 12px; color: #7a78a0; }
  </style>
</head>
<body>
  <div class="receipt">
    <h1>ArcLance Receipt</h1>
    <div class="status">SUCCESSFUL</div>
    <div class="row">
      <span class="label">Amount Paid</span>
      <span class="val" style="color:#f5c518; font-size:18px;">${d.amount} ${d.token}</span>
    </div>
    <div class="row">
      <span class="label">Recipient Address</span>
      <span class="val mono">${d.recipient}</span>
    </div>
    <div class="row">
      <span class="label">Transaction Hash</span>
      <span class="val mono">${d.txHash}</span>
    </div>
    <div class="row">
      <span class="label">Date & Time</span>
      <span class="val">${d.date}</span>
    </div>
    <div class="row">
      <span class="label">Network</span>
      <span class="val">${ARC.name} (Chain ID ${ARC.chainId})</span>
    </div>
    <div class="footer">
      Thank you for using ArcLance Freelancer Payments.
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arclance-receipt-${String(d.txHash).slice(0,8)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ==========================================
// 2. RECURRING PAYMENTS FUNCTIONS
// ==========================================
window.getScheduledPayments = function() {
  try {
    return JSON.parse(localStorage.getItem('arclance_scheduled_payments') || '[]');
  } catch (e) {
    return [];
  }
};

window.saveScheduledPayments = function(payments) {
  localStorage.setItem('arclance_scheduled_payments', JSON.stringify(payments));
};

window.scheduleRecurringPayment = function() {
  const recipient = document.getElementById('rec-pay-recipient')?.value?.trim();
  const label = document.getElementById('rec-pay-label')?.value?.trim() || 'Recurring Payment';
  const amtStr = document.getElementById('rec-pay-amount')?.value?.trim();
  const amount = parseFloat(amtStr) || 0;
  const token = document.getElementById('rec-pay-token')?.value || 'USDC';
  const frequency = document.getElementById('rec-pay-frequency')?.value || 'weekly';
  
  if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
    showToast('Enter a valid recipient wallet address');
    return;
  }
  if (amount <= 0) {
    showToast('Enter a valid amount');
    return;
  }
  
  const payments = window.getScheduledPayments();
  const now = Date.now();
  const intervalMs = frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  
  const newPayment = {
    id: 'rec_' + Math.random().toString(36).substr(2, 9),
    recipient,
    label,
    amount,
    token,
    frequency,
    created: now,
    lastPaid: now,
    nextDue: now + intervalMs,
    active: true
  };
  
  payments.push(newPayment);
  window.saveScheduledPayments(payments);
  showToast(`Scheduled ${frequency} payment of ${amount} ${token} successfully!`);
  
  // Clear fields
  if (document.getElementById('rec-pay-recipient')) document.getElementById('rec-pay-recipient').value = '';
  if (document.getElementById('rec-pay-label')) document.getElementById('rec-pay-label').value = '';
  if (document.getElementById('rec-pay-amount')) document.getElementById('rec-pay-amount').value = '';
  
  window.renderScheduledPayments();
};

window.cancelRecurringPayment = function(id) {
  let payments = window.getScheduledPayments();
  payments = payments.filter(p => p.id !== id);
  window.saveScheduledPayments(payments);
  showToast('Recurring payment cancelled');
  window.renderScheduledPayments();
};

window.renderScheduledPayments = function() {
  const container = document.getElementById('recurring-payments-list');
  if (!container) return;
  
  const payments = window.getScheduledPayments();
  if (!payments.length) {
    container.innerHTML = '<div class="history-empty">No recurring payments scheduled yet</div>';
    return;
  }
  
  container.innerHTML = payments.map(p => {
    const nextDate = new Date(p.nextDue).toLocaleDateString();
    return `
      <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px; display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:var(--yellow); font-size:13px;">${p.label}</strong>
          <span class="badge badge-purple" style="font-size:10px; text-transform:uppercase;">${p.frequency}</span>
        </div>
        <div style="font-size:12px; color:var(--text2);">
          To: <span style="font-family:'JetBrains Mono',monospace;">${p.recipient.slice(0,6)}...${p.recipient.slice(-4)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <span style="font-weight:700; font-size:14px; color:var(--text);">${p.amount} ${p.token}</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <span style="font-size:11px; color:var(--text2)">Next: ${nextDate}</span>
            <button class="btn btn-ghost btn-sm" style="padding:4px 8px; font-size:11px; border-color:rgba(239,68,68,0.3); color:var(--red);" onclick="cancelRecurringPayment('${p.id}')">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

window.checkDueRecurringPayments = function() {
  const payments = window.getScheduledPayments();
  const now = Date.now();
  let updated = false;
  
  payments.forEach(p => {
    if (p.nextDue && now >= p.nextDue) {
      showToast(`Reminder: Recurring payment "${p.label}" of ${p.amount} ${p.token} to ${p.recipient.slice(0,6)}... is due!`);
      const intervalMs = p.frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
      p.lastPaid = now;
      p.nextDue = now + intervalMs;
      updated = true;
    }
  });
  
  if (updated) {
    window.saveScheduledPayments(payments);
    window.renderScheduledPayments();
  }
};

// ==========================================
// FREELANCER FEATURE HELPER FUNCTIONS
// ==========================================

// 1. Mark Paid / Remind Helpers
window.shareInvoiceReminder = function(client, number, amount, walletAddr) {
  const payLink = buildPayLink(walletAddr || '', amount, number);
  const msg = `Hi ${client}, friendly reminder that invoice ${number} for ${amount} USDC is due. Pay here: ${payLink}`;
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(msg), '_blank');
};

// 2. Auto Invoice Number Helpers
window.populateNextInvoiceNumber = function() {
  const invNumberEl = document.getElementById('inv-number');
  if (invNumberEl) {
    const nextNum = WalletState.getInvoices().length + 1;
    const padded = String(nextNum).padStart(3, '0');
    invNumberEl.value = `INV-${padded}`;
  }
};

// 3. Address Book & Contacts Dropdown Helpers
window.saveCurrentRecipientAddress = function() {
  const addr = document.getElementById('payRecipient')?.value?.trim();
  if (!addr) { showToast('Enter a recipient address/username first'); return; }
  const label = prompt('Enter a label for this address/username (e.g. Graphic Designer, John):');
  if (label === null) return; // cancelled
  const finalLabel = label.trim() || 'No Label';
  
  let contacts = [];
  try {
    contacts = JSON.parse(localStorage.getItem('arclance_contacts') || '[]');
  } catch(e) { contacts = []; }
  
  const existing = contacts.find(c => c.address === addr);
  if (existing) {
    existing.label = finalLabel;
  } else {
    contacts.push({ address: addr, label: finalLabel });
  }
  
  localStorage.setItem('arclance_contacts', JSON.stringify(contacts));
  showToast(`Saved "${finalLabel}" to Address Book!`);
  window.renderContactsDropdown();
};

window.toggleContactsDropdown = function(event) {
  event.stopPropagation();
  window.renderContactsDropdown();
  const menu = document.getElementById('contactsDropdownMenu');
  if (menu) {
    const isShowing = menu.style.display === 'flex';
    menu.style.display = isShowing ? 'none' : 'flex';
  }
};

window.renderContactsDropdown = function() {
  const menu = document.getElementById('contactsDropdownMenu');
  if (!menu) return;
  
  let contacts = [];
  try {
    contacts = JSON.parse(localStorage.getItem('arclance_contacts') || '[]');
  } catch(e) { contacts = []; }
  
  if (contacts.length === 0) {
    menu.innerHTML = '<div style="font-size:11px;color:var(--text2);text-align:center;padding:8px">No saved contacts yet.</div>';
    return;
  }
  
  menu.innerHTML = contacts.map(c => {
    return `<div onclick="selectContact('${c.address.replace(/'/g, "\\'")}')" onmouseover="this.style.background='rgba(0,230,118,0.08)'" onmouseout="this.style.background=''" style="font-size:11px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background 0.2s;text-align:left;display:flex;flex-direction:column;line-height:1.3;word-break:break-all;" class="contact-item">
      <strong style="color:var(--green)">${c.label}</strong>
      <span style="font-family:monospace;color:var(--text2);font-size:9px">${c.address.slice(0,12)}...${c.address.slice(-10)}</span>
    </div>`;
  }).join('');
};

window.selectContact = function(addr) {
  const input = document.getElementById('payRecipient');
  if (input) {
    input.value = addr;
    const isAddr = addr.startsWith('0x') && addr.length === 42;
    const typeRadio = document.querySelector(`input[name="payRecipientType"][value="${isAddr ? 'address' : 'username'}"]`);
    if (typeRadio) {
      typeRadio.checked = true;
      toggleRecipientType(isAddr ? 'address' : 'username');
    }
  }
  const menu = document.getElementById('contactsDropdownMenu');
  if (menu) menu.style.display = 'none';
  showToast('Auto-filled contact address!');
};

// 4. Monthly Earnings Summary Calculator
window.updateMonthlyStats = function() {
  const txs = WalletState.getTxHistory();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const thisMonthTxs = txs.filter(t => {
    if (!t.timestamp) return false;
    const d = new Date(t.timestamp);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  
  let totalSent = 0;
  thisMonthTxs.forEach(t => {
    if (t.type === 'send') {
      const match = t.display.match(/-?([\d.]+)/);
      if (match) {
        const amt = parseFloat(match[1]) || 0;
        totalSent += amt;
      }
    }
  });
  
  const dayCounts = {};
  thisMonthTxs.forEach(t => {
    if (t.timestamp) {
      const d = new Date(t.timestamp);
      const dayStr = d.toLocaleDateString(undefined, { weekday: 'long' });
      dayCounts[dayStr] = (dayCounts[dayStr] || 0) + 1;
    }
  });
  
  let mostActiveDay = 'No activity yet';
  let maxCount = 0;
  for (const day in dayCounts) {
    if (dayCounts[day] > maxCount) {
      maxCount = dayCounts[day];
      mostActiveDay = day;
    }
  }
  
  const totalSentEl = document.getElementById('month-total-sent');
  if (totalSentEl) totalSentEl.textContent = '$' + totalSent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  
  const txCountEl = document.getElementById('month-tx-count');
  if (txCountEl) txCountEl.textContent = thisMonthTxs.length;
  
  const activeDayEl = document.getElementById('month-active-day');
  if (activeDayEl) activeDayEl.textContent = mostActiveDay + (maxCount > 0 ? ` (${maxCount} txs)` : '');
};

// 5. CSV Export All Invoices
window.exportInvoicesCSV = function() {
  const invs = WalletState.getInvoices();
  if (invs.length === 0) {
    showToast('No invoices to export!');
    return;
  }
  
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Invoice#,Client,Amount,Status,Due Date,Created Date\n";
  
  invs.forEach(inv => {
    const row = [
      `"${inv.number.replace(/"/g, '""')}"`,
      `"${inv.client.replace(/"/g, '""')}"`,
      `"${inv.amount}"`,
      `"${inv.status}"`,
      `"${(inv.due || '').replace(/"/g, '""')}"`,
      `"${new Date(inv.createdAt).toLocaleDateString()}"`
    ];
    csvContent += row.join(",") + "\n";
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "arclance-invoices.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Exported all invoices to CSV!");
};


publish({  });
