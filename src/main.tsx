import './tracing'
import './console-capture'
import './styles/arclance.css'

import { createRoot } from 'react-dom/client'
import { AppBoundary } from './boot/AppBoundary'

// The ArcLance UI lives in index.html and src/legacy. React only hosts the top-level error
// boundary that starts the app and shows a recovery screen if startup fails.
const host = document.getElementById('arclance-boundary-root')
if (host) {
  createRoot(host).render(<AppBoundary />)
}
