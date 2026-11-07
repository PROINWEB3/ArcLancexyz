// Receipts, recurring payments, contacts and CSV export
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { buildPayLink } from './lib-paylink.js';
import { ARC, arcAltTxUrl } from '../config/chain-config';
import { esc } from './lib-ui.js';
// ==========================================
// 1. PAYMENT RECEIPT FUNCTIONS
// ==========================================
let currentReceiptData = null;

// timestamp: confirmed block time in ms. Any value the caller does not have is shown as "Not available" (never a placeholder).
const NA = 'Not available';
window.showReceipt = function(txHash, amount, token, recipient, timestamp, sender, label) {
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const dateStr = Number(timestamp) > 0 ? new Date(Number(timestamp)).toLocaleString() : NA;
  const amountStr = has(amount) && has(token) ? `${amount} ${token}` : NA;
  const recipientStr = has(recipient) ? String(recipient) : NA;
  const senderStr = has(sender) ? String(sender) : NA;
  const labelStr = has(label) ? String(label) : NA;
  currentReceiptData = { txHash: has(txHash) ? txHash : NA, amount: has(amount) ? amount : NA, token: has(token) ? token : '', recipient: recipientStr, sender: senderStr, date: dateStr, label: labelStr };

  document.getElementById('rec-amount').textContent = amountStr;
  const to = document.getElementById('rec-to');
  to.textContent = recipientStr === NA ? NA : (recipientStr.length > 14 ? recipientStr.slice(0,8) + '...' + recipientStr.slice(-6) : recipientStr);
  to.title = recipientStr;

  const from = document.getElementById('rec-from');
  if (from) {
    from.textContent = senderStr === NA ? NA : (senderStr.length > 14 ? senderStr.slice(0,8) + '...' + senderStr.slice(-6) : senderStr);
    from.title = senderStr;
  }

  const lbl = document.getElementById('rec-label');
  if (lbl) {
    lbl.innerHTML = esc(labelStr);
  }

  const txLink = document.getElementById('rec-tx');
  if (has(txHash)) { txLink.href = arcAltTxUrl(txHash); txLink.textContent = String(txHash).slice(0,10) + '...' + String(txHash).slice(-8); }
  else { txLink.removeAttribute('href'); txLink.textContent = NA; }

  document.getElementById('rec-date').textContent = dateStr;

  document.getElementById('receiptModal').classList.add('visible');
};

window.closeReceiptModal = function() {
  document.getElementById('receiptModal').classList.remove('visible');
};

window.printReceipt = function() {
  window.print();
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
  const label = document.getElementById('rec-pay-label')?.value?.trim() || 'Payment reminder';
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
  showToast(`Reminder saved: ${frequency} ${amount} ${token}. ArcLance will remind you; it does not send payments automatically.`);
  
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
  showToast('Reminder deleted');
  window.renderScheduledPayments();
};

window.renderScheduledPayments = function() {
  const container = document.getElementById('recurring-payments-list');
  if (!container) return;
  
  const payments = window.getScheduledPayments();
  if (!payments.length) {
    container.innerHTML = '<div class="history-empty">No reminders saved yet</div>';
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
            <button class="btn btn-ghost btn-sm" style="padding:4px 8px; font-size:11px; border-color:rgba(239,68,68,0.3); color:var(--red);" onclick="cancelRecurringPayment('${p.id}')">Delete</button>
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
      showToast(`Reminder: "${p.label}" (${p.amount} ${p.token} to ${p.recipient.slice(0,6)}...) is due. Send it yourself: ArcLance does not pay automatically.`);
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
  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg).then(() => showToast('Reminder copied to clipboard!')).catch(() => showToast('Copy failed'));
  }
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
    if (t.type === 'send' && typeof t.display === 'string') {
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


// 6. CSV Export Transaction History
export function formatCsvCell(val) {
  if (val === undefined || val === null || val === '') return '';
  let s = String(val);
  // CSV injection protection: any cell starting with =, +, -, @, \t, \r gets a leading '
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  // Quote cells that contain commas, quotes or newlines
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
window.formatCsvCell = formatCsvCell;

export function exportHistoryCSV() {
  const txs = (typeof WalletState !== 'undefined' && WalletState.getTxHistory) ? WalletState.getTxHistory() : [];
  if (!txs || txs.length === 0) {
    if (typeof showToast === 'function') showToast('No transactions to export!');
    return;
  }

  const headers = ['date', 'direction', 'amount', 'token', 'counterparty', 'label', 'tx hash', 'status'];

  const rows = txs.map((tx) => {
    let amount = '';
    if (tx.amount !== undefined && tx.amount !== null && String(tx.amount).trim() !== '') {
      amount = String(tx.amount);
    } else if (typeof tx.display === 'string') {
      const m = tx.display.match(/^[+-]?([\d.]+)/);
      if (m) amount = m[1];
    }

    let token = '';
    if (tx.token !== undefined && tx.token !== null && String(tx.token).trim() !== '') {
      token = String(tx.token);
    } else if (typeof tx.display === 'string') {
      const m = tx.display.match(/[+-]?[\d.]+\s*([A-Za-z]+)/);
      if (m) token = m[1];
    }

    let counterparty = '';
    const rawTo = tx.to || tx.recipient;
    if (rawTo && typeof rawTo === 'string' && /^0x[0-9a-fA-F]{40}$/.test(rawTo)) {
      counterparty = rawTo;
    }

    let txHash = '';
    if (tx.hash && typeof tx.hash === 'string' && tx.hash.startsWith('0x')) {
      txHash = tx.hash;
    }

    return [
      formatCsvCell(tx.timestamp || ''),
      formatCsvCell(tx.type || ''),
      formatCsvCell(amount),
      formatCsvCell(token),
      formatCsvCell(counterparty),
      formatCsvCell(tx.label || ''),
      formatCsvCell(txHash),
      formatCsvCell(tx.status || '')
    ];
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n') + '\r\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arclance-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('Exported transaction history to CSV!');
}
window.exportHistoryCSV = exportHistoryCSV;

publish({ formatCsvCell, exportHistoryCSV });
