// resources/plugins/manifold.loop/src/webview/index.tsx
// Minimal read-only loop panel (B2a): applies host-injected theme vars, requests init, and
// renders loop state live. Controls + config form arrive in B2b. Talks to the plugin via
// parent.postMessage / window message events only (CSP: connect-src 'none').
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { HostMsg } from './protocol'
import type { LoopStatus } from '../types'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }

interface UiState { sessionId: string | null; status: LoopStatus | null; iterations: number }

function App(): React.JSX.Element {
  const [ui, setUi] = useState<UiState>({ sessionId: null, status: null, iterations: 0 })

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const m = e.data as HostMsg | ThemeMsg | null
      if (!m || typeof m !== 'object') return
      if (m.type === '__manifold_theme') {
        for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
        return
      }
      if (m.type === 'init') setUi({ sessionId: m.sessionId, status: m.status, iterations: m.iterations.length })
      else if (m.type === 'status') setUi((s) => ({ ...s, status: m.status }))
      else if (m.type === 'iteration') setUi((s) => ({ ...s, iterations: s.iterations + 1 }))
    }
    window.addEventListener('message', onMessage)
    parent.postMessage({ type: 'ready' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const pad = { padding: 'var(--space-md, 14px)', fontSize: 'var(--type-ui-small, 12px)' }
  if (!ui.sessionId) {
    return <div style={{ ...pad, color: 'var(--text-muted, #888)' }}>Select a session to use the autoresearch loop.</div>
  }
  const state = ui.status?.state ?? 'idle'
  return (
    <div style={pad}>
      <div style={{ fontWeight: 600, marginBottom: 'var(--space-sm, 8px)' }}>Autoresearch Loop</div>
      <div style={{ display: 'flex', gap: 'var(--space-sm, 8px)', alignItems: 'center', color: 'var(--text-secondary, #ccc)' }}>
        <span style={{ color: 'var(--status-running, #4ea1ff)' }}>{state}</span>
        <span>iter {ui.status?.currentIteration ?? 0}</span>
        {ui.status?.bestScore !== undefined && <span>best {ui.status.bestScore}</span>}
        <span style={{ color: 'var(--text-muted, #888)' }}>{ui.iterations} logged</span>
      </div>
    </div>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) createRoot(rootEl).render(<App />)
