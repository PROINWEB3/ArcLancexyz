import { Component, useEffect, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { loadLegacy } from './loadLegacy'

interface BoundaryState {
  error: Error | null
}

/** Top-level error boundary: shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ArcLance] Fatal error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 24, background: '#08071a', color: '#e8e6ff',
          fontFamily: "'Outfit', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 460, width: '100%', padding: 28, borderRadius: 16,
            background: '#100f2e', border: '1px solid rgba(255,255,255,0.12)', textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 20, lineHeight: 1.6 }}>
            ArcLance hit an unexpected error. Your funds are not affected. Reload to try again.
          </div>
          <pre
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'left', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', opacity: 0.6, marginBottom: 20, maxHeight: 120, overflow: 'auto',
            }}
          >
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: '#f5c518', color: '#111', fontWeight: 700, fontSize: 14,
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

/** Starts the ArcLance app and hands any startup failure to the boundary. */
function LegacyHost() {
  const [failure, setFailure] = useState<Error | null>(null)

  useEffect(() => {
    loadLegacy().catch((err: unknown) => {
      setFailure(err instanceof Error ? err : new Error(String(err)))
    })
  }, [])

  if (failure) throw failure
  return null
}

export function AppBoundary() {
  return (
    <ErrorBoundary>
      <LegacyHost />
    </ErrorBoundary>
  )
}
