// Docs and pay tabs
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
/* ══════════════════════════════════════
   PAY TABS
══════════════════════════════════════ */
function switchDocTab(tab, btn) {
  document.querySelectorAll('.doc-tab').forEach(t=>{
    t.style.color='var(--text2)';
    t.style.borderBottom='2px solid transparent';
  });
  btn.style.color='var(--yellow)';
  btn.style.borderBottom='2px solid var(--yellow)';
  ['getting-started','send','invoice','swap','bridge','offramp','faq'].forEach(t=>{
    const el=document.getElementById('doc-'+t);
    if(el) el.style.display=(t===tab)?'block':'none';
  });
}

function showDoc(id, btn) {
  // Hide all doc sections
  document.querySelectorAll('.doc-section').forEach(s => s.style.display = 'none');
  // Show selected
  const el = document.getElementById('doc-' + id);
  if (el) el.style.display = 'block';
  // Update nav button states
  document.querySelectorAll('.doc-nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Scroll content area to top
  const area = document.getElementById('doc-content-area');
  if (area) area.scrollTop = 0;
}

function switchPayTab(tab, btn) {
  document.querySelectorAll('.pay-tab').forEach(t=>t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ['send','receive','history','username','recurring'].forEach(t=>{const el=document.getElementById('tab-'+t);if(el)el.style.display=t===tab?'block':'none';});
  if (tab === 'receive') {
    const addr = WalletState.getAddr();
    const input = document.getElementById('receive-addr-input');
    if (input && addr) {
      input.value = addr;
    }
    if (typeof generateQR === 'function') generateQR();
  }
}


publish({ switchDocTab, showDoc, switchPayTab });
