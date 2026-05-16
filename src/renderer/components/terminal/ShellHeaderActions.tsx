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

  return (
    <div style={styles.headerActions}>
      {controls.worktreeSessionId && (
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
      <ShellTabControls
        effectiveTab={controls.effectiveTab}
        worktreeSessionId={controls.worktreeSessionId}
        extraShells={controls.extraShells}
        onSetActiveTab={controls.onSetActiveTab}
        onRemoveShell={controls.onRemoveShell}
      />
    </div>
  )
}
