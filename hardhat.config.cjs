// Hardhat config for the ArcLance contracts. The rest of the project is a Vite app, so this file is CommonJS (.cjs).
require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require('hardhat/builtin-tasks/task-names');

// Compile only the ArcLance contracts, their interfaces and the test mocks. Other Solidity files in
// contracts/ (imported Circle sources, Foundry scripts and tests) belong to the Foundry setup.
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_args, _hre, runSuper) => {
  const all = await runSuper();
  return all.filter((p) => /[\\/]contracts[\\/](ArcLanceEscrow\.sol|ArcLanceP2P\.sol|UsernameRegistry\.sol|interfaces[\\/]IArcLance(Escrow|P2P)\.sol|mocks[\\/][A-Za-z0-9]+\.sol)$/.test(p));
});

const ARC_TESTNET_RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  paths: {
    sources: './contracts',
    tests: './hardhat-test',
    cache: './hardhat-cache',
    artifacts: './hardhat-artifacts',
  },
  networks: {
    // Arc Testnet only. The key is read from .env (PRIVATE_KEY) and never committed.
    arcTestnet: {
      url: ARC_TESTNET_RPC_URL,
      chainId: 5042002,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
