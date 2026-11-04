// Accuracy of claims: the page text patches match index.html, and the old wording is gone after they run.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const P = await import(pathToFileURL(path.join(ROOT, 'src/legacy/content-patches.js')).href);

const windows = [];
after(() => windows.forEach((w) => w.close()));
function page() {
  const dom = new JSDOM(html, { url: 'https://localhost/' });
  windows.push(dom.window);
  globalThis.document = dom.window.document;
  globalThis.NodeFilter = dom.window.NodeFilter;
  return dom.window;
}
const bodyText = (w) => w.document.body.textContent.replace(/\s+/g, ' ');

test('every text patch still matches the text in index.html (no stale entries)', () => {
  const w = page();
  const nodes = [];
  const tw = w.document.createTreeWalker(w.document.body, w.NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) nodes.push(tw.currentNode.nodeValue);
  for (const [find] of P.TEXT_PATCHES) assert.ok(nodes.some((v) => v.includes(find)), `no longer in index.html: ${find.slice(0, 70)}`);
  for (const [label] of P.SIBLING_PATCHES) assert.ok(nodes.some((v) => v.trim() === label) || P.TEXT_PATCHES.some(([, to]) => to === label), `label missing: ${label}`);
});

test('after the patches, the unverified claims are gone and the accurate wording is in', () => {
  const w = page();
  const n = P.applyContentPatches(w.document.body);
  assert.ok(n > 20, 'patches applied: ' + n);
  const t = bodyText(w);
  for (const bad of ["can't use PayPal or Payoneer", 'USD exactly', '$1.00 USD always', '~15 min', 'significantly faster', 'Millions of talented', 'charges 2–3% fees', '$25–$45', 'Includes line items, tax field', 'Platform fee (ArcLance cut)', 'automatically every 30 days', 'Schedule automatic', 'SCHEDULE PAYMENT', 'No recurring payments scheduled', 'one-time setup, ~15 minutes'])
    assert.ok(!t.includes(bad), 'still says: ' + bad);
  for (const good of ['high fees, slow KYC, or limited access to PayPal/Payoneer', 'USDC is designed to track $1 USD', 'Varies by route', 'a reminder, not automatic payment', 'SAVE REMINDER', 'There is no tax field', 'it does not lock funds', 'approximate, varies by region and plan', 'not legal, tax or financial advice'])
    assert.ok(t.includes(good), 'missing: ' + good);
  // the platform fee rows (Send form and Docs Fees table) say what is true
  const rows = [...w.document.querySelectorAll('span,div')].filter((e) => /^(Platform Fee|ArcLance platform fee)$/.test(e.textContent.trim()) && e.nextElementSibling);
  assert.ok(rows.length >= 2, 'platform fee rows: ' + rows.length);
  for (const r of rows) assert.equal(r.nextElementSibling.textContent, 'None on testnet');
});

test('nothing in the page text suggests payments are sent automatically', () => {
  const w = page();
  P.applyContentPatches(w.document.body);
  const t = bodyText(w);
  const hits = [...t.matchAll(/[^.]{0,60}(auto-?pay|automatic(ally)? (payment|pay|debit|charge)|pay [^.]{0,40}automatically)[^.]{0,60}/gi)].map((m) => m[0].trim());
  for (const h of hits) assert.match(h, /not (send|automatic)|does not|no automatic|reminder/i, 'suggests auto-pay: ' + h);
});

test('assistant text and invoice PDF text carry the same corrections', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const legacy = read('src/legacy/11-ai-assistant.js');
  for (const bad of ['4.4%', 'Payoneer charges 2%', 'ArcLance is instant', 'solves this', '~15 minutes', 'fully pegged', 'arrives instantly', 'sent instantly']) assert.ok(!legacy.includes(bad), 'assistant still says: ' + bad);
  const inv = read('src/legacy/13-toast-invoice.js');
  for (const bad of ['~2 sec Settlement', '~0.12 USDC Gas Fee', '0% Platform Fee']) assert.ok(!inv.includes(bad), 'invoice still says: ' + bad);
  const rec = read('src/legacy/18-receipts-recurring.js');
  assert.ok(!/Scheduled \$\{frequency\} payment/.test(rec) && !rec.includes('No recurring payments scheduled yet'));
  const kn = read('src/assistant/knowledge.ts');
  assert.ok(!/about a few minutes|no vault that can be drained/.test(kn));
});
