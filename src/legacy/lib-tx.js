// Wallet transaction helpers shared by the Escrow and P2P pages. All transactions are real.
import { ARC, arcAltTxUrl } from '../config/chain-config';
import { switchWalletChain, walletChainId, waitForReceipt } from '../lib/evm';
import { encodeApprove } from '../lib/cctp';
import { readErc20Allowance } from '../lib/contract';

export const arcChainParams = () => ({ chainIdHex: ARC.chainIdHex, name: ARC.name, rpcUrl: ARC.rpcUrl, explorerUrl: ARC.explorerUrl, nativeCurrency: ARC.nativeCurrency });

export async function ensureArcWallet() {
  const p = WalletManager.getProvider();
  if (!p) throw new Error('Connect your wallet first.');
  if ((await walletChainId(p)) !== ARC.chainIdHex.toLowerCase()) await switchWalletChain(p, arcChainParams());
}

/** Send a transaction from the connected wallet and wait for it to be mined on Arc. Returns the hash. */
export async function runArcTx(to, data, onStatus) {
  await ensureArcWallet();
  const p = WalletManager.getProvider();
  if (onStatus) onStatus('Confirm in your wallet…');
  const hash = await p.request({ method: 'eth_sendTransaction', params: [{ from: WalletState.getAddr(), to, data }] });
  if (typeof hash !== 'string') throw new Error('Wallet did not return a transaction hash.');
  const link = { url: arcAltTxUrl(hash), label: 'View on Arcscan' };
  if (typeof showToast === 'function') showToast('Transaction pending', link);
  if (onStatus) onStatus('Waiting for Arc Testnet to confirm…');
  const receipt = await waitForReceipt(ARC.rpcUrl, hash);
  if (!receipt) throw new Error('The transaction is still pending. Check the explorer.');
  if (receipt.status !== 'success') { if (typeof showToast === 'function') showToast('Transaction failed', link); throw new Error('The transaction failed on the network.'); }
  if (typeof showToast === 'function') showToast('Transaction confirmed', link);
  return hash;
}

export async function allowanceOf(token, spender) {
  return readErc20Allowance(token, WalletState.getAddr(), spender);
}

/** Approve exactly `amount` (never unlimited). */
export async function approveExact(token, spender, amount, onStatus) {
  return runArcTx(token, encodeApprove(spender, amount), onStatus);
}
