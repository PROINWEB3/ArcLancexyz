# Testnet quality fixes: change report

Scope: ArcLance on Arc Testnet only. No mainnet, backend, accounts or new contracts. `index.html` was **not edited** (see "How page text was fixed").

Result: `bun run check` clean, `bun run build` succeeds, 145 tests (144 passed, 1 skipped: the live Circle check that only runs when asked).

## How page text was fixed without editing index.html

Most of the text you listed lives in `index.html` (hero, docs, FAQ, nav). Because that file is off limits, the corrections are applied when the page loads:

- `src/legacy/content-patches.js` holds the list: text replacements (`TEXT_PATCHES`, line 9), label-and-value rows (`SIBLING_PATCHES`, line 46), small inserted notes (`INSERTS`, line 55), the date-picker change (`INPUT_TYPE_PATCHES`, line 63) and the code that applies them (`applyContentPatches`, line 82).
- `src/legacy/24-content.js` runs it once the page is ready.
- `tests/content.test.mjs` checks that every replacement still matches a real piece of text in `index.html` (so a stale entry fails the test) and that the old claims are gone afterwards.
- Side effect: the old wording is in the raw HTML for a split second before the script runs, and in the `<head>` meta tags (see Group 5). If you later allow editing `index.html`, the same corrections can be pasted in and this file deleted.

## Group 1: accuracy of claims

| Item | Where (file:line) |
|---|---|
| 1 PayPal/Payoneer: hero line, docs intro, problem list, "Millions" claim, 2-3% and SWIFT figures labelled "approximate, varies by region and plan"; "vs 4.4% PayPal fee" labelled approximate | `content-patches.js` (TEXT_PATCHES); legacy guide `11-ai-assistant.js` country guides |
| 2 "1 USDC = $1.00 exactly, always" becomes "USDC is designed to track $1 USD" | `content-patches.js`; `11-ai-assistant.js:27` |
| 3 Fee wording: "ArcLance platform fee: None on testnet" (Send form and Docs table), docs line "No ArcLance platform fee on testnet; network fees apply. Mainnet pricing to be announced." | `content-patches.js` (SIBLING_PATCHES, TEXT_PATCHES); invoice PDF `13-toast-invoice.js:335-336,360` |
| 4 Bridge time: no number. Docs rows and card say "Varies by route"; Bridge page row says "Varies by route. Follow the explorer links."; slow-network warning is qualitative | `content-patches.js`; `09-bridge.js:461,511,534`; `knowledge.ts:154`; translated lines in `lang-ur/hi/bn/pcm.ts`; `11-ai-assistant.js:70` |
| 5 Recurring payments: the code only saves a reminder and shows a toast when due. Everything now says "reminder, not automatic payment" (tab, button, heading, docs, toasts) | `content-patches.js`; `18-receipts-recurring.js:153,167,177,211` |
| 6 Docs: invoice PDF docs no longer claim a tax field (there is none; each description line is listed as an item with the amount split equally, now stated). Escrow and P2P docs sections already existed; added "the Escrow tag does not lock funds" to the Escrow docs | `content-patches.js`; PDF rows `13-toast-invoice.js:335` ("Tax (not applied)"), chips at `:360` |

The assistant's built-in answers (`knowledge.ts`, `lang-*.ts`) and the older guide (`11-ai-assistant.js`) carry the same corrections. Only text strings were edited, no assistant logic.

## Group 2: testnet labels

- 7 "Testnet demo - no real money." note inserted at the top of the **Buy USDC by card** and **Pay from Any Chain** windows, plus a tooltip on the Buy USDC button (`content-patches.js` INSERTS and ATTR_PATCHES). The note also says these are simulations (see "Found, not fixed").
- 8 Escrow contract not set: "Testnet: not deployed yet" (`23-site.js:84`).
- 9 Rates: with no rate (loading or failed) the currency chips hide and the note under them says "Rate unavailable right now" (`23-site.js:57-77`, class `.rate-hidden` in `arclance.css`); invoice PDF shows the same text (`13-toast-invoice.js:172-175`).

## Group 3: data safety

- 10 Backup: Export and Import for invoices and usernames (JSON). New `src/lib/backup.ts` (validation, 161 lines), `src/legacy/25-backup.js` (card on the Invoices page with the warning "Your invoices are stored only in this browser. Export a backup regularly."), `WalletState.importInvoices` (`03-wallet-state.js:326`). Import checks the file, asks before changing anything, only adds what is missing, skips duplicates and username conflicts, and escapes `<` and `>` in imported text. A note about usernames sits in the Username tab.
- 11 Due date: the field becomes a date picker (stored as YYYY-MM-DD). `src/lib/invoice-due.ts` computes Overdue: a pending invoice past its due date counts as overdue in the list and in the stats (`03-wallet-state.js:5,319`, `04-ui-sync.js:7,323`). Older free-text dates ("7 days", "30 Dec 2026") still work; "On receipt" or unreadable text is never overdue. Saved data is not rewritten. The list now shows "Due: ...".
- Also: the username toasts no longer claim "Registering username on Arc Testnet" (`16-rates-username.js:138`); they say it is saved in this browser and not recorded on-chain.

## Group 4: trust pages and navigation

- 12 Footer: Docs, Terms, Privacy, About, Contact, Arcscan, GitHub (repo link), X (`23-site.js:40`). New pages: Terms, Privacy, About, Contact (`src/legacy/info-pages.js`, built by `26-pages.js`). Terms and Privacy state: testnet demo, non-custodial, no real funds, data stored in the browser, and USDC issuer risk including Circle blacklisting.
- 13 "How to pay an ArcLance invoice": five steps (wallet, faucet, open the link, check address and network, connect and pay).
- 14 Cash-out text: "Rules, taxes and legality ... depend on your country and can change ... not legal, tax or financial advice." (`content-patches.js`).
- 15 "Roadmap (planned, no dates)": mainnet, saved data across devices, real on-chain escrow for invoices, local cash-out guides, each marked "Not available".
- 16 Sidebar: Home, Receive, Invoices and Pay Link stay visible; Send & History, Swap, Bridge, Escrow, P2P, AI, Faucet, Docs, How to pay an invoice, Roadmap and About sit under **More** (`27-nav.js`, `12-navigation.js:192,223`). The handlers are moved, not rewritten. Every page is still reachable (tested).

## Group 5: link previews (snippet only, `index.html` untouched)

`public/` is **empty**: there is no image to choose for `og:image`. Replace the existing title/description/OG/Twitter lines in `<head>` (the current ones still say "can't use PayPal or Payoneer") with:

```html
<title>ArcLance - Get paid in USDC</title>
<meta name="description" content="ArcLance is a payment page for freelancers facing high fees, slow KYC, or limited access to PayPal/Payoneer. Get paid in USDC or EURC on Arc. Testnet demo, no real money.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ArcLance">
<meta property="og:url" content="https://arclance.xyz/">
<meta property="og:title" content="ArcLance - Get paid in USDC">
<meta property="og:description" content="A payment page for freelancers facing high fees, slow KYC, or limited access to PayPal/Payoneer. Testnet demo, no real money.">
<meta property="og:image" content="https://arclance.xyz/[TO BE ADDED BY OWNER: path of a 1200x630 image]">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="ArcLance - Get paid in USDC">
<meta name="twitter:description" content="A payment page for freelancers facing high fees, slow KYC, or limited access to PayPal/Payoneer. Testnet demo, no real money.">
<meta name="twitter:image" content="https://arclance.xyz/[TO BE ADDED BY OWNER: path of a 1200x630 image]">
```

Until an image exists, drop the two image lines and use `<meta name="twitter:card" content="summary">`. No favicon lines are included.

## Group 6: pay links by wallet address

- 18 The link pays the wallet address; the username is only a display label (`?u=name`). `lib-paylink.js:9,24` (build and parse), invoice preview `13-toast-invoice.js:107` (typed address, else the connected wallet), username page `16-rates-username.js:159`. Pay Link page and receipts already used the address.
- 19 Older username links still open on the device that saved the username; a username this device does not know gets a clear message. No stored data format changed, so saved invoices and usernames need no migration (tested).
- 20 "Share the wallet-address link so anyone can open it." next to the invoice link, the Pay Link page link and the username link (`content-patches.js` INSERTS, `16-rates-username.js:172`).
- 21 Before paying, the payer sees the **full recipient address** and the **network** (`17-paylink-payer.js:79`); a name from the link is shown as "a label only, not verified". The payment confirmation window (used by Send) now also names the chain ID (`23-site.js:112`) and **invoice payments now open the same confirmation** before the wallet (`05-tx-manager.js:389`, new step in invoice payment, tests updated). Swap: the StableFX approval step now warns about the approval amount (`08-swap.js:453`); the App Kit route requests no approval of its own, so nothing was added there.
- Also fixed: the username pay link did not refresh after connecting a wallet (the first render removed the element the update looked for); it now follows the wallet (`16-rates-username.js:150`, `04-ui-sync.js` refresh).

## Placeholders used (all shown highlighted as `[TO BE ADDED BY OWNER]`)

1. Terms: final legal terms; effective date.
2. Privacy: operator name and privacy contact.
3. About: team and company details.
4. Contact: support and security contact (no email invented).
5. Link preview image path (Group 5 snippet).

## Found, not fixed (logic, outside the allowed changes)

- **Buy USDC by card** and **Pay from Any Chain** are simulations: they wait a couple of seconds, create a random transaction hash, and change the displayed balance. Now labelled, but they should be removed or replaced by something real.
- **Username registration** adds a history row "-0.05 USDC" that was never charged.
- **Invoice "release escrow" and "dispute"** are local records only.
- The Send, invoice and Pay Link balance checks assume a 0.12 USDC network fee (code, not text).
- The invoice page card "Security & Trust" ("Powered by Circle USDC, regulated stablecoin") and the unsourced "reserves attested ..." line were not part of the list and are unchanged.
- The GitHub repository is private: the footer and Contact links show a 404 to the public until it is made public.

## Not done / differences

- The label "Home" in the sidebar was not renamed "Dashboard".
- The translated assistant lines (Urdu, Hindi, Bengali, Pidgin) have not been reviewed by a native speaker.
- While editing, `tests/bridge.test.mjs` was emptied by a mistaken command and rebuilt: 9 tests now cover config vs SDK names, speed row, burn calls, fee retry, minimum amount, approve link and recovery wording, and no key in the Bridge files (it had 13).
- The Privacy statement "no advertising or analytics scripts" is based on a search of the source; your host and the third-party services listed may still log requests.

## Confirmations

No contract address, wallet connection logic, or Swap, Bridge, Send, Escrow or P2P transaction logic was changed. Bridge and Swap edits are display text only. The AI assistant's logic is unchanged (text data only). Changes outside text: invoice stats/list (due dates, backup), the pay-link generator and parser, the payer view, the invoice-payment confirmation step, and the sidebar.
