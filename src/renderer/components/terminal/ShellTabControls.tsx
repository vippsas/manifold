import React from 'react'
import type { ShellTerminal } from './shell-terminal-store'
import { shellTabStyles as styles } from './ShellTabs.styles'

interface ShellTabControlsProps {
  terminals: ShellTerminal[]
  activeSessionId: string | null
  onSetActiveTerminal: (sessionId: string) => void
  onCloseTerminal: (sessionId: string) => void
}

/** The terminal list, down the right edge of the panel body as in VS Code —
 *  not in the dock header, which is already carrying the panel's own tab and
 *  the +/chevron/kill pills. */
export function ShellTabControls({
  terminals, activeSessionId,
  onSetActiveTerminal, onCloseTerminal,
}: ShellTabControlsProps): React.JSX.Element {
  return (
    <div style={styles.tabList} aria-label="Terminals">
      {terminals.map((terminal) => (
        <button
          key={terminal.sessionId}
          type="button"
          style={{ ...styles.tab, ...(activeSessionId === terminal.sessionId ? styles.tabActive : {}) }}
          onClick={() => onSetActiveTerminal(terminal.sessionId)}
        >
          <span style={styles.tabLabel}>{terminal.label}</span>
          <span
            role="button" style={styles.tabCloseButton}
            onClick={(event) => { event.stopPropagation(); onCloseTerminal(terminal.sessionId) }}
            title={`Close ${terminal.label}`}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  )
}
