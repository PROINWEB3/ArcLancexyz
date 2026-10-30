# Copy and UI polish: what changed, by section

Tests: `npm run test:swap` runs 40 tests (23 swap, 17 for this round). `bun run check` and `bun run build` pass.

## 1. Emoji removal
- `index.html`: about 100 decorative emoji replaced by one set of 16-18px stroke icons (`currentColor`), or removed in dropdown options and in buttons whose label the app changes while it runs. Icons live in `src/assets/ui-icons.ts`.
- Dashboard "Multi-Chain Balance" rows use the real network logos from the shared icons file. Asset rows use the token logos.
- Toasts: a status icon (check, alert, clock, zap) replaces the leading emoji; the text is cleaned automatically.
- Pictographs removed from strings in the other app files. Country flags stay next to PKR, INR, BDT and NGN.
- Not touched: the wallet connection screen strings in `06-wallet-manager.js` (you asked me not to touch wallet connection).

## 2. Brand
- "ArcLance" in body text, page titles, docs, receipt, invoice message. The logo text stays uppercase.
- Kept uppercase on purpose: the P2P payment reference code `ARCLANCE-<order>` (it is a code people copy into a bank note).

## 3. Copy rewrite
- Hero, sub line, coverage card, network stats, feature cards, quick tips, pay link bullets, client onboarding, how it works, docs intro cards: rewritten in plain wording.
- Removed: "Upwork Killer", "Zero Limits", "No Problem", "1000x cheaper", "150+ countries", "~2 seconds", "~0.12 USDC" (page, docs and assistant).
- "Fast Settlement" card says EVM Layer 1; no "L2".
- Non-custodial wording and Circle blacklist note as you wrote them. "Deloitte" replaced by "reserves are attested by independent accountants" (page, docs, assistant).
- Escrow Protection subtitle: I did NOT use "locked in the escrow contract ... dispute within 72 hours". That toggle only tags the invoice in this browser and moves no funds, and the contract has no 72-hour window (the client can dispute before releasing). The text now says so and points to the Escrow page.

## 4. Facts and consistency
- Docs RPC is `https://rpc.testnet.arc.network` (docs, faucet page). The app config still uses `rpc.testnet.arc.io`; both answer.
- Sidebar Arc docs link is `https://docs.arc.io` (checked, official).
- One pay link format: `https://arclance.xyz/pay/<username-or-address>/<amount>/<label>`. Used by the invoice preview and copy, the Pay Link page, WhatsApp text, receipts, the username share link and the docs. `vercel.json` rewrites `/pay/*` so the links open. Older `#/pay/...` links still work. A username only resolves on the device that saved it, so links use the wallet address when there is no username.
- Docs bridge: duplicate row removed; list renamed "Example routes" with a line pointing to the Bridge page.
- Dashboard Networks: 3 (Arc, Ethereum Sepolia, Base Sepolia), same as Multi-Chain Balance.
- Invoice escrow notice: the placeholder is replaced by the real ArcLanceEscrow address, linked to testnet.arcscan.app, with the note that real escrows are created on the Escrow page.
- Receipt: the fixed date is gone; `showReceipt` takes the transaction time.
- Docs "Username Registry" is "Username tab"; the tab itself is now labelled USERNAME.
- "USDC to USDT / Circle to Tether": that text does not exist in the page (USDT was removed earlier), so nothing to change.

## 5. Live rates
- No built-in rates anywhere (`LocalRates`, `ExchangeRates`, docs, assistant). Rates load from open.er-api.com.
- A small label under each local-currency preview: "Loading rate...", "Rate updated HH:MM", or "Rate unavailable right now" (previews show a dash). Refreshed every 10 minutes.
- Docs: "Rates move daily. Check Binance P2P for current prices."

## 6. Testnet banner
- "Testnet mode. Balances and payments use test tokens with no real value." Dismiss button, remembered for the session.
- "TOTAL EARNED (TESTNET)" and "FEES SAVED vs PAYPAL (TESTNET)".

## 7. Empty and error states
- "No transactions yet. Send or receive to see activity here.", "No username yet", "No activity yet".
- Wrong network: a red notice under the banner with a "Switch to Arc Testnet" button (switch first, add the network if the wallet does not have it).
- Toasts: pending, then confirmed or failed, with a "View on Arcscan" link for Send, Escrow, P2P and swap approvals. Bridge toasts link to the explorer of the network used (Arc links use Arcscan).
- Send: rejects invalid addresses, the zero address and wrong checksums, then shows a summary (token, amount, recipient, network, fee) before the wallet is asked to sign. Cancel sends nothing. The transfer code itself is unchanged.

## 8. Invoices
- Note under the form: "Invoices are stored in this browser only. Export CSV or share the payment link to keep a record." Storage unchanged.

## 9. Docs
- "Last verified: 28 October 2026" and the testnet line at the top. I checked the values I changed (RPC, chain ID, links, addresses), not every sentence.
- Cash Out Guide: "Rules on crypto differ by country. Check your local regulations. This is not financial advice."

## 10. Footer and meta
- Footer: ArcLance, Docs, Arcscan, GitHub, X (@PROinWeb3), "Testnet build" (`src/config/site.ts`).
- Page titles such as "Swap | ArcLance". Meta description, Open Graph and Twitter tags, canonical link.

## 11. Mobile
- Added CSS for 900, 640 and 420px: no sideways scroll, 40px tap targets, scrollable tab bars, docs stacked, modals that fit the screen, network badge hidden under 420px.
- Not checked in a real browser at 360px (none is available here). Please look at it on your phone.

## Things I found and did not change (logic, as you asked)
- Username registration only signs a message and saves the name in this browser; it also adds a history row "-0.05 USDC" that was never charged. The labels now say demo / no fee.
- Invoice "release escrow" and "dispute" are local records that move no funds. The toasts now say so.
- The receipt popup is not called from anywhere yet.
