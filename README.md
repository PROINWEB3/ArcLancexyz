# ArcLance

ArcLance is a borderless USDC payment platform for freelancers on Arc Testnet: send, receive, swap and bridge stablecoins, create invoices and pay links, and ask the built-in AI assistant for help.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- Vite, TypeScript and React (hosts the top-level error boundary)
- The ArcLance interface ported from the original single-page site (plain JavaScript sections in `src/legacy`)
- Wallet detection through EIP-6963

## Development

Prerequisites: Node.js 20+ (or Bun).

```
npm install
npm run dev
npm run build
npm run preview
```

### Network configuration

ArcLance runs on Arc Testnet only (chain ID 5042002). All chain IDs, RPC and explorer URLs, token addresses and contract addresses live in `src/config/chain-config.ts`. Bridging uses Circle CCTP V2 between Arc Testnet and the testnets listed there.

### Environment variables

Copy `.env.example` to `.env`. Every variable is optional.

- `VITE_ESCROW_ADDRESS`: address of the milestone escrow contract on Arc Testnet. While empty, the Escrow page shows "Contract not deployed on this network".
- `VITE_P2P_ADDRESS`: address of the P2P contract on Arc Testnet. While empty, the P2P page shows "Contract not deployed on this network".
- `STABLEFX_API_KEY` (optional, server-side only): Circle StableFX sandbox key, format `TEST_API_KEY:<id>:<secret>`. Enables the Swap page. `STABLEFX_ENV` (optional): only `sandbox` is accepted.
- `AI_API_KEY`, `AI_API_URL`, `AI_MODEL` (optional, server-side only): enable the AI service for the assistant. Never prefixed with `VITE_`.
- `PRIVATE_KEY`, `ARBITER_ADDRESS`, `OWNER_ADDRESS`, `USDC_ADDRESS`, `EURC_ADDRESS`, `ARC_TESTNET_RPC_URL` (optional): used only by the contract deploy script, never by the app.

### Smart contracts (Hardhat)

The Escrow and P2P contracts live in `contracts/ArcLanceEscrow.sol` and `contracts/ArcLanceP2P.sol`, with their interfaces in `contracts/interfaces/`.

```
npm run hh:compile
npm run hh:test
npm run deploy:arc-testnet
```

Deployment reads `PRIVATE_KEY` and `ARBITER_ADDRESS` from `.env` (see `.env.example`). Use a testnet-only key and never commit `.env`.

### AI assistant

The assistant answers from a built-in guide. To also use an AI service, set `AI_API_KEY` (optional `AI_API_URL`, `AI_MODEL`) on the server. The key is read only by `api/chat.js` (a Vercel function, and a Vite middleware in development) and never reaches the browser. Without a key the assistant shows a note and uses the built-in guide.

### P2P countries

Countries and payment methods are defined in `src/config/p2p-countries.ts`.

### Swap (two routes)

The Swap page has a "Swap with" switch:

- **Circle App Kit** (default): runs in the browser with your own wallet (MetaMask, Rabby or any injected wallet) on Arc Testnet. It needs no API key and no environment variable. You see a real estimate (rate, minimum received, provider fee, gas) before you swap, and the SDK asks your wallet for the permit or approval. Tokens: USDC, EURC and cirBTC.
- **Circle StableFX**: fixed-rate quotes, USDC and EURC only, through the server function described below.

### Swap (Circle StableFX route)

Swaps use Circle StableFX on Arc Testnet. The key stays on the server in `api/stablefx.js`. Locally, add `STABLEFX_API_KEY=...` to `.env` and restart the dev server. On Vercel, add it under Project Settings, Environment Variables, then redeploy. Run the swap tests with `npm run test:swap` (they use a mocked Circle and need no key).

### Testnet deployment

Deployed on Arc Testnet (chain ID 5042002):

- ArcLanceEscrow: `0xae2eca889198f06b808a043430e94bf062d38c61`
- ArcLanceP2P: `0xc1fe0448bfbdfaf1beace88f3a4b6275c2afcb4e`

Set them as `VITE_ESCROW_ADDRESS` and `VITE_P2P_ADDRESS`.

### Tests

```
npm run test:swap    # all tests in tests/ (mocked Circle, no key needed)
npm run hh:test      # Escrow and P2P contract tests
```

### Hosting

The app is a static Vite build plus two small serverless functions in `api/` (`stablefx.js` for Swap and `chat.js` for the optional AI service). Vercel runs both as-is: import the project, set the environment variables above under Project Settings, Environment Variables (`VITE_` values are read at build time, so redeploy after changing them), and `vercel.json` already routes `/pay/...` links to the app. A static-only host works for everything except Swap and the AI service.
