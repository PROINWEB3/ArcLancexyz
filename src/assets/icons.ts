import { ICON_SVG } from './icon-svgs'

export type IconKind = 'token' | 'chain'

const FALLBACK_BG = 'var(--surface3)'

/** First letter on a neutral circle, used when a logo is missing. */
function fallbackHtml(label: string, size: number): string {
  const letter = (label.trim()[0] || '?').toUpperCase()
  return `<span style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:${size}px;height:${size}px;border-radius:50%;background:${FALLBACK_BG};color:var(--text2);font-size:${Math.max(10, Math.round(size * 0.46))}px;font-weight:700;line-height:1">${letter}</span>`
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)
}

/**
 * Logo of a token (USDC, EURC, cirBTC) or a network (arc, sepolia, ...) as inline SVG in a circle.
 * Every logo renders at the same size; a missing one falls back to a letter circle.
 */
export function iconHtml(kind: IconKind, key: string, size = 24, label?: string): string {
  const svg = ICON_SVG[`${kind}:${key}`]
  if (!svg) return fallbackHtml(escapeText(label || key), size)
  const sized = svg.replace(/(<svg[^>]*?)\swidth="[^"]*"/, '$1').replace(/(<svg[^>]*?)\sheight="[^"]*"/, '$1').replace('<svg', `<svg width="${size}" height="${size}"`)
  return `<span style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;background:var(--surface3)">${sized}</span>`
}

export const tokenIcon = (symbol: string, size = 24): string => iconHtml('token', symbol, size, symbol)
export const chainIcon = (key: string, size = 24, label?: string): string => iconHtml('chain', key, size, label)

/** Small first-letter badge for things that have no logo, such as payment methods. */
export const letterBadge = (label: string, size = 18): string => fallbackHtml(escapeText(label), size)
