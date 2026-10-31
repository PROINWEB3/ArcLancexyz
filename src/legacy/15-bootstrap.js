// DOMContentLoaded bootstrap
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', ()=>{
  document.title = "Home | ArcLance";
  const proto = window.location.protocol;
  if (proto === 'https:' || proto === 'http:') {
    WalletManager.init();
  } else {
    console.warn(`[ArcLance Web3] WalletManager.init deferred: protocol is ${proto}`);
  }
  renderCountries();
  
  // Restore AI chat history from memory
  if (typeof ChatMemory !== 'undefined') {
    ChatMemory.restoreHistory();
  }
  loadChatHistory();
  
  UISync.refresh();
  UISync.refreshHistory();
  UISync.refreshInvoices();
  UISync.refreshInvoiceStats();
  UISync.refreshBridgeStats();
  updateBridgeUI();
  calcSwapOut();
  ActivityGraph.render();
  // Delay second refresh so all DOM elements are ready
  setTimeout(() => {
    UISync.refresh();
    UISync.refreshHistory();
    UISync.refreshBridgeStats();
    if (typeof window.updateMonthlyStats === 'function') window.updateMonthlyStats();
    if (typeof window.renderScheduledPayments === 'function') window.renderScheduledPayments();
  }, 300);

  // Keyboard shortcut for search
  document.addEventListener('keydown', e=>{
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openSearch();}
  });

  // Time pills
  document.querySelectorAll('.time-pill').forEach(pill=>{
    pill.addEventListener('click',()=>{document.querySelectorAll('.time-pill').forEach(p=>p.classList.remove('active'));pill.classList.add('active');});
  });

  // Fetch live currency rates
  fetchLiveExchangeRates();
  // Refresh own registered username display
  updateUsernameUI();
  // Listen for hash-based pay links arclance.io/pay/username/amount
  window.addEventListener('hashchange', handleHashPaymentRouting);
  handleHashPaymentRouting();

  // Fetch prices
  PriceFeed.fetch();
  setInterval(()=>PriceFeed.fetch(), 60000);

  // Recurring payments initialization & checks
  if (typeof renderScheduledPayments === 'function') renderScheduledPayments();
  if (typeof checkDueRecurringPayments === 'function') checkDueRecurringPayments();
});


publish({  });
