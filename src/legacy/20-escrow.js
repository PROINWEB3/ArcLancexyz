// Milestone Escrow page. Reads and writes the contract at ESCROW_ADDRESS (not deployed yet).
import { publish } from './publish.js';
import { ARC, ESCROW_ADDRESS, NOT_DEPLOYED_MESSAGE, arcTxUrl } from '../config/chain-config';
import { esc, $, tokIcon, statusBadge, emptyState, errorState, loadingState } from './lib-ui.js';
import { toUnits, fromUnits, shortAddress, errorMessage } from '../lib/evm';
import { ESCROW_ABI, MILESTONE_STATUS } from '../contracts/escrow-abi';
import { readContract, encodeCall, hasCode } from '../lib/contract';
import { runArcTx, allowanceOf, approveExact } from './lib-tx.js';

const TOKENS = ['USDC', 'EURC'];
const MAX_MILESTONES = 5;
const DAY = 86400;

const es = {
  tab: 'client', view: 'list', filter: 'all',
  list: null, listErr: '', loading: false,
  detailId: null, detail: null, detailErr: '',
  deployed: null, busy: false, msg: '', msgKind: 'info', lastTx: '',
  form: { freelancer: '', token: 'USDC', title: '', days: '7', milestones: [{ amount: '', description: '' }] },
};

const me = () => WalletState.getAddr();
const isAddr = (v) => /^0x[0-9a-fA-F]{40}$/.test(v);
const dec = (token) => ARC.tokenDecimals[token] ?? 6;
const tokenSymbol = (addr) => Object.keys(ARC.tokens).find((k) => ARC.tokens[k].toLowerCase() === String(addr).toLowerCase()) || 'USDC';
const money = (v, token) => `${fromUnits(v, dec(token), 6)} ${token}`;

function setMsg(text, kind = 'info') { es.msg = text; es.msgKind = kind; render(); }

function msgHtml() {
  if (!es.msg) return '';
  const c = { info: ['rgba(245,197,24,0.07)', 'rgba(245,197,24,0.25)', 'var(--yellow)'], error: ['rgba(239,68,68,0.08)', 'rgba(239,68,68,0.25)', 'var(--red)'], ok: ['rgba(0,230,118,0.08)', 'rgba(0,230,118,0.25)', 'var(--green)'] }[es.msgKind];
  const link = es.lastTx ? ` <a href="${arcTxUrl(es.lastTx)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">View transaction ↗</a>` : '';
  return `<div style="margin-top:12px;padding:12px 14px;border-radius:12px;background:${c[0]};border:1px solid ${c[1]};color:${c[2]};font-size:12px;line-height:1.6">${esc(es.msg)}${link}</div>`;
}

// ── Data ──
function overallStatus(ms) {
  if (ms.some((m) => m.status === 4)) return 'Disputed';
  if (ms.length && ms.every((m) => m.status === 3)) return 'Completed';
  return 'Active';
}

async function loadEscrow(id) {
  const info = await readContract(ESCROW_ADDRESS, ESCROW_ABI, 'getEscrow', [BigInt(id)]);
  const ms = await Promise.all(Array.from({ length: Number(info.milestoneCount) }, (_, i) => readContract(ESCROW_ADDRESS, ESCROW_ABI, 'getMilestone', [BigInt(id), i])));
  const milestones = ms.map((m) => ({ ...m, status: Number(m.status), deliveredAt: Number(m.deliveredAt), approvedAt: Number(m.approvedAt), releasedAt: Number(m.releasedAt) }));
  return { id: String(id), ...info, autoReleaseDays: Number(info.autoReleaseDays), createdAt: Number(info.createdAt), milestones, status: overallStatus(milestones) };
}

async function checkDeployed() {
  if (!ESCROW_ADDRESS) { es.deployed = false; return false; }
  try { es.deployed = await hasCode(ESCROW_ADDRESS); } catch { es.deployed = false; }
  return es.deployed;
}

async function loadList() {
  if (!WalletState.connected()) { es.list = null; render(); return; }
  es.loading = true; es.listErr = ''; render();
  try {
    if (!(await checkDeployed())) { es.loading = false; render(); return; }
    const ids = await readContract(ESCROW_ADDRESS, ESCROW_ABI, 'escrowIdsOf', [me(), es.tab === 'client']);
    es.list = await Promise.all([...ids].reverse().slice(0, 30).map((id) => loadEscrow(id)));
  } catch (e) { es.listErr = errorMessage(e); es.list = null; }
  es.loading = false; render();
}

async function openDetail(id) {
  es.view = 'detail'; es.detailId = id; es.detail = null; es.detailErr = ''; setMsgQuiet(''); render();
  try { es.detail = await loadEscrow(id); } catch (e) { es.detailErr = errorMessage(e); }
  render();
}
function setMsgQuiet(t) { es.msg = t; es.lastTx = ''; }

// ── Actions ──
async function act(label, fn) {
  try {
    es.busy = true; es.lastTx = ''; setMsg(label);
    await fn();
  } catch (e) { setMsg(errorMessage(e), 'error'); }
  finally { es.busy = false; render(); }
}

function submitMilestoneAction(fnName, index, extra, okText) {
  return act('Preparing…', async () => {
    es.lastTx = await runArcTx(ESCROW_ADDRESS, encodeCall(ESCROW_ABI, fnName, [BigInt(es.detailId), index, ...extra]), (t) => setMsg(t));
    setMsg(okText, 'ok');
    WalletState.triggerChainSync();
    es.detail = await loadEscrow(es.detailId);
  });
}

function validateForm() {
  const f = es.form; const errs = [];
  if (!isAddr(f.freelancer)) errs.push('Enter a valid freelancer address.');
  else if (me() && f.freelancer.toLowerCase() === me().toLowerCase()) errs.push('The freelancer cannot be your own address.');
  if (f.title.trim().length < 3 || f.title.length > 80) errs.push('Title must be 3 to 80 characters.');
  const days = Number(f.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) errs.push('Auto-release must be a whole number of days from 1 to 90.');
  f.milestones.forEach((m, i) => {
    if (!(toUnits(m.amount, dec(f.token)) > 0n)) errs.push(`Milestone ${i + 1}: enter an amount above 0.`);
    if (m.description.trim().length < 2 || m.description.length > 200) errs.push(`Milestone ${i + 1}: add a short description.`);
  });
  const total = f.milestones.reduce((s, m) => s + toUnits(m.amount, dec(f.token)), 0n);
  return { errs, total };
}

async function createEscrowFlow() {
  const { errs, total } = validateForm();
  if (errs.length) { setMsg(errs[0], 'error'); return; }
  const f = es.form;
  await act('Checking allowance…', async () => {
    const token = ARC.tokens[f.token];
    const allowance = await allowanceOf(token, ESCROW_ADDRESS);
    if (allowance < total) {
      es.lastTx = await approveExact(token, ESCROW_ADDRESS, total, (t) => setMsg(`Step 1 of 2: approve ${f.token}. ${t}`));
      setMsg(`Approved. Now press "Create escrow and deposit".`, 'ok');
      return;
    }
    const milestones = f.milestones.map((m) => ({ amount: toUnits(m.amount, dec(f.token)), description: m.description.trim() }));
    es.lastTx = await runArcTx(ESCROW_ADDRESS, encodeCall(ESCROW_ABI, 'createEscrow', [f.freelancer, token, f.title.trim(), milestones, Number(f.days)]), (t) => setMsg(`Step 2 of 2: deposit. ${t}`));
    setMsg('Escrow created and funded.', 'ok');
    es.form = { freelancer: '', token: 'USDC', title: '', days: '7', milestones: [{ amount: '', description: '' }] };
    es.view = 'list'; es.tab = 'client';
    WalletState.triggerChainSync();
    loadList();
  });
}

// ── Rendering ──
function notDeployed() {
  return `<div class="card animate" style="max-width:640px;margin:0 auto;width:100%">
    <div class="section-header"><div class="section-title">Milestone Escrow</div><span class="badge badge-yellow">Arc Testnet</span></div>
    <div style="text-align:center;padding:28px 10px"><div style="font-size:15px;font-weight:700;margin-bottom:8px">${NOT_DEPLOYED_MESSAGE}</div>
    <div style="font-size:12px;color:var(--text2);line-height:1.7">Pay freelancers milestone by milestone, with the money held in a contract until you approve and release it. The escrow contract is not live yet, so there is nothing to show.</div></div></div>`;
}

function tabsHtml() {
  const tab = (id, label) => `<button type="button" class="slip-btn ${es.tab === id && es.view !== 'create' ? 'active' : ''}" data-es-tab="${id}">${label}</button>`;
  return `<div class="slip-btns" style="margin-bottom:16px">${tab('client', 'As Client')}${tab('freelancer', 'As Freelancer')}</div>`;
}

function listHtml() {
  const filters = ['all', 'active', 'completed', 'disputed'];
  const chips = filters.map((f) => `<button type="button" class="slip-btn ${es.filter === f ? 'active' : ''}" data-es-filter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('');
  let body;
  if (!WalletState.connected()) body = emptyState('Connect your wallet to see your escrows');
  else if (es.loading) body = loadingState('Loading escrows…');
  else if (es.listErr) body = errorState(es.listErr, 'window.ALEscrow.reload()');
  else if (!es.list) body = loadingState();
  else {
    const rows = es.list.filter((e) => es.filter === 'all' || e.status.toLowerCase() === es.filter);
    body = rows.length ? rows.map((e) => {
      const sym = tokenSymbol(e.token);
      const other = es.tab === 'client' ? e.freelancer : e.client;
      const kind = e.status === 'Completed' ? 'ok' : e.status === 'Disputed' ? 'fail' : 'pending';
      return `<div class="tx-row" data-es-open="${e.id}" style="cursor:pointer;gap:12px">
        ${tokIcon(sym, 28)}
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">${esc(e.title)}</div>
        <div style="font-size:11px;color:var(--text2)">${es.tab === 'client' ? 'Freelancer' : 'Client'} ${shortAddress(other)} · ${e.milestones.length} milestone${e.milestones.length > 1 ? 's' : ''}</div></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:700">${money(e.totalAmount, sym)}</div>${statusBadge(kind, e.status)}</div></div>`;
    }).join('') : emptyState(es.list.length ? 'No escrows match this filter' : (es.tab === 'client' ? 'You have not created any escrows yet' : 'No escrows where you are the freelancer'));
  }
  return `<div class="card animate" style="max-width:760px;margin:0 auto;width:100%">
    <div class="section-header"><div class="section-title">Milestone Escrow</div>${es.tab === 'client' ? '<button type="button" class="btn btn-primary btn-sm" data-es-new="1">+ New escrow</button>' : ''}</div>
    ${tabsHtml()}<div class="slip-btns" style="margin-bottom:12px">${chips}</div>${body}${msgHtml()}</div>`;
}

function formHtml() {
  const f = es.form; const { errs, total } = validateForm();
  const ms = f.milestones.map((m, i) => `<div data-keep-cols="1" style="display:grid;grid-template-columns:110px 1fr auto;gap:8px;margin-bottom:8px">
      <input class="form-input" data-es-m="${i}" data-k="amount" placeholder="Amount" inputmode="decimal" value="${esc(m.amount)}">
      <input class="form-input" data-es-m="${i}" data-k="description" placeholder="What is delivered" maxlength="200" value="${esc(m.description)}">
      ${f.milestones.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-es-rm="${i}" aria-label="Remove milestone">✕</button>` : '<span></span>'}</div>`).join('');
  const needsApprove = false;
  return `<div class="card animate" style="max-width:640px;margin:0 auto;width:100%">
    <div class="section-header"><div class="section-title">New escrow</div><button type="button" class="btn btn-ghost btn-sm" data-es-back="1">Back</button></div>
    <div class="form-group"><label class="form-label">Freelancer address</label><input class="form-input mono" data-es-f="freelancer" placeholder="0x…" value="${esc(f.freelancer)}"></div>
    <div class="form-group"><label class="form-label">Token</label><div class="slip-btns">${TOKENS.map((t) => `<button type="button" class="slip-btn ${f.token === t ? 'active' : ''}" data-es-token="${t}" style="display:flex;align-items:center;gap:6px">${tokIcon(t, 18)}${t}</button>`).join('')}</div></div>
    <div class="form-group"><label class="form-label">Title</label><input class="form-input" data-es-f="title" maxlength="80" placeholder="Website redesign" value="${esc(f.title)}"></div>
    <div class="form-group"><label class="form-label">Milestones (1 to ${MAX_MILESTONES})</label>${ms}
      ${f.milestones.length < MAX_MILESTONES ? '<button type="button" class="btn btn-ghost btn-sm" data-es-add="1">+ Add milestone</button>' : ''}</div>
    <div class="form-group"><label class="form-label">Auto-release after (days)</label><input class="form-input" data-es-f="days" inputmode="numeric" value="${esc(f.days)}"><div style="font-size:11px;color:var(--text2);margin-top:6px">After the auto-release delay, anyone can release the payment to the freelancer. The client can still dispute before that.</div></div>
    <div class="info-box"><div class="info-row"><span class="k">Milestones</span><span class="v">${f.milestones.length}</span></div>
      <div class="info-row"><span class="k">Total you deposit</span><span class="v yellow">${money(total, f.token)}</span></div>
      <div class="info-row"><span class="k">Auto-release</span><span class="v">${esc(f.days)} days after delivery</span></div></div>
    ${errs.length && (f.freelancer || f.title) ? `<div style="font-size:11px;color:var(--text2);margin-top:8px">${esc(errs[0])}</div>` : ''}
    ${msgHtml()}
    <button type="button" class="tx-btn tx-btn-yellow" data-es-create="1" style="margin-top:14px" ${es.busy ? 'disabled' : ''}>${!WalletState.connected() ? 'Connect Wallet' : es.busy ? '<div class="spinner"></div> Working…' : `Approve ${f.token}, then deposit`}</button></div>`;
}

function timelineStep(state, n, title, detail) {
  return `<div class="tracker-step ${state}"><div class="tracker-step-dot">${state === 'done' ? '✓' : n}</div><div><div style="font-size:13px;font-weight:700">${title}</div><div style="font-size:11px;color:var(--text2)">${detail || ''}</div></div></div>`;
}

function detailHtml() {
  if (es.detailErr) return `<div class="card animate" style="max-width:640px;margin:0 auto;width:100%">${errorState(es.detailErr, `window.ALEscrow.open('${esc(es.detailId)}')`)}<button type="button" class="btn btn-ghost btn-sm" data-es-back="1" style="margin-top:12px">Back</button></div>`;
  const e = es.detail;
  if (!e) return `<div class="card animate" style="max-width:640px;margin:0 auto;width:100%">${loadingState('Loading escrow…')}</div>`;
  const sym = tokenSymbol(e.token); const now = Math.floor(Date.now() / 1000);
  const isClient = me() && me().toLowerCase() === e.client.toLowerCase();
  const isFreelancer = me() && me().toLowerCase() === e.freelancer.toLowerCase();
  const ms = e.milestones.map((m, i) => {
    const at = (t) => (t ? new Date(t * 1000).toLocaleString() : '');
    const disputed = m.status === 4;
    const auto = m.status === 1 && now >= m.deliveredAt + e.autoReleaseDays * DAY;
    const autoIn = m.status === 1 && !auto ? Math.max(1, Math.ceil((m.deliveredAt + e.autoReleaseDays * DAY - now) / DAY)) : 0;
    const timeline = [
      timelineStep('done', 1, 'Funded', at(e.createdAt)),
      timelineStep(m.status >= 1 && !(disputed && !m.deliveredAt) ? 'done' : 'active', 2, 'Delivered', m.deliveredAt ? `${at(m.deliveredAt)}${m.deliveryNote ? '<br>Note: ' + esc(m.deliveryNote) : ''}` : 'Waiting for the freelancer'),
      timelineStep(m.status >= 2 && m.status !== 4 ? 'done' : m.status === 1 ? 'active' : 'pending', 3, 'Approved', m.approvedAt ? at(m.approvedAt) : autoIn ? `Anyone can release after the auto-release delay (about ${autoIn} day${autoIn > 1 ? 's' : ''}). The client can still dispute before that.` : ''),
      timelineStep(m.status === 3 ? 'done' : m.status === 2 || auto ? 'active' : 'pending', 4, 'Released', m.releasedAt ? at(m.releasedAt) : auto ? 'After the auto-release delay, anyone can release the payment to the freelancer. The client can still dispute before that.' : ''),
    ].join('');
    const btn = (label, attr, cls = 'btn-primary') => `<button type="button" class="btn btn-sm ${cls}" ${attr} ${es.busy ? 'disabled' : ''}>${label}</button>`;
    let actions = '';
    if (m.status === 0 && isFreelancer) actions = `<input class="form-input" id="es-note-${i}" placeholder="Delivery note or link" maxlength="300" style="margin-bottom:8px">${btn('Mark delivered', `data-es-deliver="${i}"`)}`;
    // The contract only lets the client release an Approved milestone, or any Delivered one once auto-release time is reached.
    if (isClient && m.status === 1) actions = `${btn('Approve', `data-es-approve="${i}"`)} ${auto ? btn('Release (auto-release reached)', `data-es-release="${i}"`, 'btn-ghost') + ' ' : ''}${btn('Dispute', `data-es-dispute="${i}"`, 'btn-ghost')}`;
    else if (isClient && m.status === 2) actions = `${btn('Release payment', `data-es-release="${i}"`)} ${btn('Dispute', `data-es-dispute="${i}"`, 'btn-ghost')}`;
    else if (isClient && m.status === 0) actions = btn('Dispute', `data-es-dispute="${i}"`, 'btn-ghost');
    else if (auto && !isClient) actions = btn('Release (auto-release reached)', `data-es-release="${i}"`);
    return `<div style="border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:13px;font-weight:700">Milestone ${i + 1}: ${esc(m.description)}</div><div style="display:flex;align-items:center;gap:8px"><b>${money(m.amount, sym)}</b>${statusBadge(m.status === 3 ? 'ok' : m.status === 4 ? 'fail' : 'pending', MILESTONE_STATUS[m.status] || '?')}</div></div>
      ${timeline}${actions ? `<div style="margin-top:10px">${actions}</div>` : ''}${actions.includes('data-es-dispute') ? `<div style="font-size:11px;color:var(--text2);margin-top:8px;line-height:1.5">Disputes are decided by a single arbiter address. This is a test deployment.</div>` : ''}</div>`;
  }).join('');
  return `<div class="card animate" style="max-width:700px;margin:0 auto;width:100%">
    <div class="section-header"><div class="section-title">${esc(e.title)}</div><button type="button" class="btn btn-ghost btn-sm" data-es-back="1">Back</button></div>
    <div class="info-box" style="margin-bottom:14px"><div class="info-row"><span class="k">Client</span><span class="v">${shortAddress(e.client)}${isClient ? ' (you)' : ''}</span></div>
      <div class="info-row"><span class="k">Freelancer</span><span class="v">${shortAddress(e.freelancer)}${isFreelancer ? ' (you)' : ''}</span></div>
      <div class="info-row"><span class="k">Total</span><span class="v yellow">${money(e.totalAmount, sym)}</span></div>
      <div class="info-row"><span class="k">Released</span><span class="v green">${money(e.releasedAmount, sym)}</span></div>
      <div class="info-row"><span class="k">Auto-release</span><span class="v">${e.autoReleaseDays} days after delivery</span></div></div>
    ${ms}${msgHtml()}</div>`;
}

function render() {
  const root = $('escrow-root');
  if (!root) return;
  if (es.deployed === false || !ESCROW_ADDRESS) { root.innerHTML = notDeployed(); return; }
  root.innerHTML = es.view === 'create' ? formHtml() : es.view === 'detail' ? detailHtml() : listHtml();
}

let bound = false;
function bind() {
  const root = $('escrow-root');
  if (!root || bound) return;
  bound = true;
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button,[data-es-open]');
    if (!t) return;
    const d = t.dataset;
    if (d.esTab) { es.tab = d.esTab; es.view = 'list'; es.list = null; setMsgQuiet(''); loadList(); }
    else if (d.esFilter) { es.filter = d.esFilter; render(); }
    else if (d.esNew) { if (!WalletState.connected()) { WalletManager.openModal(); return; } es.view = 'create'; setMsgQuiet(''); render(); }
    else if (d.esBack) { es.view = 'list'; setMsgQuiet(''); loadList(); }
    else if (d.esOpen) openDetail(d.esOpen);
    else if (d.esToken) { es.form.token = d.esToken; render(); }
    else if (d.esAdd) { if (es.form.milestones.length < MAX_MILESTONES) es.form.milestones.push({ amount: '', description: '' }); render(); }
    else if (d.esRm) { es.form.milestones.splice(Number(d.esRm), 1); render(); }
    else if (d.esCreate) { if (!WalletState.connected()) WalletManager.openModal(); else createEscrowFlow(); }
    else if (d.esDeliver !== undefined) submitMilestoneAction('markDelivered', Number(d.esDeliver), [($(`es-note-${d.esDeliver}`)?.value || '').trim()], 'Marked as delivered.');
    else if (d.esApprove !== undefined) submitMilestoneAction('approveMilestone', Number(d.esApprove), [], 'Milestone approved.');
    else if (d.esRelease !== undefined) submitMilestoneAction('releaseMilestone', Number(d.esRelease), [], 'Payment released to the freelancer.');
    else if (d.esDispute !== undefined) { const reason = window.prompt('Why are you opening a dispute?'); if (reason && reason.trim()) submitMilestoneAction('disputeMilestone', Number(d.esDispute), [reason.trim()], 'Dispute opened.'); }
  });
  root.addEventListener('input', (e) => {
    const t = e.target; const d = t.dataset;
    if (d.esF) { es.form[d.esF] = t.value; softRender(t); }
    else if (d.esM !== undefined) { es.form.milestones[Number(d.esM)][d.k] = t.value; softRender(t); }
  });
}

// Re-render the summary without losing input focus
function softRender(input) {
  const key = input.dataset.esF ? `f:${input.dataset.esF}` : `m:${input.dataset.esM}:${input.dataset.k}`;
  const pos = input.selectionStart;
  render();
  const sel = input.dataset.esF ? `[data-es-f="${input.dataset.esF}"]` : `[data-es-m="${input.dataset.esM}"][data-k="${input.dataset.k}"]`;
  const next = document.querySelector(`#escrow-root ${sel}`);
  if (next) { next.focus(); try { next.setSelectionRange(pos, pos); } catch { /* not a text input */ } }
  void key;
}

window.ALEscrow = { reload: () => loadList(), open: (id) => openDetail(id) };
window.AL_pages = window.AL_pages || {};
window.AL_pages.escrow = async () => { if (await checkDeployed()) { if (es.view === 'list') loadList(); else if (es.view === 'detail' && es.detailId !== null) openDetail(es.detailId); else render(); } else render(); };
document.addEventListener('DOMContentLoaded', () => { if ($('escrow-root')) { bind(); render(); } });

publish({});
