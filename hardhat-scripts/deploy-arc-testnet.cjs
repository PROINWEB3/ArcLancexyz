// Deploys ArcLanceEscrow and ArcLanceP2P to Arc Testnet (chain ID 5042002).
//
//   npx hardhat run hardhat-scripts/deploy-arc-testnet.cjs --network arcTestnet
//
// Reads from .env (never committed):
//   PRIVATE_KEY       required. Deployer key (testnet only). Never prefix with VITE_.
//   ARBITER_ADDRESS   required. Address that resolves disputes (owner can change it later).
//   OWNER_ADDRESS     optional. Contract owner; defaults to the deployer.
//   USDC_ADDRESS      optional. Defaults to the Arc Testnet USDC ERC-20 interface from docs.arc.io.
//   EURC_ADDRESS      optional. Defaults to the Arc Testnet EURC from docs.arc.io.
const { ethers, network } = require('hardhat');

const ARC_TESTNET_CHAIN_ID = 5042002n;
const EXPLORER = 'https://explorer.testnet.arc.io';
// Arc Testnet addresses from https://docs.arc.io/arc/references/contract-addresses (overridable via .env).
const DEFAULT_USDC = '0x3600000000000000000000000000000000000000';
const DEFAULT_EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

function fail(message) {
  console.error(`\nDeploy aborted: ${message}\n`);
  process.exit(1);
}

async function main() {
  if (!process.env.PRIVATE_KEY) fail('PRIVATE_KEY is not set in .env. Add a testnet-only deployer key. It is never committed (.env is in .gitignore).');
  const arbiter = process.env.ARBITER_ADDRESS;
  if (!arbiter || !ethers.isAddress(arbiter)) fail('ARBITER_ADDRESS is missing or not a valid address.');
  const usdcAddress = process.env.USDC_ADDRESS || DEFAULT_USDC;
  const eurcAddress = process.env.EURC_ADDRESS || DEFAULT_EURC;
  for (const [name, value] of [['USDC_ADDRESS', usdcAddress], ['EURC_ADDRESS', eurcAddress]]) {
    if (!ethers.isAddress(value)) fail(`${name} is not a valid address.`);
  }

  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== ARC_TESTNET_CHAIN_ID) fail(`connected to chain ${chainId}, expected Arc Testnet (${ARC_TESTNET_CHAIN_ID}). Run with --network arcTestnet.`);
  const owner = process.env.OWNER_ADDRESS || deployer.address;
  if (!ethers.isAddress(owner)) fail('OWNER_ADDRESS is not a valid address.');

  // Sanity-check the token addresses before spending gas.
  for (const [name, address] of [['USDC', usdcAddress], ['EURC', eurcAddress]]) {
    const code = await ethers.provider.getCode(address);
    if (code === '0x') fail(`${name} address ${address} has no contract code on Arc Testnet.`);
    const token = new ethers.Contract(address, ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'], ethers.provider);
    const decimals = await token.decimals();
    if (decimals !== 6n) fail(`${name} at ${address} reports ${decimals} decimals, expected 6.`);
  }

  const balance = await ethers.provider.getBalance(deployer.address); // native USDC, 18 decimals
  console.log(`Network:   ${network.name} (chain ${chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatUnits(balance, 18)} USDC (native gas)`);
  console.log(`Owner:     ${owner}`);
  console.log(`Arbiter:   ${arbiter}`);
  console.log(`USDC:      ${usdcAddress}`);
  console.log(`EURC:      ${eurcAddress}\n`);
  if (balance === 0n) fail('the deployer has no testnet USDC for gas. Use the Circle faucet first.');

  const Escrow = await ethers.getContractFactory('ArcLanceEscrow');
  const escrow = await Escrow.deploy(owner, usdcAddress, eurcAddress, arbiter);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();

  const P2P = await ethers.getContractFactory('ArcLanceP2P');
  const p2p = await P2P.deploy(owner, usdcAddress, arbiter);
  await p2p.waitForDeployment();
  const p2pAddress = await p2p.getAddress();

  console.log('Deployed:');
  console.log(`  ArcLanceEscrow  ${escrowAddress}   ${EXPLORER}/address/${escrowAddress}`);
  console.log(`  ArcLanceP2P     ${p2pAddress}   ${EXPLORER}/address/${p2pAddress}\n`);
  console.log('Add these to the frontend .env:');
  console.log(`VITE_ESCROW_ADDRESS=${escrowAddress}`);
  console.log(`VITE_P2P_ADDRESS=${p2pAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
