// Activity graph and navigation
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { uiIcon, stripPictographs } from '../assets/ui-icons';
import { ARC } from '../config/chain-config';
/* ══════════════════════════════════════
   ACTIVITY GRAPH
══════════════════════════════════════ */
const ActivityGraph = (() => {
  let _filter = '1D';
  let _canvas = null;
  let _ctx = null;

  function setFilter(f, btn) {
    _filter = f;
    document.querySelectorAll('#act-filter-pills .time-pill').forEach(p=>p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    render();
  }

  function _getFilteredTxs() {
    const all = WalletState.getTxHistory();
    const now = Date.now();
    const ranges = { '1D': 86400000, '1W': 604800000, '1M': 2592000000, '3M': 7776000000 };
    if (_filter === 'ALL') return all;
    const cutoff = now - (ranges[_filter] || 86400000);
    return all.filter(t => new Date(t.timestamp).getTime() >= cutoff);
  }

  function _getBuckets(txs) {
    if (!txs.length) return { labels:[], payments:[], swaps:[], bridges:[] };
    const bucketCount = _filter === '1D' ? 12 : _filter === '1W' ? 7 : _filter === '1M' ? 15 : _filter === '3M' ? 12 : Math.min(txs.length, 10);
    const labels = Array.from({length: bucketCount}, (_,i) => `${i+1}`);
    const payments = Array(bucketCount).fill(0);
    const swaps = Array(bucketCount).fill(0);
    const bridges = Array(bucketCount).fill(0);
    txs.forEach((tx, i) => {
      const bucket = Math.min(Math.floor(i / Math.max(1, Math.ceil(txs.length / bucketCount))), bucketCount - 1);
      if (tx.type === 'send') payments[bucket]++;
      else if (tx.type === 'swap') swaps[bucket]++;
      else if (tx.type === 'bridge') bridges[bucket]++;
    });
    return { labels, payments, swaps, bridges };
  }

  function render() {
    _canvas = document.getElementById('act-chart');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');
    const txs = _getFilteredTxs();
    const emptyEl = document.getElementById('act-empty');

    // Stats
    const allTxs = WalletState.getTxHistory();
    document.getElementById('act-total') && (document.getElementById('act-total').textContent = allTxs.length);
    document.getElementById('act-swaps') && (document.getElementById('act-swaps').textContent = allTxs.filter(t=>t.type==='swap').length);
    document.getElementById('act-bridges') && (document.getElementById('act-bridges').textContent = allTxs.filter(t=>t.type==='bridge').length);
    document.getElementById('act-payments') && (document.getElementById('act-payments').textContent = allTxs.filter(t=>t.type==='send').length);

    // Recent history
    const histEl = document.getElementById('act-history-list');
    if (histEl && allTxs.length) {
      const icons = { send:{bg:'rgba(245,197,24,0.1)',c:'var(--yellow)',i:uiIcon('send',16)}, swap:{bg:'rgba(34,211,238,0.1)',c:'var(--teal)',i:'⇄'}, bridge:{bg:'rgba(108,63,196,0.12)',c:'#a78bfa',i:uiIcon('bridge',16)} };
      histEl.innerHTML = allTxs.slice(0,8).map(tx => {
        const ic = icons[tx.type] || icons.send;
        const time = tx.timestamp ? new Date(tx.timestamp).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
        return `<div class="tx-row">
          <div class="tx-icon" style="background:${ic.bg};color:${ic.c}">${ic.i}</div>
          <div style="flex:1"><div class="tx-name">${tx.label}</div><div class="tx-time">${time}</div></div>
          <span class="badge badge-green">Done</span>
          <div class="tx-amount" style="color:${ic.c};margin-left:8px">${tx.display}</div>
        </div>`;
      }).join('');
    } else if (histEl) histEl.innerHTML = '<div class="history-empty">No activity yet</div>';

    if (!txs.length) {
      if (emptyEl) emptyEl.style.display = 'flex';
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const dpr = window.devicePixelRatio || 1;
    const W = _canvas.offsetWidth;
    const H = _canvas.offsetHeight;
    _canvas.width = W * dpr; _canvas.height = H * dpr;
    _ctx.scale(dpr, dpr);

    const { labels, payments, swaps, bridges } = _getBuckets(txs);
    const maxVal = Math.max(1, ...payments, ...swaps, ...bridges);
    const pad = { left: 40, right: 20, top: 20, bottom: 30 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const barGroupW = chartW / labels.length;
    const barW = Math.max(4, barGroupW * 0.22);

    _ctx.clearRect(0, 0, W, H);

    // Grid lines
    _ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    _ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      _ctx.beginPath(); _ctx.moveTo(pad.left, y); _ctx.lineTo(W - pad.right, y); _ctx.stroke();
      _ctx.fillStyle = 'rgba(122,120,160,0.6)';
      _ctx.font = '10px Outfit';
      _ctx.fillText(Math.round(maxVal * (1 - i/4)), 0, y + 3);
    }

    const series = [
      { data: payments, color: '#f5c518' },
      { data: swaps, color: '#22d3ee' },
      { data: bridges, color: '#a78bfa' }
    ];

    labels.forEach((_, i) => {
      const groupX = pad.left + i * barGroupW + barGroupW * 0.1;
      series.forEach((s, si) => {
        const val = s.data[i];
        if (!val) return;
        const barH = (val / maxVal) * chartH;
        const x = groupX + si * (barW + 2);
        const y = pad.top + chartH - barH;
        _ctx.fillStyle = s.color;
        _ctx.globalAlpha = 0.85;
        // Rounded top bar
        const r = Math.min(3, barW / 2);
        _ctx.beginPath();
        _ctx.moveTo(x + r, y);
        _ctx.lineTo(x + barW - r, y);
        _ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        _ctx.lineTo(x + barW, y + barH);
        _ctx.lineTo(x, y + barH);
        _ctx.lineTo(x, y + r);
        _ctx.quadraticCurveTo(x, y, x + r, y);
        _ctx.fill();
      });
      _ctx.globalAlpha = 1;
      // X label
      _ctx.fillStyle = 'rgba(122,120,160,0.7)';
      _ctx.font = '9px Outfit';
      _ctx.fillText(labels[i], pad.left + i * barGroupW + barGroupW/2 - 4, H - 8);
    });
  }

  return { setFilter, render };
})();


let _sidebarExpanded=false;
async function navigate(page, el) { const openReceiveTab = page === 'receive'; if (openReceiveTab) page = 'payments';
  toggleMobileNav(false);
  // 2. If connected, check if Arc Testnet is selected and switch silently if wrong network
  const provider = WalletManager.getProvider();
  if (provider) {
    try {
      const chainId = await provider.request({ method: 'eth_chainId' }).catch(() => null);
      if (chainId) {
        const chainStr = String(chainId).toLowerCase();
        const isArcNetwork = chainStr === ARC.chainIdHex.toLowerCase() || 
                             chainStr === String(ARC.chainId) ||
                             chainStr.includes(ARC.chainIdHex.slice(2).toLowerCase());
        
        if (!isArcNetwork) {
          console.log(`[ArcLance Web3] Wrong network detected (${chainId}). Auto-switching to Arc Testnet...`);
          // Trigger auto-switch silently in background
          WalletManager.ensureArcNetwork(provider);
        }
      }
    } catch (err) {
      console.warn(`[ArcLance Web3] Failed to query chainId on navigation:`, err);
    }
  }

  const titles = {
    home: "Home | ArcLance",
    payments: "Payments | ArcLance",
    swap: "Swap | ArcLance",
    bridge: "Bridge | ArcLance",
    escrow: "Escrow | ArcLance",
    p2p: "P2P | ArcLance",
    invoices: "Invoices | ArcLance",
    paylink: "Pay Link | ArcLance",
    ai: "Assistant | ArcLance",
    faucet: "Faucet | ArcLance",
    docs: "Docs | ArcLance",
    guide: "Freelancer Guide | ArcLance",
    terms: "Terms | ArcLance",
    privacy: "Privacy | ArcLance",
    about: "About | ArcLance",
    support: "Support | ArcLance",
    contact: "Contact | ArcLance",
    clients: "How to pay an invoice | ArcLance",
    roadmap: "Roadmap | ArcLance"
  };
  if (titles[page]) document.title = titles[page];

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  // Fix content div scroll for docs page
  const contentDiv = document.querySelector('.content');
  if (contentDiv) {
    if (page === 'docs') {
      contentDiv.style.overflow = 'hidden';
      contentDiv.style.padding = '0';
    } else {
      contentDiv.style.overflow = '';
      contentDiv.style.padding = '';
    }
  }
  const target=document.getElementById('page-'+page);
  if(target){
    target.classList.add('active'); if (openReceiveTab && typeof switchPayTab === 'function') switchPayTab('receive', document.querySelector(`.pay-tab[onclick*="'receive'"]`));
    requestAnimationFrame(()=>{
      if (window.AL_pages && typeof window.AL_pages[page] === 'function') { try { window.AL_pages[page](); } catch (e) { console.error('[ArcLance] page error', page, e); } }
      UISync.refresh();
      UISync.refreshHistory();
      UISync.refreshInvoices();
      UISync.refreshBridgeStats();
      if (typeof window.updateMonthlyStats === 'function') window.updateMonthlyStats();
      if(page==='activity'||page==='home') ActivityGraph.render();
    });
  }
  if(el)el.classList.add('active');
  if (typeof window.AL_onNavigate === 'function') window.AL_onNavigate(page, el);
}
function toggleSidebar() {
  _sidebarExpanded=!_sidebarExpanded;
  document.getElementById('sidebar').classList.toggle('expanded',_sidebarExpanded);
  const icon=document.getElementById('toggle-icon');
  if(icon)icon.innerHTML=_sidebarExpanded?'<path d="M15 18l-6-6 6-6"/>':'<path d="M9 18l6-6-6-6"/>';
}


function toggleMobileNav(force) {
  const open = typeof force === 'boolean' ? force : !document.body.classList.contains('nav-open');
  document.body.classList.toggle('nav-open', open);
  const b = document.getElementById('menuBtn');
  if (b) { b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMobileNav(false); });

publish({ ActivityGraph, navigate, toggleSidebar, toggleMobileNav });
