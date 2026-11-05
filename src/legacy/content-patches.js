// Text corrections for the static page text in index.html.
//
// index.html is not edited in this phase, so wording that must change is listed here and applied to
// the page text when the app starts. Each entry is [exact old text, new text]. When the same wording is
// later changed in index.html itself, the entry simply stops matching and does nothing.
// tests/content.test.mjs checks that every entry still matches index.html (or has been applied).

/** Replace this text anywhere in a text node. */
export const TEXT_PATCHES = [
  // ── Accuracy of claims ──
  ["A payment page for freelancers who can't use PayPal or Payoneer.", 'A payment page for freelancers facing high fees, slow KYC, or limited access to PayPal/Payoneer.'],
  ['vs 4.4% PayPal fee', 'vs ~4.4% PayPal fee (approximate, varies by region and plan)'],
  ['freelancers in countries where traditional payment services like PayPal, Payoneer, and Stripe are restricted or unavailable', 'freelancers who face high fees, slow KYC, or limited access to services like PayPal, Payoneer, and Stripe'],
  ['is unavailable or heavily restricted in Pakistan, Bangladesh, and many African countries', 'can be limited or unavailable in some countries and for some accounts'],
  ['charges 2–3% fees and requires lengthy KYC verification', 'has fees (approximate, varies by region and plan) and its KYC can be slow'],
  ['take 3–5 days and cost $25–$45 per transaction', 'are often slow and carry bank fees (approximate, varies by bank and route)'],
  ['1 USDC = $1.00 USD always.', 'USDC is designed to track $1 USD.'],
  ['Platform fee (ArcLance cut)', 'ArcLance platform fee'],
  // ── Bridge time: no number we cannot verify ──
  ['~15 min', 'Varies by route'],
  ['CCTP attestation process — significantly faster than legacy bridges', 'Transfer time varies by route. Follow the explorer links on the Bridge page for the status.'],
  ['(one-time setup, ~15 minutes)', '(one-time setup)'],
  // ── Recurring payments: reminders only ──
  ['Schedule automatic or recurring stablecoin payments on Arc Network.', 'Save reminders for recurring payments. A reminder only: ArcLance does not send payments automatically.'],
  ['SCHEDULE PAYMENT', 'SAVE REMINDER'],
  ['Scheduled Payments', 'Saved Reminders'],
  ['No recurring payments scheduled yet', 'No reminders saved yet'],
  ['RECURRING', 'REMINDERS'],
  ['Recurring Payments', 'Payment Reminders'],
  ['Schedule automatic stablecoin payments on a weekly or monthly basis.', 'Save a reminder for a weekly or monthly payment. ArcLance shows the reminder when it is due. It is a reminder, not automatic payment: you send each payment yourself.'],
  ['— pay your virtual assistant or employee automatically every 30 days', '— get a reminder to pay your assistant or employee every 30 days'],
  ['— pay multiple contractors on a fixed schedule', '— get a reminder when each contractor is due'],
  // ── Invoice PDF docs: what the form really has ──
  ['Includes line items, tax field, local currencies, and wallet address.', 'Includes local currency amounts and your wallet address. If the description has several lines, each line is listed as an item and the amount is shown split equally across them. There is no tax field.'],
  // ── Cash-out text ──
  ['Rules on crypto differ by country. Check your local regulations. This is not financial advice.', 'Rules, taxes and legality of crypto and of cashing out depend on your country and can change. Check your local rules and ask a qualified adviser. This is not legal, tax or financial advice.'],
  // ── Removed simulated flows: the old sentences pointed at Buy USDC by card; the multi-chain card no longer claims cross-chain payments ──
  [', or can buy USDC by card through the Buy USDC option.', '. On testnet they can get free test USDC from the Faucet page.'],
  ['Aggregated cross-chain liquidity via Circle Gateway. Clients can pay you from any chain (Ethereum, Base, Arc) — you always receive unified native USDC directly on Arc Testnet.', 'Your testnet USDC balance on each network, read from the chain. This view is read-only: use the Bridge to move USDC to Arc Testnet.'],
  ['CIRCLE GATEWAY · UNIFIED BALANCE KIT', 'BALANCES ON OTHER NETWORKS'],
  ['Unified USDC', 'Read-only'],
  ['Circle Gateway Route', 'Read from the chain'],
  ['Gateway Route', 'Testnet'],
  // ── Escrow tag ──
  ['Until a release or an arbiter decision, the money stays in the contract.', 'Until a release or an arbiter decision, the money stays in the contract. The Escrow tag on an invoice is only a label saved in this browser: it does not lock funds. To lock funds, create an escrow on the Escrow page.'],
];

/** Text node equal to the label: set the text of the element right after it. */
export const SIBLING_PATCHES = [
  ['Platform Fee', 'None on testnet'],
  ['ArcLance platform fee', 'None on testnet'],
];


/** Add a small element once (matched by id). position is an insertAdjacentHTML position. */
export const INSERTS = [
  { id: 'link-note-invoice', selector: '#inv-link-text', position: 'afterend', html: '<div style="font-size:11px;color:var(--text2);margin-top:8px;line-height:1.5">Share the wallet-address link so anyone can open it.</div>' },
  { id: 'link-note-paylink', selector: '#main-pay-link-display', position: 'afterend', html: '<div style="font-size:12px;color:var(--text2);margin:-8px 0 16px;line-height:1.5">Share the wallet-address link so anyone can open it.</div>' },
];

/** Features that were simulations (fake transaction hash and balance) and were removed: hide any leftover markup. */
export const REMOVALS = ['#topbarBuyUsdcBtn', '#buyUsdcModal', '#crossChainPayModal', '[onclick*="openCrossChainPayModal"]'];

/** Make a text input a date picker (the due date is stored as a real date, YYYY-MM-DD). */
export const INPUT_TYPE_PATCHES = [
  ['#inv-due', 'date'],
];

/** Set an attribute on the elements matching a selector. */
export const ATTR_PATCHES = [];

function textNodes(root) {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && !/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  while (walker.nextNode()) out.push(walker.currentNode);
  return out;
}

/** Apply every patch under root. Returns how many replacements were made. */
export function applyContentPatches(root = document.body) {
  let n = 0;
  for (const sel of REMOVALS) root.querySelectorAll(sel).forEach((el) => { el.remove(); n++; });
  for (const node of textNodes(root)) {
    let v = node.nodeValue;
    for (const [find, replace] of TEXT_PATCHES) {
      if (v.includes(find)) { v = v.split(find).join(replace); n++; }
    }
    if (v !== node.nodeValue) node.nodeValue = v;
  }
  for (const node of textNodes(root)) {
    const label = node.nodeValue.trim();
    for (const [find, value] of SIBLING_PATCHES) {
      const target = node.parentElement && node.parentElement.nextElementSibling;
      if (label === find && target) { target.textContent = value; n++; }
    }
  }
  for (const ins of INSERTS) {
    const host = root.querySelector ? root.querySelector(ins.selector) : null;
    if (host && !root.querySelector(`[data-insert-id="${ins.id}"]`)) {
      host.insertAdjacentHTML(ins.position, ins.html.replace('<div ', `<div data-insert-id="${ins.id}" `));
      n++;
    }
  }
  for (const [sel, type] of INPUT_TYPE_PATCHES) root.querySelectorAll(sel).forEach((el) => { if (el.type !== type) { el.type = type; el.removeAttribute('placeholder'); n++; } });
  for (const [sel, attr, value] of ATTR_PATCHES) root.querySelectorAll(sel).forEach((el) => { if (el.getAttribute(attr) !== value) { el.setAttribute(attr, value); n++; } });
  return n;
}
