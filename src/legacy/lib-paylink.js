// One Pay Link format everywhere: https://arclance.xyz/pay/<wallet-address>/<amount>/<label>[?u=<display-name>]
// The wallet address is what the link pays. A username is only a display label (?u=) and is never trusted for the payment.
// Older links with a username as the target still open on the device that saved that username.
import { SITE } from '../config/site';

const slug = (v) => String(v ?? '').trim().replace(/\s+/g, '-');

/** Build a pay link. Amount and label are optional; leave them out to get a link to the page only. */
export function buildPayLink(target, amount, label, name) {
  const t = String(target || '').trim().replace(/^@/, '');
  let url = `${SITE.url}/pay/${encodeURIComponent(t || 'your-wallet-address')}`;
  const a = amount === undefined || amount === null || amount === '' ? '' : String(amount).trim();
  if (a) {
    url += `/${encodeURIComponent(a)}`;
    const l = slug(label);
    if (l) url += `/${encodeURIComponent(l)}`;
  }
  const n = String(name || '').trim().replace(/^@/, '').toLowerCase();
  if (/^[a-z0-9._-]{3,32}$/.test(n)) url += `?u=${encodeURIComponent(n)}`;
  return url;
}

/** Read a /pay/<target>/<amount>/<label> path (or the older #/pay/... hash). Returns null when it is not a pay link. */
export function parsePayPath(pathname, hash, search) {
  let parts = null;
  if (typeof pathname === 'string' && pathname.startsWith('/pay/')) parts = pathname.split('/').slice(2);
  else if (typeof hash === 'string' && hash.startsWith('#/pay/')) parts = hash.split('/').slice(2);
  if (!parts || !parts[0]) return null;
  const dec = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
  return {
    target: dec(parts[0]).replace(/^@/, ''),
    amount: parseFloat(dec(parts[1] || '')) || 0,
    label: parts[2] ? dec(parts[2]).replace(/-/g, ' ') : 'Freelance Services',
    // optional display name from ?u=; only shown, never used to find the recipient
    name: (() => { try { const u = new URLSearchParams(search || '').get('u') || ''; return /^[a-z0-9._-]{3,32}$/i.test(u) ? u.toLowerCase() : ''; } catch { return ''; } })(),
  };
}
