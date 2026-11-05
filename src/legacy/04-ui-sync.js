// UI sync
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { uiIcon, stripPictographs } from '../assets/ui-icons';
import { tokenIcon } from '../assets/icons';
import { ARC, arcTxUrl, arcAltTxUrl } from '../config/chain-config';
import { effectiveStatus, formatDue } from '../lib/invoice-due';
/* ══════════════════════════════════════
   UI SYNC
══════════════════════════════════════ */
const UISync = (() => {
  function fmt(n, d=4) {
    if (n === 0) return '0.00';
    if (n >= 1000) return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    return parseFloat(n.toFixed(d)).toString();
  }
  // Token-aware amount: cirBTC has 8 decimals, stablecoins show 2
  function fmtTok(token, n) {
    if (token === 'cirBTC') return n === 0 ? '0.00' : parseFloat(n.toFixed(8)).toString();
    return fmt(n, 2);
  }
  // EURC is priced with a fallback value until a live price loads; anything converted with it is marked approximate.
  function eurcApprox() { return WalletState.getTokenBal('EURC', 'ARC') > 0 && !PriceFeed.eurcLive; }
  function renderApproxNotes() {
    const on = eurcApprox();
    ['home-total-bal', 'portfolio-amount', 'home-total-earned'].forEach((id) => {
      const el = document.getElementById(id); if (!el) return;
      let note = el.nextElementSibling;
      if (!note || !note.hasAttribute('data-approx-note')) {
        note = document.createElement('div'); note.setAttribute('data-approx-note', ''); note.className = 'rate-note';
        note.style.cssText = 'font-size:10px;color:var(--text3);margin-top:4px';
        el.insertAdjacentElement('afterend', note);
      }
      note.textContent = on ? 'Approximate, live rate unavailable' : '';
      note.style.display = on ? '' : 'none';
    });
  }
  window.eurcApprox = eurcApprox; window.renderApproxNotes = renderApproxNotes;
  function fmtUSD(n) { return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function setEl(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

  function refresh() {
    const usdc = WalletState.getTokenBal('USDC', 'ARC');
    const totalUSD = WalletState.getTotalUSD();
    const onChainTxs = WalletState.getOnChainTxCount();

    refreshNetworkStatus();
    const approxMark = eurcApprox() ? '≈ ' : '';
    setEl('home-total-bal', WalletState.connected() && WalletState.getStatus().status === 'loading' && totalUSD === 0 ? '…' : approxMark + fmtUSD(totalUSD));
    setEl('home-usdc-bal', fmt(usdc,2) + ' USDC');
    setEl('home-usdc-price', '$' + PriceFeed.usdc.toFixed(2));
    // Show REAL on-chain tx count (nonce) + local session txs
    const totalTx = onChainTxs + WalletState.getTxHistory().length;
    setEl('home-tx-count', totalTx);
    setEl('home-arc-tx-count', onChainTxs > 0 ? onChainTxs : WalletState.getTxHistory().length);
    setEl('portfolio-amount', approxMark + fmtUSD(totalUSD));
    renderApproxNotes();
    // the username pay link uses the connected wallet address, so refresh it when the wallet changes
    if (typeof window.updateUsernameUI === 'function') window.updateUsernameUI();

    // Update Multi-Chain Unified Balance (Circle Gateway)
    const arcUSDC = WalletState.getTokenBal('USDC', 'ARC');
    // Peer-chain balances are read from each chain's RPC. Unknown or failed reads show an em dash, never a made-up number.
    const ethPeer = WalletState.getPeerBalance('sepolia');
    const basePeer = WalletState.getPeerBalance('baseSepolia');
    const ethUSDC = ethPeer.balance;
    const baseUSDC = basePeer.balance;
    const peerLabel = (p) => p.balance === null ? (WalletState.connected() ? '—' : '—') : fmt(p.balance, 2) + ' USDC';
    const unifiedTotal = arcUSDC + (ethUSDC || 0) + (baseUSDC || 0);
    setEl('gateway-bal-arc', fmt(arcUSDC, 2) + ' USDC');
    setEl('gateway-bal-eth', peerLabel(ethPeer));
    setEl('gateway-bal-base', peerLabel(basePeer));
    setEl('gateway-unified-total', fmtUSD(unifiedTotal) + ' USDC');

    if (WalletState.connected()) {
      setEl('portfolio-sub', `${fmt(usdc,2)} USDC · ${onChainTxs} on-chain txs · Arc Testnet`);
    } else {
      setEl('portfolio-sub', 'Connect wallet to view balances');
    }

    setEl('pay-usdc-bal', UISync.fmt(WalletState.getTokenBal('USDC', 'ARC'),2) + ' USDC');
    setEl('pay-usdc-price', '$' + PriceFeed.usdc.toFixed(2));
    // Dynamic token balance hint
    const payToken = document.getElementById('payToken')?.value || 'USDC';
    const payBal = WalletState.getTokenBal(payToken, 'ARC');
    setEl('payBalanceHint', `Balance: ${fmtTok(payToken, payBal)} ${payToken}`);
    const badge = document.getElementById('payAmountBadge');
    if (badge) badge.textContent = payToken==='USDC'?'USDC':payToken==='cirBTC'?'cirBTC':'EURC';

    // Auto-fill invoice wallet address if connected
    const invAddrEl = document.getElementById('inv-addr');
    if (invAddrEl && !invAddrEl.value && WalletState.getAddr()) invAddrEl.value = WalletState.getAddr();

    // Auto-fill paylink wallet address if connected
    const plWalletEl = document.getElementById('pl-wallet');
    if (plWalletEl && WalletState.getAddr()) {
      if (!plWalletEl.dataset.prefilled && !plWalletEl.dataset.userEdited && !plWalletEl.value) { plWalletEl.dataset.prefilled = '1';
        plWalletEl.value = WalletState.getAddr();
        if (typeof updateMainPayLink === 'function') updateMainPayLink();
      }
    }

    // Auto-fill receive wallet address if connected
    const rcvInput = document.getElementById('receive-addr-input');
    if (rcvInput && WalletState.getAddr() && !rcvInput.value) {
      rcvInput.value = WalletState.getAddr();
      if (typeof generateQR === 'function') generateQR();
    }

    refreshAssets();
    refreshSwapHints();
    refreshBridgeHints();
    if (typeof window.AL_faucetPaint === 'function') window.AL_faucetPaint();
    refreshInvoiceStats();
    refreshBridgeStats();
    if (typeof updateHomeFreelancerStats === 'function') updateHomeFreelancerStats();
    if (typeof updateLocalCurrencies === 'function') updateLocalCurrencies(totalUSD);
  }

  function refreshSwapHints() {
    // The Swap page renders its own balances
    if (typeof calcSwapOut === 'function') { calcSwapOut(); return; }
    const inSel = document.getElementById('swapTokenIn');
    if (!inSel) return;
    const token = inSel.value;
    const bal = WalletState.getTokenBal(token, 'ARC');
    const hint = document.getElementById('swapInBalance');
    if (hint) {
      const label = token === 'native_usdc' ? 'USDC' : token;
      hint.textContent = WalletState.connected() ? `Balance: ${fmtTok(label, bal)} ${label}` : 'Balance: —';
    }
    calcSwapOut();
  }

  function refreshBridgeHints() {
    // The bridge page owns its own balance hints (Arc side and peer side)
    if (typeof updateBridgeUI === 'function') { updateBridgeUI(); return; }
    const tokenSel = document.getElementById('bridgeToken');
    if (!tokenSel) return;
    const token = tokenSel.value;
    const bal = WalletState.getTokenBal(token, 'ARC');
    const hint = document.getElementById('bridgeBalanceHint');
    if (hint) hint.textContent = `Balance (Arc Testnet): ${fmtTok(token, bal)} ${token}`;
  }

  function refreshAssets() {
    const list = document.getElementById('assets-list');
    if (!list) return;
    if (!WalletState.connected()) {
      list.innerHTML = '<div style="text-align:center;color:var(--text2);font-size:13px;padding:32px 0">Connect wallet to view assets</div>';
      return;
    }
    const st = WalletState.getStatus();
    if (st.status === 'loading' && WalletState.getTotalUSD() === 0 && WalletState.getTokenBal('USDC') === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text2);font-size:13px;padding:32px 0"><div class="spinner" style="margin:0 auto 10px"></div>Loading balances…</div>';
      return;
    }
    const usdc = WalletState.getTokenBal('USDC', 'ARC');
    const eurc = WalletState.getTokenBal('EURC', 'ARC');
    const cirbtc = WalletState.getTokenBal('cirBTC', 'ARC');
    const btcUsd = PriceFeed.btc ? '$' + (cirbtc * PriceFeed.btc).toFixed(2) : '—';
    const notice = st.status === 'wrong-network'
      ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;margin-bottom:10px;border-radius:10px;background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.25);font-size:12px;color:var(--yellow)"><span>${st.message}</span><button class="btn btn-sm btn-primary" onclick="WalletManager.switchToArc()">Switch</button></div>`
      : '';
    const err = st.status === 'error'
      ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;margin-bottom:10px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);font-size:12px;color:var(--red)"><span>${st.message}</span><button class="btn btn-sm btn-ghost" onclick="WalletState.loadFromChain(WalletState.getAddr())">Retry</button></div>`
      : '';
    list.innerHTML = notice + err + `
      <div class="asset-row">
        <div class="asset-icon" style="background:transparent">${tokenIcon('USDC', 30)}</div>
        <div style="flex:1"><div class="asset-name">USD Coin</div><div class="asset-ticker">USDC · Arc Testnet</div></div>
        <div><div class="asset-amount">$${(usdc * PriceFeed.usdc).toFixed(2)}</div><div class="asset-change">${fmt(usdc,2)} USDC</div></div>
      </div>
      <div class="asset-row">
        <div class="asset-icon" style="background:transparent">${tokenIcon('EURC', 30)}</div>
        <div style="flex:1"><div class="asset-name">Euro Coin</div><div class="asset-ticker">EURC · Arc Testnet</div></div>
        <div><div class="asset-amount">${PriceFeed.eurcLive ? '' : '≈ '}$${(eurc * PriceFeed.eurc).toFixed(2)}</div><div class="asset-change">${fmt(eurc,2)} EURC${PriceFeed.eurcLive ? '' : ' · approximate, live rate unavailable'}</div></div>
      </div>
      <div class="asset-row">
        <div class="asset-icon" style="background:transparent">${tokenIcon('cirBTC', 30)}</div>
        <div style="flex:1"><div class="asset-name">Circle Wrapped Bitcoin</div><div class="asset-ticker">cirBTC · Arc Testnet</div></div>
        <div><div class="asset-amount">${btcUsd}</div><div class="asset-change">${fmtTok('cirBTC', cirbtc)} cirBTC</div></div>
      </div>
    `;
  }

  // Header network badge: shows the chain the wallet is actually on
  function refreshNetworkStatus() {
    const badge = document.getElementById('netBadge');
    if (!badge) return;
    const st = WalletState.getStatus();
    if (WalletState.connected() && st.status === 'wrong-network') {
      badge.style.cursor = 'pointer';
      badge.style.borderColor = 'rgba(239,68,68,0.4)';
      badge.style.color = 'var(--red)';
      badge.innerHTML = '<span class="live-dot" style="margin-right:4px;background:var(--red)"></span>Wrong network · Switch to ' + ARC.name;
      badge.onclick = () => WalletManager.switchToArc();
    } else {
      badge.style.cursor = '';
      badge.style.borderColor = '';
      badge.style.color = '';
      badge.innerHTML = '<span class="live-dot" style="margin-right:4px"></span>' + ARC.name + ' · ' + ARC.chainId;
      badge.onclick = null;
    }
  }

  function refreshHistory() {
    renderHistory('home-history', WalletState.getTxHistory().slice(0,6));
    renderHistory('swap-history', WalletState.getTxHistory('swap'));
    renderHistory('bridge-history', WalletState.getTxHistory('bridge'));
    renderPayHistory();
    const sentToday = WalletState.getTxHistory('send').filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString()).length;
    setEl('pay-sent-today', sentToday);
    // Refresh activity graph if it's ready
    if (typeof ActivityGraph !== 'undefined') ActivityGraph.render();
    if (typeof window.updateMonthlyStats === 'function') window.updateMonthlyStats();
  }

  let currentPayHistoryFilter = 'all';

  function renderPayHistory() {
    const el = document.getElementById('pay-history-content');
    if (!el) return;
    
    let txs = WalletState.getTxHistory(); // get all
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    
    if (currentPayHistoryFilter === 'send') {
      txs = txs.filter(t => t.type === 'send');
    } else if (currentPayHistoryFilter === 'today') {
      txs = txs.filter(t => t.timestamp && new Date(t.timestamp).getTime() >= todayStart);
    } else if (currentPayHistoryFilter === 'week') {
      txs = txs.filter(t => t.timestamp && new Date(t.timestamp).getTime() >= oneWeekAgo);
    }
    
    const filterHtml = `
      <div class="slip-btns" style="margin-bottom:16px; gap:8px;">
        <button class="slip-btn ${currentPayHistoryFilter === 'all' ? 'active' : ''}" onclick="setPayHistoryFilter('all')">All</button>
        <button class="slip-btn ${currentPayHistoryFilter === 'send' ? 'active' : ''}" onclick="setPayHistoryFilter('send')">Send</button>
        <button class="slip-btn ${currentPayHistoryFilter === 'today' ? 'active' : ''}" onclick="setPayHistoryFilter('today')">Today</button>
        <button class="slip-btn ${currentPayHistoryFilter === 'week' ? 'active' : ''}" onclick="setPayHistoryFilter('week')">This Week</button>
      </div>
    `;
    
    if (!txs.length) {
      el.innerHTML = filterHtml + '<div class="history-empty">No matching transactions found</div>';
      return;
    }
    
    el.innerHTML = filterHtml + `<table class="history-table">
      <thead><tr><th>TX HASH</th><th>TO / TYPE</th><th>AMOUNT</th><th>STATUS</th></tr></thead>
      <tbody>${txs.map(tx => `<tr>
        <td>
          ${tx.hash ? `<a href="${arcAltTxUrl(tx.hash)}" target="_blank" class="mono-small" style="color:var(--yellow);text-decoration:underline">${tx.hash.slice(0,6)+'...'+tx.hash.slice(-4)}</a>` : '<div class="mono-small">0x—</div>'}
        </td>
        <td><div class="mono-small">${tx.to ? tx.to.slice(0,6)+'...'+tx.to.slice(-4) : (tx.type ? tx.type.toUpperCase() : '—')}</div></td>
        <td>${tx.display}</td>
        <td class="green">✓ Confirmed</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  window.setPayHistoryFilter = function(filter) {
    currentPayHistoryFilter = filter;
    renderPayHistory();
  };

  function renderHistory(id, txs) {
    const el = document.getElementById(id);
    if (!el) return;
    
    // For swap-history, ensure persisted localStorage swap records are loaded (Requirement 18)
    if (id === 'swap-history' && (!txs || !txs.length)) {
      try {
        const stored = JSON.parse(localStorage.getItem('arclance_swap_records') || '[]');
        if (stored && stored.length) txs = stored;
      } catch (_) {}
    }

    if (!txs || !txs.length) {
      el.innerHTML = id === 'swap-history'
        ? '<div class="history-empty">No swaps yet</div>'
        : '<div class="history-empty">No transactions yet</div>';
      return;
    }
    const icons = { send:{bg:'rgba(239,68,68,0.12)',c:'var(--red)',i:'↑'}, swap:{bg:'rgba(245,197,24,0.1)',c:'var(--yellow)',i:'⇄'}, bridge:{bg:'rgba(108,63,196,0.12)',c:'#a78bfa',i:uiIcon('bridge',16)} };
    el.innerHTML = txs.map(tx => {
      const ic = icons[tx.type] || icons.send;
      const time = tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
      const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString([],{month:'short',day:'numeric'}) : '';
      const hasRealHash = tx.hash && String(tx.hash).startsWith('0x');
      const explorerLink = hasRealHash ? arcTxUrl(tx.hash) : null;
      const hashHtml = explorerLink
        ? `<a href="${explorerLink}" target="_blank" class="badge badge-green" style="font-size:10px;text-decoration:none;cursor:pointer">Arc Explorer ↗</a>`
        : `<span class="badge badge-yellow" style="font-size:10px">Confirmed</span>`;
      return `<div class="tx-row">
        <div class="tx-icon" style="background:${ic.bg};color:${ic.c}">${ic.i}</div>
        <div style="flex:1">
          <div class="tx-name">${tx.label || tx.display}</div>
          <div class="tx-time">${dateStr ? dateStr + ' · ' : ''}${time}${tx.rate ? ` · <span style="color:var(--yellow);font-weight:600">${tx.rate}</span>` : ''}</div>
        </div>
        <div style="margin-right:8px">${hashHtml}</div>
        <div class="tx-amount" style="color:${ic.c};margin-left:4px">${tx.display}</div>
      </div>`;
    }).join('');
  }

  function refreshInvoices() {
    const list = document.getElementById('invoices-list');
    if (!list) return;
    const invs = WalletState.getInvoices();
    if (!invs.length) { 
      list.innerHTML = '<div style="text-align:center;padding:32px 16px"><div style="font-size:36px;margin-bottom:10px;opacity:.4">' + uiIcon('file',36) + '</div><div style="color:var(--text2);font-size:13px">No invoices yet. Create one to see it here.</div></div>'; 
      refreshInvoiceStats();
      if (typeof window.populateNextInvoiceNumber === 'function') window.populateNextInvoiceNumber();
      return; 
    }
    list.innerHTML = invs.map((inv, idx) => {
      let badgeHtml = '';
      const status = effectiveStatus(inv); // pending becomes overdue once the due date has passed
      if (status === 'paid') {
        badgeHtml = '<span class="badge badge-green">Paid</span>';
      } else if (status === 'overdue') {
        badgeHtml = '<span class="badge badge-red">Overdue</span>';
      } else {
        badgeHtml = `<span class="badge badge-yellow">${status}</span>`;
      }
      if (inv.isEscrow) {
        badgeHtml += ` <span class="badge badge-purple" style="font-size:10px">Escrow (${inv.escrowStatus || 'Active'})</span>`;
      }
      
      const canPay = status !== 'paid' && inv.walletAddr && WalletState.connected();
      const isPending = status === 'pending';
      const isOverdue = status === 'overdue';
      const showEscrowRelease = inv.isEscrow && (inv.status === 'paid' || inv.escrowStatus === 'Locked in Escrow');
      
      return `<div class="tx-row" style="flex-wrap:wrap;gap:8px">
        <div class="tx-icon" style="background:rgba(245,197,24,0.1);color:var(--yellow)">${uiIcon('file',18)}</div>
        <div style="flex:1;min-width:120px">
          <div class="tx-name">${inv.number} — ${inv.client}</div>
          <div class="tx-time">${inv.yourName ? 'From: '+inv.yourName+' · ' : ''}${new Date(inv.createdAt).toLocaleDateString()}${inv.due ? ' · Due: ' + formatDue(inv.due) : ''}</div>
          ${inv.project ? `<div style="font-size:11px;color:var(--text2)">Project: ${inv.project}</div>` : ''}
          ${inv.isEscrow ? `<div style="font-size:10px;color:#c4b5fd;margin-top:2px">Escrow tag · saved in this browser, funds not locked</div>` : ''}
        </div>
        ${badgeHtml}
        <div class="tx-amount" style="color:var(--yellow);margin-left:8px">${inv.amount} USDC</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
          ${canPay ? `<button onclick="TxManager.payInvoice(${idx})" style="padding:6px 12px;background:linear-gradient(135deg,var(--yellow),#d4a017);color:#000;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif">PAY</button>` : ''}
          ${showEscrowRelease ? `<button onclick="releaseEscrowInvoice(${idx})" style="padding:6px 12px;background:rgba(108,63,196,0.2);color:#c4b5fd;border:1px solid rgba(108,63,196,0.4);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">Release</button><button onclick="disputeEscrowInvoice(${idx})" style="padding:6px 12px;background:rgba(239,68,68,0.12);color:var(--red);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">Dispute</button>` : ''}
          ${(isPending || isOverdue) && !inv.isEscrow ? `<button onclick="WalletState.markInvoicePaid(${idx})" style="padding:6px 12px;background:rgba(0,230,118,0.15);color:var(--green);border:1px solid rgba(0,230,118,0.3);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif">✓ Mark Paid</button>` : ''}
          ${isPending || isOverdue ? `<button onclick="shareInvoiceReminder('${inv.client.replace(/'/g, "\\'")}', '${inv.number.replace(/'/g, "\\'")}', '${inv.amount}', '${inv.walletAddr || ''}')" style="padding:6px 12px;background:rgba(0,230,118,0.08);color:var(--green);border:1px solid rgba(0,230,118,0.2);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Outfit',sans-serif">Remind</button>` : ''}
        </div>
      </div>`;
    }).join('');
    refreshInvoiceStats();
    if (typeof window.populateNextInvoiceNumber === 'function') window.populateNextInvoiceNumber();
  }

  function refreshInvoiceStats() {
    const s = WalletState.getInvStats();
    setEl('inv-total', fmtUSD(s.total));
    setEl('inv-paid', fmtUSD(s.paid));
    setEl('inv-pending', fmtUSD(s.pending));
    setEl('inv-overdue', fmtUSD(s.overdue));
    setEl('inv-paid-count', s.paidCount + ' invoices paid');
    setEl('inv-pending-count', s.pendingCount + ' awaiting');
    setEl('inv-overdue-count', s.overdueCount + ' past due');
  }

  function refreshBridgeStats() {
    const s = WalletState.getBridgeStats();
    setEl('bridge-vol', fmtUSD(s.volume));
    setEl('bridge-count', s.count);
    setEl('bridge-fees', fmt(s.fees,2) + ' USDC');
  }

  return { refresh, refreshHistory, refreshSwapHints, refreshBridgeHints, refreshAssets, refreshInvoices, refreshInvoiceStats, refreshBridgeStats, fmt, fmtUSD };
})();


publish({ UISync });
