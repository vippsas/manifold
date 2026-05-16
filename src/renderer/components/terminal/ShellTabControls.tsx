import React from 'react'
import type { ExtraShell } from './shell-tabs-hooks'
import { shellTabStyles as styles } from './ShellTabs.styles'

interface ShellTabControlsProps {
  effectiveTab: string
  worktreeSessionId: string | null
  extraShells: ExtraShell[]
  onSetActiveTab: (tab: string) => void
  onRemoveShell: (id: string) => void
}

export function ShellTabControls({
  effectiveTab, worktreeSessionId, extraShells,
  onSetActiveTab, onRemoveShell,
}: ShellTabControlsProps): React.JSX.Element {
  const isMainTab = effectiveTab === 'worktree' || effectiveTab === 'project'
  const showingProject = effectiveTab === 'project'

  return (
    <div style={styles.headerTabBar} aria-label="Shell tabs">
      <button
        style={{
          ...styles.tab,
          ...(isMainTab ? styles.tabActive : {}),
          ...(!worktreeSessionId && !showingProject ? styles.tabDisabled : {}),
        }}
        onClick={() => onSetActiveTab(worktreeSessionId ? 'worktree' : 'project')}
      >
        {showingProject ? 'Repository' : 'Worktree'}
      </button>
      <button
        style={styles.toggleButton}
        onClick={() => onSetActiveTab(showingProject ? 'worktree' : 'project')}
        disabled={!worktreeSessionId}
        title={showingProject ? 'Switch to worktree' : 'Switch to repository'}
      >
        {'\u21C5'}
      </button>
      {extraShells.map((shell) => {
        const tabId = `extra-${shell.sessionId}`
        return (
          <button
            key={shell.sessionId}
            style={{ ...styles.tab, ...(effectiveTab === tabId ? styles.tabActive : {}) }}
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
