// Screenshot fixture for the shell panel's terminal list.
// `npm run screenshot:component ShellTabControls`.
//
// A capture can't hover, and the kill trash is hidden until it is, so the list
// is shown twice: at rest, and with the hover reveal forced on.
import React from 'react'
import { ShellTabControls } from './ShellTabControls'
import type { ShellFolder } from './shell-cwd'
import type { ShellTerminal } from './shell-terminal-store'

const folders: ShellFolder[] = [
  { projectId: 'p1', name: 'storefront', path: '/worktrees/checkout/storefront' },
  { projectId: 'p2', name: 'payments', path: '/worktrees/checkout/payments' },
]

const terminals: ShellTerminal[] = [
  { sessionId: 's1', label: 'Manifold 1', mode: 'manifold', cwd: '/worktrees/checkout/storefront' },
  { sessionId: 's2', label: 'System 2', mode: 'system', cwd: '/worktrees/checkout/payments' },
  { sessionId: 's3', label: 'Manifold 3', mode: 'manifold', cwd: '/worktrees/checkout/storefront' },
]

const noop = (): void => {}

export default (
  <div style={{ display: 'flex', gap: 24, padding: 16, background: 'var(--bg-primary)' }}>
    <style>{'.force-hover .shell-tab__kill { opacity: 1 }'}</style>
    <ShellTabControls
      terminals={terminals}
      folders={folders}
      activeSessionId="s2"
      onSetActiveTerminal={noop}
      onCloseTerminal={noop}
    />
    <div className="force-hover" style={{ display: 'flex' }}>
      <ShellTabControls
        terminals={terminals}
        folders={folders}
        activeSessionId="s2"
        onSetActiveTerminal={noop}
        onCloseTerminal={noop}
      />
    </div>
  </div>
)
