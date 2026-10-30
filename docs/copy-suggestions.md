# ArcLance copy suggestions

Plain, honest wording that matches what the app really does today. Nothing here has been applied. Tell me which lines you like and I will change them.

## 1. Dashboard (Home)

### Hero

Now: "No PayPal / No Payoneer? No Problem. Get Paid in USDC, 2 Seconds, Zero Limits."

Better (pick one):
- **Get paid worldwide in USDC.** Send an invoice or a pay link. Your client pays, you keep the full amount.
- **Freelance payments without the middleman.** Invoices, pay links, escrow and local cash-out, all in one place.
- **Your money, your wallet.** Get paid in USDC or EURC, then bridge, swap or cash out when you are ready.

Sub-line: "Works with any wallet. Runs on Arc Testnet (practice network, no real money)."

### Stat cards

| Now | Suggested | Why |
| - | - | - |
| TOTAL EARNED | Total received | Clear and short |
| PENDING INVOICES "$0.00 awaiting" | Waiting for payment | Plain words |
| FEES SAVED vs PAYPAL "vs 4.4% PayPal fee" | Estimated fees saved (vs a 4.4% card or PayPal fee) | It is an estimate, say so |
| USDC BALANCE | USDC balance | Keep. This is the real on-chain number |
| Total Wallet Balance | Wallet balance (USDC, EURC, cirBTC) | Says what is counted |

### Numbers to remove or measure

These are typed into the page, not measured. Either remove them or read them live.
- "Finality ~2 seconds": say "Fast confirmations" or read the real block time.
- "Network Fee ~0.12 USDC" and "1000x cheaper than SWIFT": remove, or show "Fees are paid in USDC. Your wallet shows the exact amount."
- "Works in 150+ countries" and "withdraw from any country": change to "Open to freelancers worldwide. Cash-out options today: Pakistan, India, Bangladesh, Nigeria (P2P)." Local rules and sanctions differ by country.
- "PKR / INR / BDT / NGN" amounts next to totals: label them "approx." and say where the rate comes from.

### Multi-chain balance card (Circle Gateway)

Now it says clients can pay "from any chain" and you "always receive unified native USDC on Arc". The app shows your USDC on three networks and has a Bridge, but it does not route client payments across chains by itself.

Suggested: **"Your USDC on other networks.** See your balance on Ethereum Sepolia and Base Sepolia. Move it to Arc with Bridge."

### Block titles

- "Pay from Any Chain" -> "Bridge to Arc"
- "ARC NETWORK ACTIVITY / STATS" -> "Arc Testnet at a glance"
- "GLOBAL COVERAGE" -> "Where you can cash out" (list the four P2P countries, then "More countries soon")

## 2. Payments page

- Username Registry: "Register your unique Web3 Username on Arc Testnet" and "Registration fee 0.05 USDC" suggest an on-chain registration. In the app it is saved in your browser. Either say "Demo: saved on this device only" or remove the fee line.
- Quick Tips (keep, they are good): "Check the address twice. Blockchain payments cannot be undone." "Your funds stay in your wallet." "Fees are paid in USDC, no ETH needed."
- Network Fee row: "Paid in USDC. Your wallet shows the exact amount."

## 3. One-line descriptions for every page

Use these as the small grey text under each page title.

- **Swap:** "Swap USDC and EURC at a live quote from Circle StableFX. You approve once, then sign twice."
- **Bridge:** "Move USDC or EURC between Arc and other test networks. About 15 to 19 minutes from most networks."
- **Escrow:** "Pay freelancers milestone by milestone. The money is held safely until you approve the work."
- **P2P:** "Sell USDC for local money or buy it from others. The seller's USDC stays locked until payment is confirmed."
- **Invoices:** "Create a professional invoice and send a link. Get paid in USDC or EURC."
- **Pay Link:** "One link for all your clients. Share it on WhatsApp, email or your profile."
- **AI Assistant:** "Ask how anything works. Never share your seed phrase with anyone, including this chat."
- **Faucet:** "Free test USDC for Arc Testnet. Test money has no real value."

## 4. Trust and safety (add a small footer or a "Safety" card)

- "Testnet only. No real money."
- "ArcLance never asks for your private key or seed phrase."
- "You always sign in your own wallet. We cannot move your funds."
- "Smart contracts are not audited yet. Do not use real money."

## 5. Empty and error messages (friendly and short)

- No wallet: "Connect your wallet to see your balance."
- No transactions: "Nothing here yet. Your payments will show up here."
- Wrong network: "Your wallet is on another network. Switch to Arc Testnet to continue."
- Rejected: "You cancelled in your wallet. Nothing was sent."
- Low gas: "Not enough USDC for network fees. Get test USDC on the Faucet page."

## 6. Menu names

Home, Payments, Swap, Bridge, Escrow, P2P, Invoices, Pay Link, Assistant (instead of "AI"), Faucet, Docs.

## 7. Tone

- Short sentences, simple words, no hype ("Zero limits", "1000x").
- Say "test" or "practice" wherever money is shown, until you are on mainnet.
- Every claim with a number should come from the chain or from a named source.
