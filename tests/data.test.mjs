// Browser-only data: due dates (real dates and older free text) and the backup file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(ROOT, 'node_modules/.cache/data-test'); fs.mkdirSync(tmp, { recursive: true });
const load = async (entry, name) => { const out = path.join(tmp, name + '.mjs'); await build({ entryPoints: [path.join(ROOT, entry)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent', platform: 'node', packages: 'external' }); return import(pathToFileURL(out).href + '?v=' + Date.now()); };
const D = await load('src/lib/invoice-due.ts', 'due');
const B = await load('src/lib/backup.ts', 'backup');
const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const NOW = new Date(2026, 10, 15, 12, 0, 0); // 15 Nov 2026, local noon
const inv = (over = {}) => ({ id: 1, createdAt: '2026-11-01T10:00:00.000Z', client: 'Acme', number: 'INV-1', amount: '100', status: 'pending', ...over });

// ── due dates ──
test('a real date (YYYY-MM-DD) is due until the end of that day', () => {
  const due = D.parseDue('2026-11-15');
  assert.equal(due.getFullYear(), 2026); assert.equal(due.getMonth(), 10); assert.equal(due.getDate(), 15);
  assert.equal(due.getHours(), 23);
  assert.equal(D.effectiveStatus(inv({ due: '2026-11-15' }), NOW), 'pending', 'still on time on the due day');
  assert.equal(D.effectiveStatus(inv({ due: '2026-11-14' }), NOW), 'overdue');
  assert.equal(D.effectiveStatus(inv({ due: '2026-12-01' }), NOW), 'pending');
  assert.equal(D.parseDue('2026-02-31'), null, 'a day that does not exist is not a date');
});

test('older free-text due dates keep working and never throw', () => {
  assert.equal(D.effectiveStatus(inv({ due: '7 days' }), NOW), 'overdue', '7 days after 1 Nov has passed');
  assert.equal(D.effectiveStatus(inv({ due: '30 days' }), NOW), 'pending');
  assert.equal(D.effectiveStatus(inv({ due: '10 Nov 2026' }), NOW), 'overdue');
  assert.equal(D.effectiveStatus(inv({ due: '30 Dec 2026' }), NOW), 'pending');
  for (const odd of ['On receipt', 'asap', 'next friday', '31/12/2026', '', undefined, '   ']) {
    assert.equal(D.effectiveStatus(inv({ due: odd }), NOW), 'pending', String(odd));
  }
  assert.equal(D.parseDue('7 days', undefined), null, 'relative text needs the creation date');
  assert.equal(D.formatDue('On receipt'), 'On receipt');
  assert.equal(D.formatDue('7 days'), '7 days');
});

test('paid and other statuses are never turned into overdue', () => {
  assert.equal(D.effectiveStatus(inv({ status: 'paid', due: '2020-01-01' }), NOW), 'paid');
  assert.equal(D.effectiveStatus(inv({ status: 'overdue' }), NOW), 'overdue');
  assert.match(D.formatDue('2026-12-30'), /2026/);
});

// ── backup file ──
test('a backup round-trips and keeps only known fields', () => {
  const data = B.buildBackup([inv({ due: '2026-12-30', walletAddr: ADDR, desc: 'Logo' })], { ali: ADDR }, 'ali', NOW);
  const res = B.parseBackup(JSON.stringify(data));
  assert.ok(res.ok, res.error);
  assert.equal(res.backup.invoices[0].number, 'INV-1');
  assert.equal(res.backup.invoices[0].walletAddr, ADDR);
  assert.deepEqual(res.backup.usernames, { ali: ADDR });
  assert.equal(res.backup.myUsername, 'ali');
  const extra = B.parseBackup(JSON.stringify({ ...data, invoices: [{ ...inv(), evil: '<img onerror=x>', __proto__x: 1 }] }));
  assert.ok(extra.ok); assert.equal(extra.backup.invoices[0].evil, undefined, 'unknown fields are dropped');
});

test('a bad file is refused with a clear reason and nothing else happens', () => {
  const good = B.buildBackup([inv()], {}, null, NOW);
  const bad = (mutate, re) => { const d = JSON.parse(JSON.stringify(good)); mutate(d); const r = B.parseBackup(JSON.stringify(d)); assert.equal(r.ok, false); assert.match(r.error, re); };
  assert.match(B.parseBackup('').error, /empty/);
  assert.match(B.parseBackup('{not json').error, /not a JSON file/);
  assert.match(B.parseBackup('[]').error, /not an ArcLance backup/);
  assert.match(B.parseBackup('x'.repeat(B.MAX_BACKUP_BYTES + 1)).error, /too large/);
  bad((d) => { d.app = 'other'; }, /not an ArcLance backup/);
  bad((d) => { d.version = 2; }, /version/);
  bad((d) => { d.invoices = 'nope'; }, /invoice list/);
  bad((d) => { d.invoices[0].number = ''; }, /number and a client/);
  bad((d) => { d.invoices[0].amount = 'abc'; }, /invalid amount/);
  bad((d) => { d.invoices[0].amount = -5; }, /invalid amount/);
  bad((d) => { d.invoices[0].status = 'weird'; }, /unknown status/);
  bad((d) => { d.invoices[0].walletAddr = '0x123'; }, /wallet address/);
  bad((d) => { d.invoices[0].desc = 'x'.repeat(6000); }, /invalid "desc"/);
  bad((d) => { d.usernames = { 'Bad Name!': ADDR }; }, /not valid/);
  bad((d) => { d.usernames = { ali: '0x12' }; }, /invalid address/);
  bad((d) => { d.myUsername = 'A'; }, /own username/);
});

test('text from a file cannot inject markup into the invoice list', () => {
  const d = B.buildBackup([inv({ client: '<script>alert(1)</script>', desc: 'a > b' })], {}, null, NOW);
  const r = B.parseBackup(JSON.stringify(d));
  assert.ok(r.ok);
  assert.equal(r.backup.invoices[0].client, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(r.backup.invoices[0].desc, 'a &gt; b');
  assert.equal(B.parseBackup(JSON.stringify(B.buildBackup(r.backup.invoices, {}, null, NOW))).backup.invoices[0].client, r.backup.invoices[0].client, 'exporting and importing again does not escape twice');
});

test('importing only adds: duplicates, username conflicts and an existing own username are left alone', () => {
  const other = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  const backup = B.parseBackup(JSON.stringify(B.buildBackup([inv(), inv({ number: 'INV-2', id: 2 })], { ali: ADDR, bob: ADDR, sam: other }, 'sam', NOW))).backup;
  const plan = B.planImport({ invoices: [inv()], usernames: { ali: ADDR, bob: other }, myUsername: null }, backup);
  assert.deepEqual(plan.newInvoices.map((i) => i.number), ['INV-2']);
  assert.equal(plan.duplicateInvoices, 1);
  assert.deepEqual(Object.keys(plan.newUsernames), ['sam']);
  assert.deepEqual(plan.conflictingUsernames, ['bob'], 'bob already points to another address: not overwritten');
  assert.equal(plan.setMyUsername, 'sam');
  assert.equal(B.planImport({ invoices: [], usernames: {}, myUsername: 'mine' }, backup).setMyUsername, null, 'an existing own username is kept');
});
