// Sidebar: Dashboard, Invoices and Pay Link stay visible; Send & Receive (with Receive tab inside it) and everything else sit under "More".
// Every page is still reachable. The items keep their own click handlers: they are only moved.
import { publish } from './publish.js';
import { uiIcon } from '../assets/ui-icons';

const pageOf = (el) => {
  const onclick = el?.getAttribute?.('onclick') || '';
  const m = /navigate\('([a-z0-9-]+)'/.exec(onclick);
  if (m) return m[1] === 'receive' ? 'payments' : m[1];
  if (/openPaymentsTab\(/.test(onclick)) return 'payments';
  return null;
};

// Open the Payments page on one of its tabs (send, receive, history, ...).
function openPaymentsTab(tab = 'send', el) {
  const resolvedTab = tab || 'send';
  const navTarget = (el && el.classList && el.classList.contains('nav-item') && document.querySelector('.sidebar')?.contains(el)) ? el : undefined;
  navigate('payments', navTarget);
  const btn = document.querySelector(`.pay-tab[onclick*="'${resolvedTab}'"]`);
  if (typeof switchPayTab === 'function') switchPayTab(resolvedTab, btn);
}

function toggleNavMore(force) {
  const list = document.getElementById('navMoreList'); const toggle = document.getElementById('navMore');
  if (!list || !toggle) return;
  const open = typeof force === 'boolean' ? force : !list.classList.contains('open');
  list.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', String(open));
}

function navItem(page, label, icon) {
  const d = document.createElement('div');
  d.className = 'nav-item'; d.setAttribute('onclick', `navigate('${page}',this)`);
  d.innerHTML = `<div class="nav-icon">${uiIcon(icon, 18)}</div><span class="nav-label">${label}</span>`;
  return d;
}

function buildNav() {
  const nav = document.querySelector('.sidebar .nav');
  if (!nav || document.getElementById('navMore')) return;
  const items = [...nav.querySelectorAll(':scope > .nav-item')];
  const by = (p) => items.find((i) => pageOf(i) === p);
  const payments = by('payments');
  const list = document.createElement('div');
  list.id = 'navMoreList'; list.className = 'nav-more-list';

  // Remove the separate top-level "Receive" item; rename "Send & History" to "Send & Receive" with the Receive tab inside it.
  if (payments) {
    payments.querySelector('.nav-label').textContent = 'Send & Receive';
    payments.setAttribute('onclick', "openPaymentsTab('send',this)");
    list.appendChild(payments);
  }
  for (const p of ['swap', 'bridge', 'escrow', 'p2p', 'ai', 'faucet', 'docs']) { const it = by(p); if (it) list.appendChild(it); }
  list.appendChild(navItem('clients', 'How to pay an invoice', 'file'));
  list.appendChild(navItem('roadmap', 'Roadmap', 'star'));
  list.appendChild(navItem('about', 'About', 'info'));

  const more = document.createElement('div');
  more.id = 'navMore'; more.className = 'nav-item'; more.setAttribute('role', 'button'); more.tabIndex = 0;
  more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'navMoreList');
  more.innerHTML = `<div class="nav-icon">${uiIcon('more', 18)}</div><span class="nav-label">More <span class="nav-caret">▾</span></span>`;
  more.addEventListener('click', () => toggleNavMore());
  more.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleNavMore(); } });
  nav.appendChild(more); nav.appendChild(list);
}

// Called by navigate(): highlight the item for the page (also when navigate() was called from code) and open More when it holds it.
window.AL_onNavigate = (page, el) => {
  const list = document.getElementById('navMoreList');
  let target = (el && pageOf(el) === page && document.querySelector('.sidebar')?.contains(el)) ? el : null;
  if (!target) {
    document.querySelectorAll('.sidebar .nav-item').forEach((n) => n.classList.remove('active'));
    target = [...document.querySelectorAll('.sidebar .nav-item')].find((i) => pageOf(i) === page);
    if (target) target.classList.add('active');
  }
  if (list && target && list.contains(target)) toggleNavMore(true);
};

publish({ openPaymentsTab, toggleNavMore });
document.addEventListener('DOMContentLoaded', buildNav);
