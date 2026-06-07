import React from 'react'
import type { ExtraShell } from './shell-tabs-hooks'
import { shellTabStyles as styles } from './ShellTabs.styles'

interface ShellTabControlsProps {
  activeTab: string
  extraShells: ExtraShell[]
  onSetActiveTab: (tab: string) => void
  onRemoveShell: (id: string) => void
}

export function ShellTabControls({
  activeTab, extraShells,
  onSetActiveTab, onRemoveShell,
}: ShellTabControlsProps): React.JSX.Element {
  return (
    <div style={styles.headerTabBar} aria-label="Shell tabs">
      <button
        style={{ ...styles.tab, ...(activeTab === 'main' ? styles.tabActive : {}) }}
        onClick={() => onSetActiveTab('main')}
      >
        Shell
      </button>
      {extraShells.map((shell) => {
        const tabId = `extra-${shell.sessionId}`
        return (
          <button
            key={shell.sessionId}
            style={{ ...styles.tab, ...(activeTab === tabId ? styles.tabActive : {}) }}
            onClick={() => onSetActiveTab(tabId)}
          >
            <span>{shell.label}</span>
            <span
              role="button" style={styles.tabCloseButton}
              onClick={(event) => { event.stopPropagation(); onRemoveShell(shell.sessionId) }}
              title={`Close ${shell.label}`}
            >
              x
            </span>
          </button>
        )
      })}
    </div>
  )
}
