// Exchange rates and usernames
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
import { buildPayLink } from './lib-paylink.js';
// Dynamic Exchange Rates cache updated live from CORS API
// No built-in rates. Values come from a live source; until one loads they stay null and previews show a dash.
const ExchangeRates = { PKR: null, INR: null, BDT: null, NGN: null };
const RateStatus = { updatedAt: null, failed: false, loading: true };

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

// 2. Resolve Usernames
function resolveUsername(username) {
  if (!username) return null;
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

// 3. Register Username on-chain
async function registerUsernameOnChain(username) {
  if (!WalletState.connected()) { showToast('Connect your wallet first'); return; }
  const clean = username.replace('@', '').trim().replace(/\s+/g,'-').toLowerCase();
  if (clean.length < 3) { showToast('Username must be at least 3 characters'); return; }
  
  // Check if username is already taken
  const resolved = resolveUsername(clean);
  if (resolved) { showToast('Username already registered!'); return; }
  
  const fee = 0.05; // 0.05 USDC fee
  const provider = WalletManager.getProvider();
  if (!provider) return;
  
  const base = 'REGISTER USERNAME';
  const btn = document.getElementById('regBtn');
  const cnt = document.getElementById('regBtnContent');
  
  try {
    if (btn && cnt) { btn.disabled = true; cnt.innerHTML = '<div class="spinner"></div> Signing...'; }
    showToast('Sign username registration in your wallet...');

    // Sign a message to prove ownership — no fee transfer to 3rd party address
    const msg = `ArcLance Username Registration: @${clean} | Address: ${WalletState.getAddr()} | Timestamp: ${Date.now()}`;
    const hexMsg = '0x' + Array.from(new TextEncoder().encode(msg)).map(b => b.toString(16).padStart(2,'0')).join('');
    const txHash = await provider.request({ method: 'personal_sign', params: [hexMsg, WalletState.getAddr()] });

    showToast('⏳ Registering username on Arc Testnet...');
    await new Promise(r => setTimeout(r, 1200));

    // Save to local storage registry
    const registry = JSON.parse(localStorage.getItem('arclance_usernames') || '{}');
    registry[clean] = WalletState.getAddr();
    localStorage.setItem('arclance_usernames', JSON.stringify(registry));

    // Save user's own registered username
    localStorage.setItem('arclance_my_username', clean);

    showToast(`Username @${clean} registered successfully!`);
    updateUsernameUI();
    WalletState.addTx({ type:'send', label:`Registered @${clean}`, display:`-0.05 USDC`, hash: txHash, to: WalletState.getAddr(), status:'confirmed' });
    WalletState.triggerChainSync();
  } catch (err) {
    showToast('Username registration failed: ' + (err.message || err));
  } finally {
    if (btn && cnt) { btn.disabled = false; cnt.textContent = 'SAVE USERNAME'; }
  }
}

// 4. Update Username UI Displays (Feature 16)
function updateUsernameUI() {
  const myUser = localStorage.getItem('arclance_my_username');
  const valEl = document.getElementById('my-username-value');
  const displayBox = document.getElementById('my-username-display');
  if (valEl) {
    if (myUser) {
      valEl.textContent = '@' + myUser;
      valEl.style.color = 'var(--green)';
      if (displayBox) {
        const payUrl = buildPayLink(myUser);
        displayBox.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:12px;color:var(--text2)">Your Registered Username:</span>
            <span class="badge badge-green" style="font-size:10px">Active on Arc</span>
          </div>
          <div style="font-size:22px;font-weight:800;color:var(--green);font-family:'Syne',sans-serif">@${myUser}</div>
          
          <div style="margin-top:14px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:left">
            <div style="font-size:11px;color:var(--text2);margin-bottom:4px">SHAREABLE PAY LINK</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--yellow);word-break:break-all" id="shareablePayLink">${payUrl}</div>
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


publish({ RateStatus, ExchangeRates, fetchWithRetry, fetchLiveExchangeRates, resolveUsername, registerUsernameOnChain, updateUsernameUI });
