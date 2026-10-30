// Live price feed
// Ported verbatim from the original single-file index.html.
import { publish } from './publish.js';
/* ══════════════════════════════════════
   PRICE FEED (real prices via CoinGecko)
══════════════════════════════════════ */
const PriceFeed = (() => {
  let _eth = 0;
  let _usdc = 1.00;   // USDC = $1.00 USD
  let _eurc = 1.08;   // fallback only, so balances do not break. Anything shown with it is marked approximate until a live price loads (eurcLive).
  let _eurcLive = false; // true only after a live EURC price loaded
  let _btc = null;    // BTC/USD, live only. null when unavailable (never invented)
  let _lastFetch = 0;

  async function fetch() {
    const now = Date.now();
    if (now - _lastFetch < 60000) return; // cache 60s
    _lastFetch = now;
    try {
      const r = await window.fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,euro-coin,bitcoin&vs_currencies=usd&include_24hr_change=true');
      const d = await r.json();
      if (d.ethereum) _eth = d.ethereum.usd;
      // USDC is pegged at $1.00; EURC and BTC are fetched live
      if (d.bitcoin && d.bitcoin.usd) _btc = d.bitcoin.usd;
      if (d['euro-coin']) { _eurc = d['euro-coin'].usd; _eurcLive = true; }
      updatePriceDisplay();
    } catch(e) {
      _eth = _eth || 2836;
      updatePriceDisplay();
    }
  }

  function updatePriceDisplay() {
    const ethStr = _eth ? '$' + _eth.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) : 'N/A';
    const ethEl = document.getElementById('eth-price-stat');
    if (ethEl) ethEl.textContent = ethStr;
    const ethSwap = document.getElementById('eth-price-swap');
    if (ethSwap) ethSwap.textContent = ethStr;
    // Update USDC price displays to $1.00
    const usdcEls = document.querySelectorAll('[id$="-usdc-price"]');
    usdcEls.forEach(el => { el.textContent = '$' + _usdc.toFixed(2); });
    const priceEl = document.getElementById('home-usdc-price');
    if (priceEl) priceEl.textContent = '$' + _usdc.toFixed(2);
    UISync.refresh();
  }

  return { fetch, get eth() { return _eth || 2836; }, get usdc() { return _usdc; }, get eurc() { return _eurc; }, get btc() { return _btc; }, get eurcLive() { return _eurcLive; } };
})();


publish({ PriceFeed });
