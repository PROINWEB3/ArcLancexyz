// Wallet state (on-chain balances)
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { ARC, PEER_CHAINS } from '../config/chain-config';
import { effectiveStatus } from '../lib/invoice-due';
/* ══════════════════════════════════════
   WALLET STATE — با localStorage persistence
══════════════════════════════════════ */
const WalletState = (() => {
  const LS = {
    ADDR:        'arclance_wallet_addr',
    TX:          'arclance_tx_history',
    INV:         'arclance_invoices',
    BRIDGE:      'arclance_bridge_stats',
  };

  function _save() {
    try {
      localStorage.setItem(LS.TX,          JSON.stringify(_txHistory));
      localStorage.setItem(LS.INV,         JSON.stringify(_invoices));
      localStorage.setItem(LS.BRIDGE,      JSON.stringify(_bridgeStats));
      // eurc_credit only persisted by adjustTokenLocal (optimistic updates), not here
    } catch(e) { console.warn('localStorage save error:', e); }
  }

  function _load() {
    try {
      const tx = localStorage.getItem(LS.TX);    if (tx) _txHistory = JSON.parse(tx) || [];
      const inv = localStorage.getItem(LS.INV);  if (inv) { _invoices = JSON.parse(inv) || []; _recalcInvoiceStats(); }
      const br = localStorage.getItem(LS.BRIDGE);if (br) _bridgeStats = JSON.parse(br) || { volume:0, count:0, fees:0 };
      // eurc_credit from localStorage intentionally NOT loaded here to prevent stale balance inflation.
      // loadFromChain() always sets _eurcArc from real on-chain data.
    } catch(e) { console.warn('localStorage load error:', e); }
  }

  let _addr = localStorage.getItem('arclance_wallet_addr') || null;
  let _txHistory = [];
  let _invoices = [];
  let _bridgeStats = { volume: 0, count: 0, fees: 0 };
  let _invStats = { total: 0, paid: 0, pending: 0, overdue: 0, paidCount: 0, pendingCount: 0, overdueCount: 0 };

  _load();

  const TOKEN_CONTRACTS = { ...ARC.tokens };

  let _txCount = 0;
  const _decimalsCache = {};

  // ── Balance reads ────────────────────────────────────────────────────────────
  // Arc: native USDC (gas, 18 decimals) and the USDC ERC-20 interface (6 decimals) are ONE balance.
  // We read it once through the ERC-20 interface (balanceOf) and never call eth_getBalance for USDC.
  const SYMBOLS = ['USDC', 'EURC', 'cirBTC'];
  let _balances = { USDC: 0, EURC: 0, cirBTC: 0 };
  let _status = 'idle';        // idle | loading | ok | error | wrong-network
  let _statusMsg = '';
  let _chainIdHex = null;      // chain the wallet is currently on
  let _loadSeq = 0;            // ignore stale responses (account/chain switched mid-flight)
  let _peer = {};              // key -> { balance: number|null, error: string|null }
  let _peerAt = 0;
  let _peerAddr = null;

  // Reads go to Arc's public RPC first, so they do not depend on how the wallet's own
  // "Arc Testnet" network is configured (a wrong or stale wallet RPC returned empty data
  // and showed 0 for funded accounts). The wallet provider is only a fallback.
  async function _rpc(provider, method, params) {
    let publicErr = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const resp = await window.fetch(ARC.rpcUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
      });
      clearTimeout(timer);
      const j = await resp.json();
      if (j.error) throw new Error(j.error.message || 'RPC error');
      return j.result;
    } catch (e) {
      publicErr = e;
      console.warn(`[ArcLance Web3] Public RPC ${method} failed (${e.message}); falling back to wallet provider`);
    }
    if (!provider) throw publicErr;
    return provider.request({ method, params });
  }

  function _configuredDecimals(contractAddr) {
    const lower = contractAddr.toLowerCase();
    for (const sym of SYMBOLS) {
      if (ARC.tokens[sym].toLowerCase() === lower) return ARC.tokenDecimals[sym];
    }
    return null;
  }

  async function _fetchDecimals(provider, contractAddr) {
    if (_decimalsCache[contractAddr] !== undefined) return _decimalsCache[contractAddr];
    try {
      // Standard ERC-20 decimals() signature is 0x313ce567
      const res = await _rpc(provider, 'eth_call', [{ to: contractAddr, data: '0x313ce567' }, 'latest']);
      if (res && res !== '0x') {
        const decimals = parseInt(res, 16);
        if (!isNaN(decimals)) {
          _decimalsCache[contractAddr] = decimals;
          return decimals;
        }
      }
    } catch (e) {
      console.warn(`[ArcLance Web3] Failed to fetch decimals for ${contractAddr}:`, e.message);
    }
    // Fall back to the decimals recorded in chain-config (USDC 6, EURC 6, cirBTC 8)
    const configured = _configuredDecimals(contractAddr);
    if (configured === null) throw new Error(`Unknown decimals for ${contractAddr}`);
    _decimalsCache[contractAddr] = configured;
    return configured;
  }

  // Throws on RPC failure so an error is never shown as a zero balance.
  async function _fetchBalance(provider, addr, contractAddr) {
    const decimals = await _fetchDecimals(provider, contractAddr);
    const data = '0x70a08231' + addr.replace('0x','').toLowerCase().padStart(64,'0');
    const res = await _rpc(provider, 'eth_call', [{ to: contractAddr, data }, 'latest']);
    // balanceOf always returns 32 bytes. Anything shorter means the call failed: never treat it as zero.
    if (typeof res !== 'string' || res.length < 66) throw new Error(`Empty balanceOf response from ${contractAddr}`);
    const raw = BigInt(res);
    const base = 10n ** BigInt(decimals);
    return Number(raw / base) + Number(raw % base) / Number(base);
  }

  async function _fetchTxCount(provider, addr) {
    try {
      const res = await _rpc(provider, 'eth_getTransactionCount', [addr, 'latest']);
      return res ? parseInt(res, 16) : 0;
    } catch(e) { return 0; }
  }

  function _isArcChain(chainId) {
    if (!chainId) return false;
    const str = String(chainId).toLowerCase();
    return str === ARC.chainIdHex.toLowerCase() || str === String(ARC.chainId);
  }

  async function loadFromChain(addr) {
    _addr = addr;
    const seq = ++_loadSeq;
    if (!addr) {
      _balances = { USDC: 0, EURC: 0, cirBTC: 0 }; _txCount = 0;
      _status = 'idle'; _statusMsg = ''; _chainIdHex = null; _peer = {}; _peerAt = 0; _peerAddr = null;
      UISync.refresh(); return;
    }
    const provider = (typeof WalletManager !== 'undefined' && WalletManager.getProvider)
      ? WalletManager.getProvider() : window.ethereum;
    _status = 'loading'; UISync.refresh();
    try {
      // Verify chain first: contracts on the wrong chain would read as empty
      const chainId = provider ? await provider.request({ method: 'eth_chainId' }).catch(() => null) : null;
      if (seq !== _loadSeq) return;
      _chainIdHex = chainId;
      const wrongChain = !!chainId && !_isArcChain(chainId);
      if (wrongChain) console.warn(`[ArcLance Web3] Wallet is on chain ${chainId}, not ${ARC.name}. Balances still load from the ${ARC.name} RPC.`);
      const results = await Promise.allSettled([
        ...SYMBOLS.map(sym => _fetchBalance(provider, addr, ARC.tokens[sym])),
        _fetchTxCount(provider, addr)
      ]);
      if (seq !== _loadSeq) return;
      const next = { ..._balances };
      let failed = [];
      SYMBOLS.forEach((sym, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') next[sym] = r.value; else failed.push(sym);
      });
      _balances = next;
      if (results[SYMBOLS.length].status === 'fulfilled') _txCount = results[SYMBOLS.length].value;
      if (failed.length) {
        const firstErr = results[SYMBOLS.indexOf(failed[0])].reason;
        _status = 'error'; _statusMsg = `Could not read ${failed.join(', ')} balance (${(firstErr && firstErr.message) || 'RPC error'}).`;
      } else if (wrongChain) {
        _status = 'wrong-network'; _statusMsg = `Your wallet is on a different network. Switch to ${ARC.name} to send, swap or bridge.`;
      } else {
        _status = 'ok'; _statusMsg = '';
      }
      try { localStorage.removeItem('arclance_eurc_credit'); } catch(_) {}
      console.log(`[ArcLance Web3] Balances: USDC ${_balances.USDC} | EURC ${_balances.EURC} | cirBTC ${_balances.cirBTC}`);
      _save();
      if (Date.now() - _peerAt > 15000 || _peerAddr !== addr) { _peerAt = Date.now(); _peerAddr = addr; loadPeerBalances(addr); }
    } catch(e) {
      if (seq !== _loadSeq) return;
      console.warn('Chain fetch error:', e.message);
      _status = 'error'; _statusMsg = e.message || 'Could not read balances.';
    }
    UISync.refresh();
  }

  // ── Peer-chain USDC (Ethereum Sepolia, Base Sepolia) read from their public RPC ──
  async function loadPeerBalances(addr) {
    const who = addr || _addr;
    if (!who) { _peer = {}; return; }
    await Promise.all(PEER_CHAINS.map(async (c) => {
      try {
        const data = '0x70a08231' + who.replace('0x','').toLowerCase().padStart(64,'0');
        const resp = await window.fetch(c.rpcUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: c.usdc, data }, 'latest'] })
        });
        const j = await resp.json();
        if (j.error) throw new Error(j.error.message);
        const raw = BigInt(j.result && j.result !== '0x' ? j.result : '0x0');
        const base = 10n ** BigInt(c.usdcDecimals);
        _peer[c.key] = { balance: Number(raw / base) + Number(raw % base) / Number(base), error: null };
      } catch (e) {
        _peer[c.key] = { balance: null, error: e.message || 'RPC error' };
      }
    }));
    if (_peer.sepolia && _peer.sepolia.balance !== null) SepoliaBalances.set('USDC', _peer.sepolia.balance);
    UISync.refresh();
  }
  function getPeerBalance(key) { return _peer[key] || { balance: null, error: null }; }

  function getUSDC() { return _balances.USDC; }
  function getEURC() { return _balances.EURC; }
  function getCIRBTC() { return _balances.cirBTC; }
  function getStatus() { return { status: _status, message: _statusMsg, chainId: _chainIdHex }; }
  function isWrongNetwork() { return _status === 'wrong-network'; }

  // Adjustments are handled on-chain. Call triggerChainSync after tx confirmation to reload.
  function adjustUSDC(delta) { triggerChainSync(); }
  function adjustEURC(delta) { triggerChainSync(); }

  function getTokenBal(token, chain = 'ARC') {
    if (chain === 'SEP') {
      if (typeof SepoliaBalances !== 'undefined') {
        return SepoliaBalances.get(token);
      }
      return 0;
    }
    if (token === 'native_usdc') return _balances.USDC; // same balance, never a second asset
    return _balances[token] || 0;
  }
  function adjustToken(token, delta) {
    triggerChainSync();
  }

  async function _waitForTxToBeMined(provider, txHash) {
    if (!txHash) return;
    console.log(`[ArcLance Web3] Waiting for transaction ${txHash} to be mined...`);
    const startTime = Date.now();
    const timeout = 60000; // 60 seconds timeout
    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash]
        });
        if (receipt && receipt.blockNumber) {
          console.log(`[ArcLance Web3] Transaction ${txHash} mined in block ${parseInt(receipt.blockNumber, 16)}! Status: ${receipt.status}`);
          const status = receipt.status;
          const isReverted = status === '0x0' || status === 0 || status === 'reverted' || status === false;
          if (isReverted) {
            const err = new Error(`Transaction reverted on-chain (status 0x0). Hash: ${txHash}`);
            err.receipt = receipt;
            err.isReverted = true;
            throw err;
          }
          return receipt;
        }
      } catch (e) {
        if (e.isReverted || (e.message && e.message.includes('reverted'))) throw e;
        console.warn(`[ArcLance Web3] Error polling tx receipt:`, e);
      }
      await new Promise(r => setTimeout(r, 1500)); // Poll every 1.5 seconds
    }
    console.warn(`[ArcLance Web3] Transaction ${txHash} wait timed out.`);
    return null;
  }

  async function triggerChainSync(txHash) {
    const addr = _addr;
    if (!addr) return;
    const provider = (typeof WalletManager !== 'undefined' && WalletManager.getProvider)
      ? WalletManager.getProvider() : window.ethereum;
    if (!provider) return;
    
    // Always trigger an immediate fetch in case the node is super fast
    await loadFromChain(addr);

    if (txHash && provider) {
      console.log(`[ArcLance Web3] Initiating tx receipt poll for ${txHash}`);
      await _waitForTxToBeMined(provider, txHash);
    } else {
      // If no hash is passed, fall back to standard delay
      await new Promise(r => setTimeout(r, 1200));
    }
    
    // Fetch again after wait completes (or timeouts)
    await loadFromChain(addr);
    
    // Fetch one final time 3 seconds later just to account for any RPC indexing delay
    await new Promise(r => setTimeout(r, 3000));
    await loadFromChain(addr);
  }

  function addTx(tx) {
    _txHistory.unshift({ ...tx, id: Date.now(), timestamp: new Date().toISOString() });
    if (_txHistory.length > 100) _txHistory = _txHistory.slice(0, 100);
    _save();
    UISync.refreshHistory();
  }
  function getTxHistory(filter) { return filter ? _txHistory.filter(t => t.type === filter) : _txHistory; }

  function addInvoice(inv) {
    _invoices.unshift({ ...inv, id: Date.now(), createdAt: new Date().toISOString() });
    _recalcInvoiceStats();
    _save();
    UISync.refreshInvoices();
  }
  function _recalcInvoiceStats() {
    _invStats = { total: 0, paid: 0, pending: 0, overdue: 0, paidCount: 0, pendingCount: 0, overdueCount: 0 };
    _invoices.forEach(inv => {
      const amt = parseFloat(inv.amount) || 0;
      _invStats.total += amt;
      const status = effectiveStatus(inv); // a pending invoice past its due date counts as overdue
      if (status === 'paid')    { _invStats.paid += amt; _invStats.paidCount++; }
      else if (status === 'pending') { _invStats.pending += amt; _invStats.pendingCount++; }
      else if (status === 'overdue') { _invStats.overdue += amt; _invStats.overdueCount++; }
    });
  }
  // Add invoices read from a backup file. Existing invoices are never changed or removed.
  function importInvoices(list) {
    const taken = new Set(_invoices.map((i) => i.id));
    let added = 0;
    for (const inv of list) {
      let id = inv.id;
      while (taken.has(id)) id += 1;
      taken.add(id);
      _invoices.push({ ...inv, id });
      added++;
    }
    _invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    _recalcInvoiceStats();
    _save();
    UISync.refreshInvoices();
    return added;
  }
  function getInvoices() { return _invoices; }
  function getInvStats() { return _invStats; }

  function markInvoicePaid(idx) {
    if (_invoices[idx]) {
      _invoices[idx].status = 'paid';
      _recalcInvoiceStats();
      _save();
      UISync.refreshInvoices();
    }
  }

  function addBridgeStat(amount, fee) {
    _bridgeStats.volume += amount;
    _bridgeStats.count++;
    _bridgeStats.fees += fee;
    _save();
    UISync.refreshBridgeStats();
  }
  function getBridgeStats() { return _bridgeStats; }

  async function forceRefreshEURC() {
    if (_addr) await loadFromChain(_addr);
  }

  function setEURC(val) {
    _balances.EURC = val;
    _save();
    UISync.refresh();
  }

  function adjustTokenLocal(token, delta) {
    const key = token === 'native_usdc' ? 'USDC' : token;
    if (_balances[key] === undefined) return;
    _balances[key] = Math.max(0, _balances[key] + delta);
    _save();
    UISync.refresh();
  }

  const getAddr = () => _addr;
  const connected = () => !!_addr;
  const getTotalUSD = () => _balances.USDC * PriceFeed.usdc + _balances.EURC * PriceFeed.eurc + (PriceFeed.btc ? _balances.cirBTC * PriceFeed.btc : 0);
  const getOnChainTxCount = () => _txCount;



  return { save: _save, loadFromChain, loadPeerBalances, getPeerBalance, getStatus, isWrongNetwork, getUSDC, getEURC, getCIRBTC, setEURC, adjustUSDC, adjustEURC, getTokenBal, adjustToken, adjustTokenLocal, triggerChainSync, forceRefreshEURC, addTx, getTxHistory, addInvoice, importInvoices, getInvoices, getInvStats, addBridgeStat, getBridgeStats, getAddr, connected, getTotalUSD, getOnChainTxCount, markInvoicePaid };
})();


publish({ WalletState });
