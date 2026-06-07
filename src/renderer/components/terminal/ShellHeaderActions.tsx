import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import {
  getShellHeaderControls,
  subscribeShellHeaderControls,
} from './shell-header-controls'
import { ShellTabControls } from './ShellTabControls'
import { shellTabStyles as styles } from './ShellTabs.styles'

export function ShellHeaderActions({ activePanel }: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const controls = React.useSyncExternalStore(
    subscribeShellHeaderControls,
    getShellHeaderControls,
    getShellHeaderControls,
  )

  if (!controls || activePanel?.id !== 'shell') return null
  const showShellTabs = controls.extraShells.length > 0
  if (!controls.canAddShell && !showShellTabs) return null

  return (
    <div style={styles.headerActions}>
      {controls.canAddShell && (
        <button
          type="button"
          style={styles.headerAddButton}
          className="shell-header-add-button"
          onClick={(event) => { event.stopPropagation(); controls.onAddShell() }}
          title="New shell tab"
          aria-label="New shell tab"
        >
          +
        </button>
      )}
      {showShellTabs && (
        <ShellTabControls
          activeTab={controls.activeTab}
          extraShells={controls.extraShells}
          onSetActiveTab={controls.onSetActiveTab}
          onRemoveShell={controls.onRemoveShell}
        />
      )}
    </div>
  )
}

export function ShellPromptHeaderAction({ activePanel }: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const controls = React.useSyncExternalStore(
    subscribeShellHeaderControls,
    getShellHeaderControls,
    getShellHeaderControls,
  )

  if (!controls || activePanel?.id !== 'shell') return null

  return (
    <label
      style={styles.promptToggleLabel}
      title="Use Manifold prompt in worktree shells"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={controls.shellPrompt}
        onChange={(event) => controls.onShellPromptChange(event.target.checked)}
        style={styles.promptToggleInput}
        aria-label="Use Manifold prompt in worktree shells"
      />
      <span style={styles.promptToggleText}>Manifold prompt</span>
    </label>
  )
}
