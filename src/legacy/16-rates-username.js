// Exchange rates and usernames
import { publish } from './publish.js';
import { buildPayLink } from './lib-paylink.js';
import { ARC, USERNAME_REGISTRY_ADDRESS, arcAltTxUrl } from '../config/chain-config';
import { USERNAME_REGISTRY_ABI } from '../contracts/username-registry-abi';
import { readContract, encodeCall } from '../lib/contract';
import { runArcTx } from './lib-tx.js';

// Dynamic Exchange Rates cache updated live from CORS API
// No built-in rates. Values come from a live source; until one loads they stay null and previews show a dash.
const ExchangeRates = { PKR: null, INR: null, BDT: null, NGN: null };
const RateStatus = { updatedAt: null, failed: false, loading: true };

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const RESERVED_NAMES = new Set(['arc', 'circle', 'usdc', 'eurc', 'admin', 'support', 'arclance']);

let onChainMyUsername = '';
let onChainLookupSeq = 0;

export function getRegistryAddress() {
  const override = typeof window !== 'undefined' ? window.__ARCLANCE_USERNAME_REGISTRY__ : '';
  if (typeof override === 'string' && /^0x[0-9a-fA-F]{40}$/.test(override.trim())) {
    return override.trim();
  }
  return USERNAME_REGISTRY_ADDRESS || '';
}

export function isRegistryConfigured() {
  return Boolean(getRegistryAddress());
}

export function formatShortAddr(addr) {
  if (!addr || typeof addr !== 'string' || addr.length < 10) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function validateRegistryName(raw) {
  const name = String(raw ?? '').trim().replace(/^@/, '');
  if (name.length < 3 || name.length > 20) {
    return { ok: false, name, reason: 'Invalid username: length must be 3 to 20 characters.' };
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    return { ok: false, name, reason: 'Invalid username: cannot start or end with a hyphen.' };
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { ok: false, name, reason: 'Invalid username: only lowercase a-z, digits 0-9, and hyphens (-) are allowed.' };
  }
  return { ok: true, name, reason: '' };
}

/**
 * Resolve a username ONLY via the on-chain UsernameRegistry.resolve(name) view call on Arc Testnet RPC.
 * Never reads from localStorage or ?u= display labels.
 */
export async function resolveNameOnChain(rawName) {
  const regAddr = getRegistryAddress();
  const clean = String(rawName ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!regAddr) {
    return { ok: false, name: clean, address: null, shortAddress: '', reason: 'Username registry not configured' };
  }
  if (!validateRegistryName(clean).ok) {
    return { ok: false, name: clean, address: null, shortAddress: '', reason: 'Name not registered' };
  }
  try {
    const owner = await readContract(regAddr, USERNAME_REGISTRY_ABI, 'resolve', [clean]);
    const addr = typeof owner === 'string' ? owner.trim() : '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr) || addr.toLowerCase() === ZERO_ADDR) {
      return { ok: false, name: clean, address: null, shortAddress: '', reason: 'Name not registered' };
    }
    return { ok: true, name: clean, address: addr, shortAddress: formatShortAddr(addr), reason: '' };
  } catch (err) {
    return {
      ok: false,
      name: clean,
      address: null,
      shortAddress: '',
      reason: 'Name not registered',
      rpcError: true,
      errorMessage: err?.message || String(err),
    };
  }
}

function decodeRegistryError(err, candidateName = '') {
  const raw = String(err?.shortMessage || err?.message || err || '');
  if (err?.code === 4001 || /user rejected|action_rejected/i.test(raw)) {
    return 'Transaction rejected in wallet.';
  }
  if (/InvalidName/i.test(raw)) {
    return 'Invalid username: use 3–20 lowercase letters (a-z), digits (0-9), or internal hyphens.';
  }
  if (/NameReserved/i.test(raw)) {
    return `Username @${candidateName || 'name'} is reserved and cannot be registered.`;
  }
  if (/NameTaken/i.test(raw)) {
    return `Username @${candidateName || 'name'} is already taken.`;
  }
  if (/AlreadyHasName/i.test(raw)) {
    return 'This wallet already has a registered username. Release it first.';
  }
  if (/NoNameRegistered/i.test(raw)) {
    return 'No username is currently registered to this wallet.';
  }
  return raw || 'Transaction failed on Arc Testnet.';
}

function setUsernameStatus(text, kind = 'info') {
  const tab = document.getElementById('tab-username');
  if (!tab) return;
  let el = document.getElementById('username-reg-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'username-reg-status';
    el.setAttribute('role', 'status');
    el.style.cssText = 'display:none;font-size:12px;margin-bottom:12px;padding:8px 12px;border-radius:8px;line-height:1.5';
    const regBtn = document.getElementById('regBtn');
    if (regBtn && regBtn.parentElement === tab) {
      tab.insertBefore(el, regBtn);
    } else {
      tab.appendChild(el);
    }
  }
  if (!text) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  if (kind === 'error') {
    el.style.background = 'rgba(239,68,68,0.1)';
    el.style.border = '1px solid rgba(239,68,68,0.3)';
    el.style.color = 'var(--red)';
  } else if (kind === 'ok') {
    el.style.background = 'rgba(0,230,118,0.1)';
    el.style.border = '1px solid rgba(0,230,118,0.3)';
    el.style.color = 'var(--green)';
  } else {
    el.style.background = 'rgba(245,197,24,0.08)';
    el.style.border = '1px solid rgba(245,197,24,0.25)';
    el.style.color = 'var(--yellow)';
  }
  el.textContent = text;
}

function syncUsernameTabCopy() {
  const tab = document.getElementById('tab-username');
  if (!tab) return;
  const configured = isRegistryConfigured();
  const backupNote = document.getElementById('username-backup-note');
  if (configured) {
    if (backupNote) backupNote.style.display = 'none';
    const intro = document.getElementById('username-tab-intro') || tab.querySelector('div');
    if (intro && intro.id !== 'username-backup-note' && !intro.classList.contains('form-group')) {
      intro.id = 'username-tab-intro';
      intro.textContent = 'Register an on-chain @username on Arc Testnet so clients can pay you with a short name instead of a 42-character wallet address. Names are first-come-first-served (one per wallet) and can be released by the owner at any time.';
    }
    const infoBox = tab.querySelector('.info-box');
    if (infoBox) {
      infoBox.innerHTML = `
        <div class="info-row"><span class="k">Registration fee</span><span class="v green">Free (no protocol fee)</span></div>
        <div class="info-row"><span class="k">Gas fee</span><span class="v green">Paid in USDC on Arc Testnet</span></div>
        <div class="info-row"><span class="k">Recorded on</span><span class="v yellow">Arc Testnet (${formatShortAddr(getRegistryAddress())})</span></div>
      `;
    }
    const cnt = document.getElementById('regBtnContent');
    const btn = document.getElementById('regBtn');
    if (cnt && btn && !btn.disabled && cnt.textContent === 'SAVE USERNAME') {
      cnt.textContent = 'REGISTER USERNAME';
    }
    const linkNotePaylink = document.querySelector('[data-insert-id="link-note-paylink"]');
    if (linkNotePaylink) linkNotePaylink.style.display = 'none';
  } else {
    if (backupNote) backupNote.style.display = '';
  }
}

// Helper: fetch with automatic retry and boolean flag cancellation (Requirement 7)
// Remove AbortSignal from payloads as it cannot be cloned across postMessage and crashes workers/iframes.
async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 1500) {
  let cancelled = false;
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (cancelled) break;
    try {
      const { signal, ...cleanOptions } = options || {};
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          cancelled = true;
          reject(new Error('Rate fetch timeout'));
        }, 10000);
      });
      const fetchPromise = fetch(url, cleanOptions);
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      return response;
    } catch (err) {
      console.warn(`Attempt ${attempt} failed:`, err.message);
      if (attempt === retries) {
        throw new Error(`Maximum retry attempts exceeded: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
}

// 1. Live Exchange Rates Fetching from API (Requirement 7)
async function fetchLiveExchangeRates() {
  let cancelled = false;
  try {
    const res = await fetchWithRetry('https://open.er-api.com/v6/latest/USD');
    if (cancelled) return;
    if (res && res.ok) {
      const data = await res.json();
      if (cancelled) return;
      if (data && data.rates) {
        const rates = ['PKR', 'INR', 'BDT', 'NGN'];
        rates.forEach(curr => {
          if (data.rates[curr]) {
            ExchangeRates[curr] = data.rates[curr];
            if (typeof LocalRates !== 'undefined') {
              LocalRates[curr] = data.rates[curr];
            }
          }
        });
        RateStatus.updatedAt = new Date(); RateStatus.failed = false; RateStatus.loading = false;
        
        // Restore live conversion values immediately from 0 to real numbers
        if (typeof updateLocalCurrencies === 'function') {
          const usdcBal = (typeof WalletState !== 'undefined' && WalletState.getUSDC) ? WalletState.getUSDC() : 0;
          updateLocalCurrencies(usdcBal > 0 ? usdcBal : 1);
        }
        if (typeof updateInvLocalCurrency === 'function') updateInvLocalCurrency();
      }
    }
  } catch (err) {
    RateStatus.failed = true; RateStatus.loading = false;
  } finally {
    if (typeof renderRateNotes === 'function') renderRateNotes();
    if (RateStatus.failed && !RateStatus.updatedAt) {
      // no rate at all: show a dash instead of a stale or invented number
      if (typeof updateLocalCurrencies === 'function') updateLocalCurrencies();
      if (typeof updateInvLocalCurrency === 'function') updateInvLocalCurrency();
    }
  }
}

// 2. Resolve Usernames (demo fallback when VITE_USERNAME_REGISTRY_ADDRESS is empty)
function resolveUsername(username) {
  if (!username) return null;
  if (isRegistryConfigured()) return null;
  const clean = username.replace('@', '').trim().toLowerCase();
  
  // Local storage custom usernames registry
  const registry = JSON.parse(localStorage.getItem('arclance_usernames') || '{}');
  if (registry[clean]) return registry[clean];
  
  // Default seeded custom registry mappings
  const defaults = {
    'alice': '0x742d35Cc6634C0532925a3b84c157224f285890',
    'bob': '0x0000000000000000000000000000000000000002',
    'clara': '0x2222222222222222222222222222222222222222',
    'ali-hassan': '0x5D448c58253CDD8C84318c5e63E7c963286F634A'
  };
  return defaults[clean] || null;
}

// 3. Register Username (on-chain when VITE_USERNAME_REGISTRY_ADDRESS is set; browser demo fallback when empty)
async function registerUsernameOnChain(username) {
  syncUsernameTabCopy();
  if (!WalletState.connected()) { showToast('Connect your wallet first'); return; }

  const regAddr = getRegistryAddress();
  if (regAddr) {
    const rawInput = username !== undefined ? username : document.getElementById('reg-username')?.value;
    const check = validateRegistryName(rawInput);
    if (!check.ok) {
      setUsernameStatus(check.reason, 'error');
      showToast(check.reason);
      return;
    }
    const clean = check.name;
    if (RESERVED_NAMES.has(clean)) {
      const msg = `Username @${clean} is reserved and cannot be registered.`;
      setUsernameStatus(msg, 'error');
      showToast(msg);
      return;
    }

    const btn = document.getElementById('regBtn');
    const cnt = document.getElementById('regBtnContent');
    const myAddr = WalletState.getAddr();

    try {
      if (btn && cnt) { btn.disabled = true; cnt.innerHTML = '<div class="spinner"></div> Checking…'; }
      setUsernameStatus(`Checking @${clean} on Arc Testnet…`, 'info');

      const [reservedOnChain, existingOwner, currentWalletName] = await Promise.all([
        readContract(regAddr, USERNAME_REGISTRY_ABI, 'isReserved', [clean]).catch(() => false),
        readContract(regAddr, USERNAME_REGISTRY_ABI, 'resolve', [clean]),
        readContract(regAddr, USERNAME_REGISTRY_ABI, 'nameOf', [myAddr]),
      ]);

      if (reservedOnChain) {
        const msg = `Username @${clean} is reserved and cannot be registered.`;
        setUsernameStatus(msg, 'error');
        showToast(msg);
        return;
      }
      if (typeof existingOwner === 'string' && existingOwner.toLowerCase() !== ZERO_ADDR) {
        const msg = existingOwner.toLowerCase() === String(myAddr).toLowerCase()
          ? `You already own @${clean} (${formatShortAddr(existingOwner)}).`
          : `Username @${clean} is already taken by ${formatShortAddr(existingOwner)}.`;
        setUsernameStatus(msg, 'error');
        showToast(msg);
        return;
      }
      if (typeof currentWalletName === 'string' && currentWalletName.length > 0) {
        const msg = `This wallet already owns @${currentWalletName}. Release it first before registering another username.`;
        setUsernameStatus(msg, 'error');
        showToast(msg);
        return;
      }

      const data = encodeCall(USERNAME_REGISTRY_ABI, 'register', [clean]);
      const txHash = await runArcTx(regAddr, data, (st) => {
        if (cnt) cnt.innerHTML = `<div class="spinner"></div> ${st}`;
        setUsernameStatus(st, 'info');
      });

      onChainMyUsername = clean;
      const inputEl = document.getElementById('reg-username');
      if (inputEl) inputEl.value = '';
      setUsernameStatus(`✓ @${clean} (${formatShortAddr(myAddr)}) is now registered on Arc Testnet.`, 'ok');
      showToast(`Username @${clean} recorded on Arc Testnet`, { url: arcAltTxUrl(txHash), label: 'View on Arcscan' });
      await updateUsernameUI();
      WalletState.triggerChainSync(txHash);
    } catch (err) {
      const msg = decodeRegistryError(err, clean);
      setUsernameStatus(msg, 'error');
      showToast('Username registration failed: ' + msg);
    } finally {
      if (btn && cnt) { btn.disabled = false; cnt.textContent = 'REGISTER USERNAME'; }
    }
    return;
  }

  // Fallback demo behavior when VITE_USERNAME_REGISTRY_ADDRESS is empty
  const clean = username.replace('@', '').trim().replace(/\s+/g,'-').toLowerCase();
  if (clean.length < 3) { showToast('Username must be at least 3 characters'); return; }
  
  // Check if username is already taken
  const resolved = resolveUsername(clean);
  if (resolved) { showToast('Username already registered!'); return; }
  
  const provider = WalletManager.getProvider();
  if (!provider) return;
  
  const btn = document.getElementById('regBtn');
  const cnt = document.getElementById('regBtnContent');
  
  try {
    if (btn && cnt) { btn.disabled = true; cnt.innerHTML = '<div class="spinner"></div> Signing...'; }
    showToast('Sign username registration in your wallet...');

    // Sign a message to prove ownership — no fee transfer to 3rd party address
    const msg = `ArcLance Username Registration: @${clean} | Address: ${WalletState.getAddr()} | Timestamp: ${Date.now()}`;
    const hexMsg = '0x' + Array.from(new TextEncoder().encode(msg)).map(b => b.toString(16).padStart(2,'0')).join('');
    await provider.request({ method: 'personal_sign', params: [hexMsg, WalletState.getAddr()] });

    showToast('⏳ Saving your username in this browser…');
    await new Promise(r => setTimeout(r, 1200));

    // Save to local storage registry
    const registry = JSON.parse(localStorage.getItem('arclance_usernames') || '{}');
    registry[clean] = WalletState.getAddr();
    localStorage.setItem('arclance_usernames', JSON.stringify(registry));

    // Save user's own registered username
    localStorage.setItem('arclance_my_username', clean);

    showToast(`Username @${clean} saved in this browser. It is not recorded on-chain.`);
    updateUsernameUI();
    WalletState.triggerChainSync();
  } catch (err) {
    showToast('Username registration failed: ' + (err.message || err));
  } finally {
    if (btn && cnt) { btn.disabled = false; cnt.textContent = 'SAVE USERNAME'; }
  }
}

async function releaseUsernameOnChain() {
  const regAddr = getRegistryAddress();
  if (!regAddr) return;
  if (!WalletState.connected()) { showToast('Connect your wallet first'); return; }

  const btn = document.getElementById('releaseUsernameBtn');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Releasing…'; }
    setUsernameStatus('Confirm release transaction in your wallet…', 'info');
    const data = encodeCall(USERNAME_REGISTRY_ABI, 'release', []);
    const txHash = await runArcTx(regAddr, data, (st) => {
      setUsernameStatus(st, 'info');
    });
    const prev = onChainMyUsername;
    onChainMyUsername = '';
    setUsernameStatus(`✓ Released ${prev ? '@' + prev : 'username'} on Arc Testnet.`, 'ok');
    showToast('Username released on Arc Testnet', { url: arcAltTxUrl(txHash), label: 'View on Arcscan' });
    await updateUsernameUI();
    WalletState.triggerChainSync(txHash);
  } catch (err) {
    const msg = decodeRegistryError(err);
    setUsernameStatus(msg, 'error');
    showToast('Release failed: ' + msg);
    if (btn) { btn.disabled = false; btn.textContent = 'Release Username'; }
  }
}
window.releaseUsernameOnChain = releaseUsernameOnChain;

// 4. Update Username UI Displays (Feature 16)
async function updateUsernameUI() {
  syncUsernameTabCopy();
  const displayBox = document.getElementById('my-username-display');
  const valEl = document.getElementById('my-username-value');

  if (isRegistryConfigured()) {
    const regAddr = getRegistryAddress();
    const myAddr = (typeof WalletState !== 'undefined' && WalletState.getAddr()) || '';
    if (!myAddr) {
      onChainMyUsername = '';
      if (displayBox) {
        delete displayBox.dataset.link;
        displayBox.innerHTML = `
          <span style="font-size:12px;color:var(--text2)">Your Registered Username:</span>
          <div style="font-size:18px;font-weight:800;color:var(--text3);margin-top:4px" id="my-username-value">Connect wallet to view</div>
        `;
      }
      return;
    }

    const seq = ++onChainLookupSeq;
    try {
      const chainName = await readContract(regAddr, USERNAME_REGISTRY_ABI, 'nameOf', [myAddr]);
      if (seq !== onChainLookupSeq) return;
      const myUser = typeof chainName === 'string' ? chainName.trim() : '';
      onChainMyUsername = myUser;

      if (myUser && displayBox) {
        const payUrl = buildPayLink(myUser);
        const shortMe = formatShortAddr(myAddr);
        displayBox.dataset.link = `${payUrl}|${myAddr}`;
        displayBox.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:12px;color:var(--text2)">Your Registered Username:</span>
            <span class="badge badge-green" style="font-size:10px">On-Chain · Arc Testnet</span>
          </div>
          <div style="font-size:22px;font-weight:800;color:var(--green);font-family:'Syne',sans-serif" id="my-username-value">@${myUser} <span style="font-size:13px;font-family:'JetBrains Mono',monospace;color:var(--text2);font-weight:600">(${shortMe})</span></div>

          <div style="margin-top:14px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:left">
            <div style="font-size:11px;color:var(--text2);margin-bottom:4px">SHAREABLE PAY LINK</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--yellow);word-break:break-all" id="shareablePayLink">${payUrl}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:6px;line-height:1.5">Resolves on-chain to <span style="font-family:'JetBrains Mono',monospace;color:var(--text)">${shortMe}</span> on Arc Testnet.</div>
            <div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
              <button class="btn btn-sm btn-ghost" onclick="copyShareablePayLink('${payUrl}')" style="font-size:11px;padding:6px 12px;border-radius:8px;color:var(--yellow);border-color:rgba(245,197,24,0.3);cursor:pointer">Copy Pay Link</button>
              <button class="btn btn-sm btn-ghost" onclick="toggleUsernameQR('${payUrl}', '${myUser}')" style="font-size:11px;padding:6px 12px;border-radius:8px;cursor:pointer">Show QR Code</button>
              <button class="btn btn-sm btn-ghost" id="releaseUsernameBtn" onclick="releaseUsernameOnChain()" style="font-size:11px;padding:6px 12px;border-radius:8px;color:var(--red);border-color:rgba(239,68,68,0.35);cursor:pointer">Release Username</button>
            </div>
            <div id="usernameQrContainer" style="display:none;margin-top:14px;text-align:center;padding:16px;background:#ffffff;border-radius:10px">
              <div id="usernameQrSvg" style="display:flex;justify-content:center"></div>
              <div style="font-size:11px;color:#111;margin-top:8px;font-weight:700">Scan to pay @${myUser} (${shortMe}) on Arc</div>
            </div>
          </div>
        `;
      } else if (displayBox) {
        delete displayBox.dataset.link;
        displayBox.innerHTML = `
          <span style="font-size:12px;color:var(--text2)">Your Registered Username:</span>
          <div style="font-size:18px;font-weight:800;color:var(--text3);margin-top:4px" id="my-username-value">No username yet</div>
        `;
      }
    } catch (err) {
      if (seq !== onChainLookupSeq) return;
      if (displayBox) {
        delete displayBox.dataset.link;
        displayBox.innerHTML = `
          <span style="font-size:12px;color:var(--text2)">Your Registered Username:</span>
          <div style="font-size:14px;font-weight:700;color:var(--red);margin-top:4px" id="my-username-value">Could not read from Arc Testnet RPC</div>
        `;
      }
    }
    return;
  }

  // Demo fallback when VITE_USERNAME_REGISTRY_ADDRESS is empty
  const myUser = localStorage.getItem('arclance_my_username');
  // The first render replaces the element that held #my-username-value, so do not depend on it for later renders.
  if (valEl || displayBox) {
    if (myUser) {
      if (valEl) { valEl.textContent = '@' + myUser; valEl.style.color = 'var(--green)'; }
      if (displayBox) {
        const payUrl = buildPayLink(WalletState.getAddr() || '', undefined, undefined, myUser);
        if (displayBox.dataset.link === payUrl) return; // the link has not changed: keep what is shown (and an open QR code)
        displayBox.dataset.link = payUrl;
        displayBox.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:12px;color:var(--text2)">Your Registered Username:</span>
            <span class="badge badge-green" style="font-size:10px">Active on Arc</span>
          </div>
          <div style="font-size:22px;font-weight:800;color:var(--green);font-family:'Syne',sans-serif">@${myUser}</div>
          
          <div style="margin-top:14px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:left">
            <div style="font-size:11px;color:var(--text2);margin-bottom:4px">SHAREABLE PAY LINK</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--yellow);word-break:break-all" id="shareablePayLink">${payUrl}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:8px;line-height:1.5">Share the wallet-address link so anyone can open it. The username is only a label.</div>
            <div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
              <button class="btn btn-sm btn-ghost" onclick="copyShareablePayLink('${payUrl}')" style="font-size:11px;padding:6px 12px;border-radius:8px;color:var(--yellow);border-color:rgba(245,197,24,0.3);cursor:pointer">Copy Pay Link</button>
              <button class="btn btn-sm btn-ghost" onclick="toggleUsernameQR('${payUrl}', '${myUser}')" style="font-size:11px;padding:6px 12px;border-radius:8px;cursor:pointer">Show QR Code</button>
            </div>
            <div id="usernameQrContainer" style="display:none;margin-top:14px;text-align:center;padding:16px;background:#ffffff;border-radius:10px">
              <div id="usernameQrSvg" style="display:flex;justify-content:center"></div>
              <div style="font-size:11px;color:#111;margin-top:8px;font-weight:700">Scan to pay @${myUser} on Arc</div>
            </div>
          </div>
        `;
      }
    } else {
      if (displayBox) {
        displayBox.innerHTML = `
          <span style="font-size:12px;color:var(--text2)">Your Registered Username:</span>
          <div style="font-size:18px;font-weight:800;color:var(--text3);margin-top:4px" id="my-username-value">No username yet</div>
        `;
      }
    }
  }
}

window.copyShareablePayLink = function(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Shareable pay link copied to clipboard!');
    }).catch(() => {
      showToast('Link: ' + url);
    });
  } else {
    showToast('Link: ' + url);
  }
};

window.toggleUsernameQR = function(url, user) {
  const container = document.getElementById('usernameQrContainer');
  const svgEl = document.getElementById('usernameQrSvg');
  if (!container) return;
  const isHidden = container.style.display === 'none';
  if (isHidden) {
    container.style.display = 'block';
    if (svgEl) {
      svgEl.innerHTML = `<svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
        <rect width="140" height="140" fill="#ffffff"/>
        <rect x="10" y="10" width="35" height="35" fill="#111111"/>
        <rect x="15" y="15" width="25" height="25" fill="#ffffff"/>
        <rect x="20" y="20" width="15" height="15" fill="#111111"/>
        <rect x="95" y="10" width="35" height="35" fill="#111111"/>
        <rect x="100" y="15" width="25" height="25" fill="#ffffff"/>
        <rect x="105" y="20" width="15" height="15" fill="#111111"/>
        <rect x="10" y="95" width="35" height="35" fill="#111111"/>
        <rect x="15" y="100" width="25" height="25" fill="#ffffff"/>
        <rect x="20" y="105" width="15" height="15" fill="#111111"/>
        <rect x="52" y="12" width="6" height="6" fill="#111"/>
        <rect x="64" y="18" width="6" height="6" fill="#111"/>
        <rect x="76" y="12" width="6" height="6" fill="#111"/>
        <rect x="52" y="30" width="6" height="6" fill="#111"/>
        <rect x="70" y="28" width="6" height="6" fill="#111"/>
        <rect x="82" y="34" width="6" height="6" fill="#111"/>
        <rect x="12" y="52" width="6" height="6" fill="#111"/>
        <rect x="24" y="60" width="6" height="6" fill="#111"/>
        <rect x="36" y="52" width="6" height="6" fill="#111"/>
        <rect x="48" y="52" width="6" height="6" fill="#111"/>
        <rect x="60" y="48" width="6" height="6" fill="#111"/>
        <rect x="72" y="60" width="6" height="6" fill="#111"/>
        <rect x="84" y="52" width="6" height="6" fill="#111"/>
        <rect x="96" y="60" width="6" height="6" fill="#111"/>
        <rect x="108" y="52" width="6" height="6" fill="#111"/>
        <rect x="120" y="60" width="6" height="6" fill="#111"/>
        <rect x="54" y="70" width="6" height="6" fill="#111"/>
        <rect x="66" y="76" width="6" height="6" fill="#111"/>
        <rect x="78" y="70" width="6" height="6" fill="#111"/>
        <rect x="90" y="76" width="6" height="6" fill="#111"/>
        <rect x="52" y="92" width="6" height="6" fill="#111"/>
        <rect x="64" y="98" width="6" height="6" fill="#111"/>
        <rect x="76" y="110" width="6" height="6" fill="#111"/>
        <rect x="88" y="104" width="6" height="6" fill="#111"/>
        <rect x="100" y="116" width="6" height="6" fill="#111"/>
        <rect x="112" y="98" width="6" height="6" fill="#111"/>
        <rect x="124" y="110" width="6" height="6" fill="#111"/>
      </svg>`;
    }
  } else {
    container.style.display = 'none';
  }
};


publish({
  RateStatus,
  ExchangeRates,
  fetchWithRetry,
  fetchLiveExchangeRates,
  resolveUsername,
  resolveNameOnChain,
  getRegistryAddress,
  isRegistryConfigured,
  formatShortAddr,
  validateRegistryName,
  registerUsernameOnChain,
  releaseUsernameOnChain,
  updateUsernameUI,
});
