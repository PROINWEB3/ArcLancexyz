// Transaction manager (send, swap, confirmations)
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { ARC, arcTxUrl } from '../config/chain-config';
/* ══════════════════════════════════════
   TX MANAGER (requires real wallet sig)
══════════════════════════════════════ */
const TxManager = (() => {
  const _guards = Object.create(null);
  const _timers = Object.create(null);

  const TOKEN_CONTRACTS = { ...ARC.tokens };

  // ── FX Escrow / StableFX contract (Arc Testnet) — uses RFQ settlement via Circle App Kit SDK ──

  // Universal waitForTransactionReceipt with explicit status checking (Requirement 11)
  async function waitForTransactionReceipt(provider, txHash, maxWaitMs = 120000) {
    if (!txHash) throw new Error('Transaction hash is required for receipt verification.');
    const start = Date.now();
    console.log(`[ArcLance Web3] Polling transaction receipt for ${txHash}...`);
    while (Date.now() - start < maxWaitMs) {
      try {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash]
        });
        if (receipt && receipt.blockNumber) {
          const status = receipt.status;
          console.log(`[ArcLance Web3] Transaction ${txHash} mined in block ${parseInt(receipt.blockNumber, 16)}! Status: ${status}`);
          // Requirement 11: Explicitly check receipt.status === 'success'. On Arc, reverts return status: 'reverted' / 0x0
          const isSuccess = status === 'success' || status === '0x1' || status === 1 || status === true;
          const isReverted = !isSuccess || status === 'reverted' || status === '0x0' || status === 0 || status === false;
          if (isReverted) {
            const err = new Error(`Transaction reverted on-chain (status: ${status || 'reverted'}). Hash: ${txHash}`);
            err.receipt = receipt;
            err.isReverted = true;
            throw err;
          }
          receipt.status = 'success';
          return receipt;
        }
      } catch (e) {
        if (e.isReverted || (e.message && e.message.includes('reverted'))) throw e;
        console.warn(`[ArcLance Web3] Receipt poll warning:`, e.message || e);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    throw new Error(`Transaction confirmation timed out after ${Math.round(maxWaitMs/1000)}s. Please check ${ARC.explorerUrl.replace(/^https?:\/\//, '')} for status.`);
  }
  window.waitForTransactionReceipt = waitForTransactionReceipt;
  const _waitForReceipt = waitForTransactionReceipt;

  // Gas overrides for Arc Network (Requirement 5)
  // On Arc, eth_estimateGas returns unreliable or null values — use explicit gas limit:
  // 600_000n for standard swaps and writeContract/sendTransaction, 5_000_000n for createPair
  // Plus >=30% gas price premium (gasPrice * 130n / 100n) on every transaction to prevent back-to-back failures
  const ARC_GAS_OVERRIDES = {
    CREATE_PAIR: {
      number: 5000000,
      bigint: 5000000n,
      hex: '0x4c4b40'
    },
    STANDARD: {
      number: 600000,
      bigint: 600000n,
      hex: '0x927c0'
    }
  };

  function getArcGasOverride(data) {
    if (data && typeof data === 'string') {
      const d = data.toLowerCase().replace(/^0x/, '');
      // createPair(address,address) selector: c9c65396
      if (d.startsWith('c9c65396')) {
        return ARC_GAS_OVERRIDES.CREATE_PAIR;
      }
    }
    return ARC_GAS_OVERRIDES.STANDARD;
  }

  async function getGasPriceWithPremium(target) {
    try {
      const gp = await target.request({ method: 'eth_gasPrice' });
      if (gp && gp !== '0x' && gp !== '0x0') {
        const rawGp = BigInt(gp);
        const premiumGp = (rawGp * 130n) / 100n; // >=30% premium
        return '0x' + premiumGp.toString(16);
      }
    } catch (e) {
      console.warn('[Arc Gas Override] Could not query gasPrice, using fallback premium:', e);
    }
    return '0x4d34300'; // fallback ~1.3 gwei
  }

  function wrapArcProviderForGasOverrides(baseProvider) {
    if (!baseProvider || baseProvider.__arcGasOverrideWrapped) return baseProvider;
    return new Proxy(baseProvider, {
      get(target, prop, receiver) {
        if (prop === '__arcGasOverrideWrapped') return true;
        if (prop === 'request') {
          return async function(args) {
            if (!args) return target.request(args);
            const method = args.method;
            const params = args.params ? [...args.params] : [];

            // Override eth_estimateGas on Arc with explicit limits (600_000n)
            if (method === 'eth_estimateGas') {
              const txObj = params[0] || {};
              const override = getArcGasOverride(txObj.data);
              console.log(`[Arc Gas Override] Overriding eth_estimateGas with ${override.number} (${override.hex})`);
              return override.hex;
            }

            // Override eth_sendTransaction on Arc with explicit gas limit (600_000n) and >=30% premium
            if (method === 'eth_sendTransaction' && params[0]) {
              const txObj = { ...params[0] };
              const override = getArcGasOverride(txObj.data);
              txObj.gas = override.hex;
              txObj.gasLimit = override.hex;
              try {
                const premiumPrice = await getGasPriceWithPremium(target);
                txObj.gasPrice = premiumPrice;
              } catch (_) {}
              console.log(`[Arc Gas Override] Injected gas limit ${override.hex} (600k) & gasPrice premium ${txObj.gasPrice}`);
              return target.request({ ...args, params: [txObj, ...params.slice(1)] });
            }

            return target.request(args);
          };
        }
        const val = Reflect.get(target, prop, receiver);
        return typeof val === 'function' ? val.bind(target) : val;
      }
    });
  }

  // Prevent swap routing USDC → native USDC.
  // On Arc, native and ERC-20 USDC are the same asset (same pool).
  function isSameUSDCPair(tokenIn, tokenOut) {
    const norm = t => (t || '').toString().trim().toLowerCase();
    const a = norm(tokenIn);
    const b = norm(tokenOut);
    if (!a || !b) return false;
    if (a === b) return true;
    const isUSDCVariant = t => (
      t === 'usdc' ||
      t === 'native usdc' ||
      t === 'native_usdc' ||
      t === 'native' ||
      t === 'erc20 usdc' ||
      t === 'erc-20 usdc' ||
      t === ARC.tokens.USDC
    );
    return isUSDCVariant(a) && isUSDCVariant(b);
  }
  window.isSameUSDCPair = isSameUSDCPair;

  async function _sendNativeTx(provider, to, amountInUSDC) {
    const addr = WalletState.getAddr();
    const USDC_CONTRACT = ARC.tokens.USDC;
    // Use 6 decimals for ERC-20 interface
    const amountHex = BigInt(Math.round(amountInUSDC * 1e6)).toString(16).padStart(64, '0');
    const toHex = to.replace('0x','').toLowerCase().padStart(64, '0');
    const data = '0xa9059cbb' + toHex + amountHex;
    const params = [{
      from: addr,
      to: USDC_CONTRACT,
      data: data,
      value: '0x0'
    }];
    return await provider.request({ method: 'eth_sendTransaction', params });
  }

  async function _sendTokenTx(provider, tokenContract, to, amount) {
    const addr = WalletState.getAddr();
    const toClean = to.replace('0x','').toLowerCase().padStart(64, '0');
    // Decimals come from chain-config (USDC 6, EURC 6, cirBTC 8). Unknown token = refuse to send.
    const symbol = Object.keys(ARC.tokens).find(k => ARC.tokens[k].toLowerCase() === String(tokenContract).toLowerCase());
    if (!symbol) throw new Error('Unsupported token contract. Only USDC, EURC and cirBTC can be sent.');
    const decimals = ARC.tokenDecimals[symbol];
    const [whole, frac = ''] = Number(amount).toFixed(decimals).split('.');
    const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
    const valHex = units.toString(16).padStart(64, '0');
    const data = '0xa9059cbb' + toClean + valHex;
    const params = [{
      from: addr,
      to: tokenContract,
      data: data,
      value: '0x0'
    }];
    return await provider.request({ method: 'eth_sendTransaction', params });
  }

  function _setState(btnId, contentId, state, base) {
    const btn = document.getElementById(btnId);
    const cnt = document.getElementById(contentId);
    if (!btn || !cnt) return;
    if (_timers[btnId]) { clearTimeout(_timers[btnId]); delete _timers[btnId]; }
    btn.disabled = ['awaiting','submitted','confirming'].includes(state);
    btn.classList.toggle('loading', ['submitted','confirming'].includes(state));
    if (state==='awaiting') cnt.innerHTML='<div class="spinner"></div> Sign in wallet…';
    else if (state==='submitted') cnt.innerHTML='<div class="spinner"></div> Submitted…';
    else if (state==='confirming') cnt.innerHTML='<div class="spinner"></div> Confirming…';
    else if (state==='confirmed') { cnt.innerHTML=`✓ ${base}`; _timers[btnId]=setTimeout(()=>{cnt.innerHTML=base;btn.disabled=false;},4000); }
    else if (state==='failed') { cnt.innerHTML='✕ Retry'; _timers[btnId]=setTimeout(()=>{cnt.innerHTML=base;btn.disabled=false;},4000); }
    else cnt.innerHTML=base;
  }

  // Never send funds to an address that has no contract code (would be a plain transfer to an unknown wallet).
  async function _assertContract(provider, address, label) {
    const code = await provider.request({ method: 'eth_getCode', params: [address, 'latest'] }).catch(() => null);
    if (!code || code === '0x') {
      throw new Error(`${label} (${address}) has no contract code on ${ARC.name}. Action blocked to protect your funds.`);
    }
  }

  function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }
  function mkHash() { return '0x'+Array.from({length:64},()=>(Math.random()*16|0).toString(16)).join(''); }
  function errMsg(e) { if(!e) return 'Unknown error'; if(e.code===4001||e.code===-32603) return 'Transaction rejected in wallet.'; return e.message || 'Something went wrong.'; }

  function requireWallet() {
    if (!WalletState.connected()) { showToast('Connect your wallet first'); WalletManager.openModal(); return false; }
    return true;
  }

  
  // ── Arc Testnet Official Contract Addresses (from docs.arc.io) ──
  // USDC: 0x3600000000000000000000000000000000000000 (6 decimals ERC-20 interface)
  // EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a (6 decimals)
  // CCTP TokenMessengerV2: 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA

  const kit = {
    // ── SEND — raw ERC-20 transfer via EIP-1193 provider ──
    send: async ({ from, to, amount, token }) => {
      const provider = WalletManager.getProvider() || window.ethereum;
      const contract = TOKEN_CONTRACTS[token] || token;
      if (!contract) throw new Error(`Unsupported token: ${token}`);
      return await _sendTokenTx(provider, contract, to, parseFloat(amount));
    },

  };

  async function sendPayment() {
    if (!requireWallet()) return;
    if (_guards['send']) return;
    const amount = parseFloat(document.getElementById('payAmount')?.value) || 0;
    let recipient = document.getElementById('payRecipient')?.value?.trim() || '';
    const token = document.getElementById('payToken')?.value || 'USDC';
    
    // Feature 16: Allow clients to pay by @username directly
    if (recipient.startsWith('@') || (!recipient.startsWith('0x') && typeof resolveUsername === 'function' && resolveUsername(recipient))) {
      const resolved = resolveUsername(recipient);
      if (resolved) {
        recipient = resolved;
      } else {
        showToast('Username not found in Arc registry');
        return;
      }
    }
    if (!recipient) { showToast('Enter a recipient address or a username saved in this browser'); return; }
    { const v = validateRecipient(recipient); if (!v.ok) { showToast(v.reason); return; } }
    if (amount <= 0) { showToast('Enter an amount'); return; }
    
    const tokenBal = WalletState.getTokenBal(token, 'ARC');
    if (amount > tokenBal) { showToast(`Insufficient ${token} balance on Arc Testnet`); return; }
    
    if (!(await confirmSendSummary({ token, amount, recipient }))) return;
    _guards['send'] = true;
    const base = `SEND ${token} ON ARC`;
    try {
      _setState('sendPayBtn','sendPayBtnContent','awaiting',base);
      const sendProvider = WalletManager.getProvider();
      if (!sendProvider) throw new Error("No wallet connected");

      const txHash = await kit.send({
        from: { adapter: { provider: sendProvider }, chain: "Arc_Testnet" },
        to: recipient,
        amount: amount.toString(),
        token: token
      });

      _setState('sendPayBtn','sendPayBtnContent','submitted',base);
      WalletState.addTx({ id: txHash, type: 'send', label: `Sent ${amount} ${token} to ${recipient.slice(0,6)}...${recipient.slice(-4)}`, timestamp: new Date().toISOString(), display: `-${amount.toFixed(2)} ${token}` });
      _setState('sendPayBtn','sendPayBtnContent','confirmed',base);
      trackTxToast(txHash, `Send ${amount} ${token}`, { receipt: { amount, token, sender: WalletState.getAddr(), recipient } });
      WalletState.triggerChainSync(txHash);
    } catch(e) {
      _setState('sendPayBtn','sendPayBtnContent','failed',base);
      showToast('' + errMsg(e));
    } finally {
      _guards['send'] = false;
    }
  }

  async function createInvoice() {
    if (!requireWallet()) return;
    if (_guards['invoice']) return;
    const client = document.getElementById('inv-client')?.value?.trim();
    const yourName = document.getElementById('inv-your-name')?.value?.trim();
    const number = document.getElementById('inv-number')?.value?.trim();
    const amount = document.getElementById('inv-amount')?.value;
    const status = 'pending';
    const due = document.getElementById('inv-due')?.value;
    const desc = document.getElementById('inv-desc')?.value;
    const addr = document.getElementById('inv-addr')?.value?.trim() || WalletState.getAddr();
    const isEscrow = document.getElementById('inv-escrow-toggle')?.checked || false;
    if (!client || !number || !amount) { showToast('Fill in client, invoice # and amount'); return; }
    _guards['invoice'] = true;
    const base = 'CREATE INVOICE';
    try {
      _setState('invBtn','invBtnContent','awaiting',base);
      showToast('Sign invoice in your wallet to confirm…');
      const provider = WalletManager.getProvider(); if (!provider) throw new Error('No wallet connected');
      const msg = `ArcLance Invoice ${number}: ${amount} USDC for ${client} ${isEscrow ? '[Escrow tag]' : ''} — ${desc || 'No description'}`;
      const hexMsg = '0x' + Array.from(new TextEncoder().encode(msg)).map(b=>b.toString(16).padStart(2,'0')).join('');
      const sig = await provider.request({ method: 'personal_sign', params: [hexMsg, WalletState.getAddr()] });
      _setState('invBtn','invBtnContent','submitted',base);
      showToast('Generating invoice…');
      await delay(800);
      _setState('invBtn','invBtnContent','confirmed',base);
      WalletState.addInvoice({
        client,
        yourName,
        number,
        amount,
        status,
        due,
        desc,
        walletAddr: addr,
        isEscrow: isEscrow,
        escrowStatus: isEscrow ? 'Escrow tag (local)' : null,
        sig: sig.slice(0,12)+'…'
      });
      showToast(`Invoice ${number} created!${isEscrow ? ' (Escrow Active)' : ''}`);
      ['inv-client','inv-your-name','inv-number','inv-amount','inv-desc'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    } catch(e) {
      _setState('invBtn','invBtnContent','failed',base);
      showToast('' + errMsg(e));
    } finally { _guards['invoice'] = false; }
  }

  function toggleEscrowNotice(checked) {
    const notice = document.getElementById('escrowNotice');
    const bg = document.getElementById('escrowToggleBg');
    const dot = document.getElementById('escrowToggleDot');
    if (notice) notice.style.display = checked ? 'block' : 'none';
    if (bg) bg.style.backgroundColor = checked ? 'var(--yellow)' : '#2a2f45';
    if (dot) dot.style.left = checked ? '23px' : '3px';
  }
  window.toggleEscrowNotice = toggleEscrowNotice;

  async function releaseEscrowInvoice(idx) {
    const invs = WalletState.getInvoices();
    const inv = invs[idx];
    if (!inv) return;
    showToast(`⏳ Releasing escrow for Invoice #${inv.number} on Arc Testnet…`);
    await delay(1000);
    inv.escrowStatus = 'Released to Freelancer';
    inv.status = 'paid';
    WalletState.addTx({
      type: 'send',
      label: `Escrow Released: #${inv.number}`,
      display: `+${inv.amount} USDC`,
      status: 'confirmed'
    });
    UISync.refreshInvoices();
    showToast(`Invoice #${inv.number} marked as released. This is a record in this browser; no funds moved.`);
  }
  window.releaseEscrowInvoice = releaseEscrowInvoice;

  async function disputeEscrowInvoice(idx) {
    const invs = WalletState.getInvoices();
    const inv = invs[idx];
    if (!inv) return;
    showToast(`Dispute noted on Invoice #${inv.number}. This is a record in this browser only.`);
    inv.escrowStatus = 'Disputed (local note)';
    UISync.refreshInvoices();
  }
  window.disputeEscrowInvoice = disputeEscrowInvoice;

  async function payInvoice(idx) {
    if (!requireWallet()) return;
    const invs = WalletState.getInvoices();
    const inv = invs[idx];
    if (!inv || inv.status === 'paid') return;
    const amount = parseFloat(inv.amount) || 0;
    if (amount <= 0) { showToast('Invalid invoice amount'); return; }
    if (WalletState.getTokenBal('USDC', 'ARC') < amount + 0.12) { showToast(`Insufficient USDC. Need ${(amount+0.12).toFixed(2)} USDC`); return; }
    try {
      showToast('Sign invoice payment in your wallet…');
      const provider = WalletManager.getProvider(); if (!provider) throw new Error("No wallet connected");
      const recipient = inv.walletAddr || WalletState.getAddr();

      // Execute a real native USDC transaction
      const txHash = await _sendNativeTx(provider, recipient, amount);

      let recorded = false, reverted = false;
      const undo = () => {
        inv.status = 'pending';
        const row = WalletState.getTxHistory().find((t) => t.hash === txHash); if (row) row.status = 'failed';
        WalletState.save(); UISync.refreshInvoices(); UISync.refreshHistory();
      };
      trackTxToast(txHash, `Invoice ${inv.number} payment`, { receipt: { amount, token: 'USDC', sender: WalletState.getAddr(), recipient }, onRetry: () => payInvoice(idx), onFail: () => { reverted = true; if (recorded) undo(); } });
      await delay(1000);
      inv.status = 'paid';
      WalletState.addTx({ type:'send', label:`Invoice ${inv.number} payment`, display:`-${amount} USDC`, to: recipient, hash: txHash, status:'confirmed' });
      UISync.refreshInvoices();
      recorded = true; if (reverted) undo();
      WalletState.triggerChainSync(txHash);
    } catch(e) {
      failToast(`Invoice ${inv.number} payment`, e, () => payInvoice(idx));
    }
  }

  return { sendPayment, wrapArcProvider: wrapArcProviderForGasOverrides, waitForReceipt: waitForTransactionReceipt, createInvoice, payInvoice, _sendNativeTx, _sendTokenTx };
})();


publish({ TxManager });
