// Screenshot fixture for the shell panel's terminal list.
// `npm run screenshot:component ShellTabControls`.
//
// A capture can't hover, and the kill trash is hidden until it is, so the list
// is shown twice: at rest, and with the hover reveal forced on.
import React from 'react'
import { ShellTabControls } from './ShellTabControls'
import type { ShellTerminal } from './shell-terminal-store'

const terminals: ShellTerminal[] = [
  { sessionId: 's1', label: 'Manifold 1', mode: 'manifold' },
  { sessionId: 's2', label: 'System 2', mode: 'system' },
  { sessionId: 's3', label: 'Manifold 3', mode: 'manifold' },
]

const noop = (): void => {}

export default (
  <div style={{ display: 'flex', gap: 24, padding: 16, background: 'var(--bg-primary)' }}>
    <style>{'.force-hover .shell-tab__kill { opacity: 1 }'}</style>
    <ShellTabControls
      terminals={terminals}
      activeSessionId="s2"
      onSetActiveTerminal={noop}
      onCloseTerminal={noop}
    />
    <div className="force-hover" style={{ display: 'flex' }}>
      <ShellTabControls
        terminals={terminals}
        activeSessionId="s2"
        onSetActiveTerminal={noop}
        onCloseTerminal={noop}
      />
    </div>
  </div>
)
