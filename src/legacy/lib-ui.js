// Small shared helpers for the Swap, Bridge, Escrow and P2P pages.
import { tokenIcon, chainIcon, letterBadge } from '../assets/icons';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (id) => document.getElementById(id);

export function fmtAmount(n, max = 6) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return parseFloat(n.toFixed(max)).toString();
}

export const tokIcon = tokenIcon;
export const netIcon = chainIcon;
export const methodIcon = letterBadge;

/** Wire a dropdown button + menu so clicking outside closes it. */
export function bindMenu(buttonId, menuId) {
  const btn = $(buttonId); const menu = $(menuId);
  if (!btn || !menu) return;
  btn.onclick = (e) => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; };
  document.addEventListener('click', () => { menu.style.display = 'none'; });
}

export const menuBoxStyle = 'display:none;position:absolute;left:0;top:calc(100% + 6px);z-index:30;background:var(--bg2);border:1px solid var(--border2);border-radius:14px;padding:6px;min-width:230px;max-height:320px;overflow-y:auto;box-shadow:0 10px 30px rgba(0,0,0,0.5)';
export const menuItemStyle = 'display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)';

export function statusBadge(kind, text) {
  const cls = { ok: 'badge-green', pending: 'badge-yellow', fail: 'badge-red', info: 'badge-purple' }[kind] || 'badge-yellow';
  return `<span class="badge ${cls}" style="font-size:10px">${esc(text)}</span>`;
}

export function emptyState(text) { return `<div class="history-empty">${esc(text)}</div>`; }

export function errorState(text, retryFn) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);font-size:12px;color:var(--red)"><span>${esc(text)}</span>${retryFn ? `<button class="btn btn-sm btn-ghost" onclick="${retryFn}">Retry</button>` : ''}</div>`;
}

export function loadingState(text = 'Loading…') {
  const row = '<div style="display:flex;align-items:center;gap:12px;padding:12px 0"><div class="skel" style="width:28px;height:28px;border-radius:50%"></div><div style="flex:1"><div class="skel" style="height:12px;width:55%;margin-bottom:8px"></div><div class="skel" style="height:10px;width:35%"></div></div><div class="skel" style="height:14px;width:64px"></div></div>';
  return `<div role="status" aria-label="${esc(text)}">${row}${row}${row}<div style="text-align:center;color:var(--text2);font-size:11px;margin-top:4px">${esc(text)}</div></div>`;
}
