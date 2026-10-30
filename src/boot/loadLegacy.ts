/**
 * Loads the ArcLance app sections once and replays DOMContentLoaded if it already fired,
 * because the original app boots from a DOMContentLoaded listener.
 */
let domContentLoaded = document.readyState === 'complete'
if (!domContentLoaded) {
  document.addEventListener('DOMContentLoaded', () => { domContentLoaded = true }, { once: true })
}

let pending: Promise<void> | null = null

export function loadLegacy(): Promise<void> {
  if (!pending) {
    pending = import('../legacy/index.js').then(() => {
      if (domContentLoaded || document.readyState === 'complete') {
        document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }))
      }
    })
  }
  return pending
}
