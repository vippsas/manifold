import React from 'react'
import type { ShellTerminal } from './shell-terminal-store'
import { PanelGlyph } from '../ActivityBar'
import { shellTabStyles as styles } from './ShellTabs.styles'

interface ShellTabControlsProps {
  terminals: ShellTerminal[]
  activeSessionId: string | null
  onSetActiveTerminal: (sessionId: string) => void
  onCloseTerminal: (sessionId: string) => void
}

function KillIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2.25 3.25H9.75" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M4.75 3.25V2.25H7.25V3.25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.25 3.25L3.75 9.5H8.25L8.75 3.25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The terminal list, down the right edge of the panel body as in VS Code —
 *  not in the dock header, which is already carrying the panel's own tab and
 *  the +/chevron pills. Killing a terminal is a per-row trash that appears on
 *  hover, rather than a header button aimed at whichever row is active. */
export function ShellTabControls({
  terminals, activeSessionId,
  onSetActiveTerminal, onCloseTerminal,
}: ShellTabControlsProps): React.JSX.Element {
  return (
    <div style={styles.tabList} aria-label="Terminals">
      {terminals.map((terminal) => {
        const isActive = activeSessionId === terminal.sessionId
        return (
          <div
            key={terminal.sessionId}
            className={`shell-tab${isActive ? ' shell-tab--active' : ''}`}
            style={{ ...styles.tab, ...(isActive ? styles.tabActive : {}) }}
          >
            <button
              type="button"
              style={styles.tabSelect}
              onClick={() => onSetActiveTerminal(terminal.sessionId)}
            >
              <span style={styles.tabGlyph}><PanelGlyph id="shell" size={13} /></span>
              <span style={styles.tabLabel}>{terminal.label}</span>
            </button>
            <button
              type="button"
              className="shell-tab__kill"
              style={styles.tabKillButton}
              onClick={() => onCloseTerminal(terminal.sessionId)}
              title={`Kill ${terminal.label}`}
              aria-label={`Kill ${terminal.label}`}
            >
              <KillIcon />
            </button>
          </div>
        )
      })}
    </div>
  )
}
