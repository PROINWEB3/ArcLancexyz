# ArcLance progress report

Arc Testnet only (chain ID 5042002). No mainnet entry anywhere in the config. Nothing pushed to GitHub.

## Part 1: why balances showed 0 (root cause)

I read the console log from your own session. Your wallet (Rabby, account 0xca56…06b1) connected on Arc Testnet and the app logged `Balances: USDC 0 | EURC 0 | cirBTC 0` with no error. The chain says otherwise: that address holds **300.784948 USDC** and **2.059409 EURC**.

The app read balances through the wallet's own RPC for "Arc Testnet". That RPC answered with empty data, and the code treated empty data as zero. So the read "succeeded" with a wrong 0.

Fixes:
- Balances now come from Arc's public RPC first (`https://rpc.testnet.arc.io`). The wallet is only a fallback.
- An empty `balanceOf` answer is an error, never a zero. Errors show a message and a Retry button.
- A wallet on the wrong network no longer hides balances. A banner offers "Switch".
- Native USDC (18 decimals) and the ERC-20 USDC (6 decimals) are one balance. It is read once, through ERC-20, and shown once.
- The console also showed `Failed to connect to MetaMask` errors. Those come from the MetaMask extension itself (you also selected Rabby), not from ArcLance.

Checked with your address and a wallet that returns empty data: USDC 300.784948, EURC 2.059409, cirBTC 0.

## Status

| Part | Status |
| --- | --- |
| 1. Balances | Done and tested |
| 2. Swap | Page done with real balances. Trading is disabled (see below) |
| 3. Bridge | Done: real CCTP V2, 12 testnets. Not yet run with a real funded wallet |
| 4. Logos | Done, with one limit (see below) |
| 5. Escrow | Page done. Contract not deployed, so only the "not deployed" state ran for real |
| 6. P2P | Page done. Same limit as Escrow |
| 7. Testnet config | Done |

## Swap

Layout as asked: "You pay" box with token, balance, amount and MAX/25/50/75, a direction button, "You receive" box, then rate, minimum received, network fee, slippage presets plus custom, and one button that reads Connect Wallet, Enter amount, Insufficient balance, Switch to Arc Testnet, or Swap unavailable. Tokens: USDC, EURC, cirBTC. No USDT anywhere. Swap history is saved per wallet address.

**Trading is disabled on purpose.** Swaps on Arc go through Circle StableFX, which is an authenticated API (quote, Permit2 approval, signed trade, funding). It needs a Circle API key that cannot be put in a browser. The "original" swap sent your tokens to an address with no contract code, so I removed it. The rate shown is an indicative market rate (CoinGecko), labelled as not an on-chain quote. When you have StableFX access, tell me and I will add a small server that holds the key and complete the Approve and Swap steps.

## Bridge: networks added (all testnets, all confirmed in Circle's CCTP docs)

Arc Testnet, Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy, Avalanche Fuji, Unichain Sepolia, Monad Testnet, Linea Sepolia, Sonic Testnet, World Chain Sepolia. That is 12 of your 12 candidates. For each one I checked the RPC live: the chain ID matches, and the USDC, TokenMessengerV2 and MessageTransmitterV2 addresses all have contract code.

Notes:
- Token is USDC only. EURC bridging was not added because I did not verify EURC addresses on the other testnets.
- Linea Sepolia as a source takes 6 to 32 hours to confirm (Circle docs). The page warns about it.
- The call is `TokenMessengerV2.depositForBurn` with its 7 parameters. I simulated it against the live Arc contract: it decodes and reaches the USDC transfer.
- Standard transfer, fee read from Circle's Iris API (0 on the routes checked).
- Steps: approve exactly the amount, send (burn), Circle confirms (we poll), receive on the destination (`receiveMessage`). Unfinished transfers are saved per wallet and can be resumed after a refresh.

## Logos

All logos live in `src/assets/icons.ts` (generated SVG strings in `icon-svgs.ts`), with a first-letter circle as fallback. No CDN. The original site only used emoji and had no SVG logos to copy, so I used the vendored `@web3icons/react` package for networks (including Arc's own mark) and for USDC and EURC. **cirBTC uses the generic Bitcoin mark**, because no cirBTC logo exists in either place. Tell me if you have an official one.

## Interfaces the frontend expects

Both ABIs are in `src/contracts/` with the money flow documented. Set `VITE_ESCROW_ADDRESS` and `VITE_P2P_ADDRESS` once deployed.

### Escrow (`src/contracts/escrow-abi.ts`)

Milestone status: 0 Funded, 1 Delivered, 2 Approved, 3 Released, 4 Disputed.

```solidity
struct MilestoneInput { uint256 amount; string description; }
struct Milestone { uint256 amount; string description; uint8 status; uint64 deliveredAt; string deliveryNote; uint64 approvedAt; uint64 releasedAt; }
struct EscrowInfo { address client; address freelancer; address token; string title; uint256 totalAmount; uint256 releasedAmount; uint64 createdAt; uint32 autoReleaseDays; uint8 milestoneCount; }

function createEscrow(address freelancer, address token, string title, MilestoneInput[] milestones, uint32 autoReleaseDays) returns (uint256 id); // pulls the total with transferFrom
function markDelivered(uint256 id, uint8 index, string note);      // freelancer
function approveMilestone(uint256 id, uint8 index);                 // client
function releaseMilestone(uint256 id, uint8 index);                 // client, or anyone after deliveredAt + autoReleaseDays
function disputeMilestone(uint256 id, uint8 index, string reason);  // client
function escrowCount() view returns (uint256);
function getEscrow(uint256 id) view returns (EscrowInfo);
function getMilestone(uint256 id, uint8 index) view returns (Milestone);
function escrowIdsOf(address account, bool asClient) view returns (uint256[]);

event EscrowCreated(uint256 indexed id, address indexed client, address indexed freelancer, address token, uint256 total, uint8 milestones);
event MilestoneDelivered(uint256 indexed id, uint8 index, string note);
event MilestoneApproved(uint256 indexed id, uint8 index);
event MilestoneReleased(uint256 indexed id, uint8 index, uint256 amount);
event MilestoneDisputed(uint256 indexed id, uint8 index, address indexed by, string reason);
```

Dispute resolution (who decides) is not in the UI. The contract needs its own arbiter function.

### P2P (`src/contracts/p2p-abi.ts`)

Ad side: 0 sell USDC (advertiser's USDC is locked at `createAd`), 1 buy USDC (the seller who takes the order locks USDC in `createOrder`). `price` is fiat per 1 USDC scaled by 1e6. Payment method bitmask: 1 bank transfer, 2 JazzCash, 4 Easypaisa, 8 UPI, 16 bKash, 32 mobile money. Order status: 0 waiting for payment, 1 paid, 2 completed, 3 cancelled, 4 disputed.

```solidity
struct AdInput { uint8 side; string currency; uint256 amount; uint256 price; uint256 minLimit; uint256 maxLimit; uint32 paymentMethods; uint32 paymentWindowMinutes; string paymentDetails; }
struct Ad { address owner; uint8 side; string currency; uint256 amount; uint256 remaining; uint256 price; uint256 minLimit; uint256 maxLimit; uint32 paymentMethods; uint32 paymentWindowMinutes; string paymentDetails; bool active; uint64 createdAt; }
struct Order { uint256 adId; address buyer; address seller; uint256 amount; uint256 fiatAmount; uint8 status; uint64 createdAt; uint64 paidAt; uint64 expiresAt; string paymentReference; }

function createAd(AdInput input) returns (uint256 adId);
function cancelAd(uint256 adId);
function createOrder(uint256 adId, uint256 amount) returns (uint256 orderId);
function markPaid(uint256 orderId, string paymentReference);   // buyer
function confirmPayment(uint256 orderId);                       // seller, releases USDC to the buyer
function cancelOrder(uint256 orderId);                          // buyer, or anyone after expiresAt if unpaid
function openDispute(uint256 orderId, string reason);           // buyer or seller, after "paid"
function adCount() view returns (uint256);
function getAd(uint256 adId) view returns (Ad);
function orderCount() view returns (uint256);
function getOrder(uint256 orderId) view returns (Order);
function orderIdsOf(address account) view returns (uint256[]);
function sellerStats(address seller) view returns (uint256 completedOrders, uint256 totalOrders, uint256 disputedOrders);

event AdCreated(uint256 indexed adId, address indexed owner, uint8 side, string currency, uint256 amount, uint256 price);
event AdCancelled(uint256 indexed adId);
event OrderCreated(uint256 indexed orderId, uint256 indexed adId, address indexed buyer, address seller, uint256 amount);
event OrderPaid(uint256 indexed orderId, string paymentReference);
event OrderCompleted(uint256 indexed orderId);
event OrderCancelled(uint256 indexed orderId);
event OrderDisputed(uint256 indexed orderId, address indexed by, string reason);
```

`paymentDetails` is stored onchain, so it is public. The page tells sellers to use a testnet-only account. The reference rate on the page comes from open.er-api.com, labelled "for orientation only", with a message and manual price entry when it fails.

## How it was tested

There is no browser in the build environment, so I ran the app code in a simulated browser against the live Arc RPC with a fake EIP-6963 wallet. 66 checks pass:
- Wallet and balances (21): connect, balances match direct RPC reads, empty wallet RPC, wrong network, account and chain changes, disconnect, auto-reconnect, RPC failure and Retry.
- Swap, Bridge, navigation (32): every nav page loads with no console errors. Bridge selector shows 12 networks with inline SVG logos. The full bridge flow ran with mocked receipts and attestation: approve, the 7-argument burn call (decoded and checked), tracker, receive on the destination after a wallet network switch, history saved per wallet.
- Escrow and P2P (13): with a fake contract at an env address: list, detail timeline, approve, create (2 milestones), marketplace with onchain reputation, reference rate, order creation, countdown, payment actions.

**Not tested:** a real bridge transfer (needs a funded wallet signing in a browser), real MetaMask, OKX or Rabby clicks, and the Escrow and P2P pages against a real contract. Please connect your wallet and try Dashboard, Send, and a small Bridge from Arc to Ethereum Sepolia.

## What needs your input

1. StableFX access (Circle API) to enable trading.
2. Deployed Escrow and P2P contracts matching the interfaces above, and their addresses in `.env`.
3. An official cirBTC logo, if you want one.
4. Whether to add EURC to the bridge (needs verified EURC addresses on each testnet).

## Files changed

New: `src/assets/icons.ts`, `src/assets/icon-svgs.ts`, `src/lib/evm.ts`, `src/lib/cctp.ts`, `src/lib/bridge-store.ts`, `src/lib/contract.ts`, `src/contracts/escrow-abi.ts`, `src/contracts/p2p-abi.ts`, `src/legacy/lib-ui.js`, `src/legacy/lib-tx.js`, `src/legacy/20-escrow.js`, `src/legacy/21-p2p.js`, `docs/progress-report.md`.

Rewritten: `src/config/chain-config.ts`, `src/legacy/08-swap.js`, `src/legacy/09-bridge.js`.

Edited: `src/legacy/02-price-feed.js`, `03-wallet-state.js`, `04-ui-sync.js`, `05-tx-manager.js` (swap and bridge code removed), `12-navigation.js`, `index.js`, `index.html` (Swap and Bridge pages, Escrow and P2P pages and nav items, testnet banner, old bridge tracker removed), `.env.example`, `README.md`, `AGENTS.md`.

Removed: the old fake swap and bridge flows, the Circle kit key (no longer used; it is still in the gitignored `reference/` copy, and since it was public on the live site you should rotate it), and the `VITE_NETWORK` switch.


## Update: deployed on Arc Testnet
- ArcLanceEscrow: `0xae2eca889198f06b808a043430e94bf062d38c61`
- ArcLanceP2P: `0xc1fe0448bfbdfaf1beace88f3a4b6275c2afcb4e`
- Owner and arbiter of both: `0xca56f8482b2b242427ce6e1fb0e8c5591baf06b1`

## Round 5: files changed
- Contracts and deploy: `contracts/ArcLanceEscrow.sol`, `contracts/ArcLanceP2P.sol`, `contracts/interfaces/IArcLance*.sol`, `contracts/mocks/*`, `hardhat.config.cjs`, `hardhat-test/*`, `hardhat-scripts/deploy-arc-testnet.cjs`, `contracts/contract-metadata/*`, `AGENTS.md`
- Bridge EURC: `src/config/chain-config.ts`, `src/lib/cctp.ts`, `src/lib/bridge-store.ts`, `src/legacy/09-bridge.js`
- Escrow and P2P: `src/legacy/20-escrow.js`, `src/legacy/21-p2p.js`, `src/config/p2p-countries.ts` (new), `src/contracts/p2p-abi.ts`, `src/assets/icons.ts`
- Faucet: `src/legacy/22-faucet.js` (new), `index.html`, `src/legacy/04-ui-sync.js`
- AI assistant: `src/assistant/knowledge.ts` (new), `api/chat.js` (new), `vite.config.ts`, `src/legacy/11-ai-assistant.js`, `index.html` (chips)
- Smoothness and mobile: `src/styles/arclance.css`, `src/legacy/lib-ui.js`, `src/legacy/lib-tx.js`, `src/legacy/12-navigation.js`, `src/legacy/13-toast-invoice.js`, `src/lib/evm.ts`
- Config and docs: `.env` (addresses), `.env.example`, `README.md`, `docs/progress-report.md`, `.oxlintrc.json`, `.gitignore`, `package.json`

## Tests run this round
- Hardhat contract tests: 50 passing
- Frontend against the real compiled contracts on a local chain (chain ID 5042002): 50 checks (Escrow create, deliver, approve, release, dispute, auto-release; P2P ad, order, paid, confirm, cancel, expiry, dispute, buy-ad flow, 4 countries)
- Bridge USDC and EURC: 25 + 32 checks; wallet and balances: 21; live contract pages, Faucet, assistant and mobile menu: 28; assistant service path: 6; AI proxy: 8
