// One Pay Link format everywhere: https://arclance.xyz/pay/<username-or-address>/<amount>/<label>
import { SITE } from '../config/site';

const slug = (v) => String(v ?? '').trim().replace(/\s+/g, '-');

/** Build a pay link. Amount and label are optional; leave them out to get a link to the page only. */
export function buildPayLink(target, amount, label) {
  const t = String(target || '').trim().replace(/^@/, '');
  let url = `${SITE.url}/pay/${encodeURIComponent(t || 'your-wallet-address')}`;
  const a = amount === undefined || amount === null || amount === '' ? '' : String(amount).trim();
  if (a) {
    url += `/${encodeURIComponent(a)}`;
    const l = slug(label);
    if (l) url += `/${encodeURIComponent(l)}`;
  }
  return url;
}

/** Read a /pay/<target>/<amount>/<label> path (or the older #/pay/... hash). Returns null when it is not a pay link. */
export function parsePayPath(pathname, hash) {
  let parts = null;
  if (typeof pathname === 'string' && pathname.startsWith('/pay/')) parts = pathname.split('/').slice(2);
  else if (typeof hash === 'string' && hash.startsWith('#/pay/')) parts = hash.split('/').slice(2);
  if (!parts || !parts[0]) return null;
  const dec = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
  return {
    target: dec(parts[0]).replace(/^@/, ''),
    amount: parseFloat(dec(parts[1] || '')) || 0,
    label: parts[2] ? dec(parts[2]).replace(/-/g, ' ') : 'Freelance Services',
  };
}
