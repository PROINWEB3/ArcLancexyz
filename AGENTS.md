# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```

## ArcLance notes
- Arc Testnet only (5042002). Everything chain-related lives in `src/config/chain-config.ts`. No mainnet entry.
- Balances are read from Arc's public RPC first (wallet RPC is only a fallback), through ERC-20 `balanceOf`. USDC native and ERC-20 are one balance.
- Swap: UI and balances are real; execution is disabled until Circle StableFX API access is connected (`STABLEFX_READY` in `src/legacy/08-swap.js`).
- Bridge: real CCTP V2 (`src/lib/cctp.ts`, `src/legacy/09-bridge.js`), 12 testnets, USDC only.
- Escrow and P2P contracts are not deployed. Set `VITE_ESCROW_ADDRESS` / `VITE_P2P_ADDRESS`; ABIs are in `src/contracts/`.
- Logos: `src/assets/icons.ts` (inline SVG from the vendored @web3icons/react, generated into `icon-svgs.ts`).

## Deployed contracts (Arc Testnet, chain 5042002)
- ArcLanceEscrow: 0xae2eca889198f06b808a043430e94bf062d38c61 (tx 0x463b7a0e368f81ec64bb4fd7f28cdb3cbd3cff69e0a5dd3550ec7b19ffe0a4e2)
- ArcLanceP2P: 0xc1fe0448bfbdfaf1beace88f3a4b6275c2afcb4e (tx 0x4e99cd0af7bdf7c09b9e13f341628375508ae0e569f38bf3bf8fe5ce00d831a9)
- Owner and arbiter of both: 0xca56f8482b2b242427ce6e1fb0e8c5591baf06b1 (user's test wallet). Deployed from the Studio deployer wallet.
- Frontend reads them from VITE_ESCROW_ADDRESS and VITE_P2P_ADDRESS in .env.

## Swap (StableFX)
- Server function: api/stablefx.js (Vercel function, and a Vite middleware in dev). Key: STABLEFX_API_KEY, format TEST_API_KEY:<id>:<secret>. LIVE keys and any non-sandbox STABLEFX_ENV are refused (testnet only).
- Browser: src/legacy/08-swap.js and src/lib/stablefx.ts. Flow: quote, Permit2 approval, sign quote, create trade, sign funding, fund, poll status.
- Tests: tests/*.test.mjs (npm run test:swap), mocked Circle, no key needed.

## Site copy and links
- Pay link format everywhere: https://arclance.xyz/pay/<username-or-address>/<amount>/<label> (src/legacy/lib-paylink.js). vercel.json rewrites /pay/* to the app.
- Footer, GitHub, X and Arcscan links: src/config/site.ts. Docs "Last verified" date is in index.html.
- Local-currency rates are never hard-coded: they load from open.er-api.com and show "Rate unavailable" when the fetch fails.
