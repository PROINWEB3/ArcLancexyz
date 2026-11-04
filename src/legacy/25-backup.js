// Backup and restore for the data ArcLance keeps only in this browser: invoices and usernames.
// Export writes a JSON file. Import checks the file first, asks before changing anything, and only ever
// ADDS what is missing (see src/lib/backup.ts). Nothing already saved is overwritten or removed.
import { buildBackup, parseBackup, planImport, MAX_BACKUP_BYTES } from '../lib/backup';

const $ = (id) => document.getElementById(id);
const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || ''); return v ?? fallback; } catch { return fallback; } };

function currentData() {
  return { invoices: WalletState.getInvoices(), usernames: readJson('arclance_usernames', {}), myUsername: localStorage.getItem('arclance_my_username') };
}

function status(text, kind = 'info') {
  const el = $('backup-status'); if (!el) return;
  el.style.display = text ? 'block' : 'none';
  el.style.color = kind === 'error' ? 'var(--red)' : kind === 'ok' ? 'var(--green)' : 'var(--text2)';
  el.textContent = text;
}

function exportBackup() {
  const d = currentData();
  const backup = buildBackup(d.invoices, d.usernames, d.myUsername);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `arclance-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(`Exported ${d.invoices.length} invoice(s) and ${Object.keys(d.usernames).length} username(s). Keep the file somewhere safe.`, 'ok');
}

function importFile(file) {
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) { status('The file is too large to be an ArcLance backup.', 'error'); return; }
  const reader = new FileReader();
  reader.onerror = () => status('The file could not be read.', 'error');
  reader.onload = () => {
    const parsed = parseBackup(String(reader.result));
    if (!parsed.ok) { status(parsed.error + ' Nothing was changed.', 'error'); return; }
    const cur = currentData();
    const plan = planImport(cur, parsed.backup);
    const names = Object.keys(plan.newUsernames);
    if (!plan.newInvoices.length && !names.length) { status('Nothing new to import: everything in the file is already saved here.'); return; }
    const ok = window.confirm(
      `Import ${plan.newInvoices.length} invoice(s) and ${names.length} username(s) into this browser?\n\n` +
      'Nothing already saved is changed or removed. ' +
      `${plan.duplicateInvoices} invoice(s) already here and ${plan.conflictingUsernames.length} username(s) with a different address will be skipped.`);
    if (!ok) { status('Import cancelled. Nothing was changed.'); return; }
    if (plan.newInvoices.length) WalletState.importInvoices(plan.newInvoices);
    if (names.length) localStorage.setItem('arclance_usernames', JSON.stringify({ ...cur.usernames, ...plan.newUsernames }));
    if (plan.setMyUsername) localStorage.setItem('arclance_my_username', plan.setMyUsername);
    if (typeof window.updateUsernameUI === 'function') window.updateUsernameUI();
    status(`Imported ${plan.newInvoices.length} invoice(s) and ${names.length} username(s).`, 'ok');
    if (typeof showToast === 'function') showToast('Backup imported');
  };
  reader.readAsText(file);
}

function build() {
  const page = $('page-invoices');
  if (!page || $('backup-card')) return;
  const card = document.createElement('div');
  card.className = 'card'; card.id = 'backup-card'; card.style.padding = '16px 20px';
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between">
      <div style="min-width:220px;flex:1">
        <div style="font-size:14px;font-weight:700;margin-bottom:2px">Backup</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.5">Your invoices are stored only in this browser. Export a backup regularly.</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost btn-sm" id="backup-export">Export backup</button>
        <button type="button" class="btn btn-ghost btn-sm" id="backup-import">Import backup</button>
        <input type="file" id="backup-file" accept="application/json,.json" hidden>
      </div>
    </div>
    <div id="backup-status" role="status" style="display:none;margin-top:10px;font-size:12px;line-height:1.5"></div>`;
  page.insertAdjacentElement('afterbegin', card);
  $('backup-export').addEventListener('click', exportBackup);
  $('backup-import').addEventListener('click', () => $('backup-file').click());
  $('backup-file').addEventListener('change', (e) => { importFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  // usernames are part of the same backup
  const tab = $('tab-username');
  if (tab && !$('username-backup-note')) {
    const note = document.createElement('div');
    note.id = 'username-backup-note'; note.style.cssText = 'font-size:12px;color:var(--text2);margin-bottom:12px;line-height:1.5';
    note.textContent = 'Usernames are stored only in this browser. They are included in the backup on the Invoices page.';
    tab.insertAdjacentElement('afterbegin', note);
  }
}

document.addEventListener('DOMContentLoaded', build);
