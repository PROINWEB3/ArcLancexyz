function readOnrampUrl(): string {
  try {
    const v = (import.meta.env as Record<string, string | undefined>)?.VITE_ONRAMP_URL
    if (typeof v === 'string' && v.trim()) return v.trim()
  } catch {
    /* ignore */
  }
  try {
    const v = typeof process !== 'undefined' ? process.env?.VITE_ONRAMP_URL : undefined
    if (typeof v === 'string' && v.trim()) return v.trim()
  } catch {
    /* ignore */
  }
  return ''
}

/** Public site facts used by the footer, meta tags, pay links and docs. One place to change them. */
export const SITE = {
  name: 'ArcLance',
  url: 'https://arclance.xyz',
  github: 'https://github.com/PROINWEB3',
  /** The ArcLance code repository. */
  repo: 'https://github.com/PROINWEB3/ArcLancexyz',
  x: 'https://x.com/PROinWeb3',
  xHandle: '@PROinWeb3',
  /** Official Arc documentation. */
  arcDocs: 'https://docs.arc.io',
  /** Arcscan, the Arc Testnet block explorer. */
  arcscan: 'https://testnet.arcscan.app',
  /** Date the network values, links and addresses shown in Docs were last checked. */
  docsVerified: '28 October 2026',
  /** Optional onramp URL (mainnet). When empty, testnet faucet guidance is shown. */
  onrampUrl: readOnrampUrl(),
}

export const ONRAMP_URL: string = SITE.onrampUrl

export const SITE_DESCRIPTION =
  'ArcLance is a payment page for freelancers who get paid in USDC or EURC on Arc. Send, receive, swap, bridge and invoice from your own wallet. Testnet build.'
