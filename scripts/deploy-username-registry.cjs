// Deploy UsernameRegistry to Arc Testnet (chain ID 5042002).
//
// Usage:
//   npx hardhat run scripts/deploy-username-registry.cjs --network arcTestnet
//
// Reads PRIVATE_KEY from the environment (.env) at run time and never logs it.

const hre = require('hardhat');
const { ethers, network } = hre;

const EXPECTED_CHAIN_ID = 5042002n;

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('Set PRIVATE_KEY in .env before deploying (testnet wallet only; never commit .env).');
  }

  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Refusing to deploy: expected Arc Testnet (chainId ${EXPECTED_CHAIN_ID}), got ${chainId} (${network.name}).`);
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log('Network :', network.name, `(chainId ${chainId})`);
  console.log('Deployer:', deployer.address);
  console.log('Balance :', ethers.formatEther(balance), '(native gas)');
  if (balance === 0n) {
    throw new Error('Deployer has 0 native gas on Arc Testnet. Fund it from https://faucet.circle.com first.');
  }

  console.log('\nDeploying UsernameRegistry…');
  const Factory = await ethers.getContractFactory('UsernameRegistry');
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log('UsernameRegistry:', address);

  console.log('\nAdd to .env:');
  console.log(`VITE_USERNAME_REGISTRY_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
