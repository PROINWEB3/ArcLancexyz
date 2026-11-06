# ArcLance FAQ & Platform Facts

## What is ArcLance?
ArcLance is a borderless, non-custodial stablecoin payment platform for freelancers, remote contractors, and digital creators, built on Arc Testnet (Chain ID: 5042002). It is built by 𝐇𝐚𝐬𝐧𝐚𝐢𝐧𝐀𝐈⚡ (HasnainAI). It enables self-custodial invoicing, direct peer-to-peer payments, token swaps, multi-chain bridging via Circle CCTP, and Escrow (lock USDC for one order until release or an arbiter decision; testnet only; one order, one amount, no milestones, no guaranteed protection).

## Networks & Tokens
- **Chain:** Arc Testnet (Chain ID: 5042002). Mainnet is planned.
- **Gas Fee Model:** On Arc Network, network gas fees are paid natively in USDC, not ETH.
- **Supported Tokens on Arc:**
  - USDC (6 decimals): Native fee token and standard settlement currency.
  - EURC (6 decimals): Euro-denominated stablecoin issued by Circle.
  - cirBTC (8 decimals): Bitcoin test token on Arc.
- **Tokens are Testnet Only:** All tokens on Arc Testnet are for testing and demonstration; they hold no real-world monetary value.

## Features
1. **Payments (Send & Receive):**
   - Direct transfer of USDC, EURC, and cirBTC.
   - Non-custodial: transfers execute directly via the user's connected Web3 wallet (MetaMask, Rabby, OKX, etc.) or passkey.
   - Every transaction generates a verifiable link on Arcscan (https://testnet.arcscan.app).
2. **Invoices:**
   - Create downloadable PDF invoices with customizable line items and currency display.
   - Invoices and usernames are stored locally in the user's browser (off-chain) for privacy with a 7-day session cache.
   - Invoices are not stored on-chain or in a cloud database.
3. **Pay Link:**
   - Shareable link format: `https://arclance.xyz/pay/<username-or-address>/<amount>/<label>`.
   - Clients open the link, connect their wallet, and pay directly to the freelancer's wallet address.
4. **Token Swap:**
   - Uses Circle StableFX fixed-rate quotes for USDC and EURC.
   - cirBTC cannot be swapped.
   - Fixed quotes with zero slippage configuration.
5. **Cross-Chain Bridge:**
   - Powered by Circle CCTP (Cross-Chain Transfer Protocol).
   - Burns tokens on the source testnet and mints native tokens on the destination testnet.
   - Supports USDC across 12 testnets and EURC between supported chains.
6. **Escrow (Testnet Demo):**
   - Locks USDC for a single order (one order, one amount, no milestones, no guaranteed protection) on Arc Testnet.
   - Released by client approval, auto-release delay, or single arbiter decision upon dispute.
7. **P2P Trading:**
   - Peer-to-peer fiat-to-USDC exchange with local payment methods across Pakistan (PKR), India (INR), Bangladesh (BDT), and Nigeria (NGN).
   - Contract holds USDC in escrow until seller confirms payment receipt.

## Security & Safety Rules
- **Never share your seed phrase, private key, or password with anyone.** ArcLance team members and official admins will never ask for them.
- Official admins will never direct-message (DM) you first.
- Never share screenshots displaying personal private credentials.
- Always check that your wallet is on Arc Testnet (5042002) and that recipient addresses are 42-character hex addresses starting with `0x`.

## Support & Official Channels
- **Official Website:** https://arclance.xyz
- **Support Email:** support@arclance.xyz
- **General Inquiries:** hello@arclance.xyz
- **Official X (Twitter):** https://x.com/Arclancexyz (@Arclancexyz)
- **Builder X:** https://x.com/Hasnain_Akhtar_ (𝐇𝐚𝐬𝐧𝐚𝐢𝐧𝐀𝐈⚡)
- **Telegram:** https://t.me/HasnainSE
- **Code Repository:** https://github.com/PROINWEB3/ArcLancexyz
- If unsure about any platform fact, contact support@arclance.xyz.

## Latest Updates & News
- **Testnet Status:** ArcLance is running live on Arc Testnet. Mainnet deployment is planned for the future.
- **AI Assistant Upgrade:** Multilingual assistance supporting English, Urdu (script & Roman), Hindi, Bengali, Nigerian Pidgin, Hausa, Yoruba, and Igbo.
- **Note on news:** News and announcements can become outdated; verify the latest status in our official Telegram or X channels.

