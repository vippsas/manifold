import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { ActionMenuButton, type ActionMenuButtonItem } from './ActionMenuButton'
import { DockStateContext } from './dock-panel-types'
import {
  getEditorPaneModeControls,
  subscribeEditorPaneModeControls,
} from './editor-pane-mode-controls'

function ModeButtonIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.75" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3.1 4.1H8.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M3.1 6H8.9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.72" />
      <path d="M3.1 7.9H6.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.48" />
    </svg>
  )
}

function PaneButtonIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.75" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6 2.4V9.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M2.7 4.2H5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.62" />
      <path d="M7 7.8H9.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.62" />
    </svg>
  )
}

export function EditorHeaderActions({ activePanel }: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  const paneId = activePanel?.id ?? null
  const modeControls = React.useSyncExternalStore(
    subscribeEditorPaneModeControls,
    () => (paneId ? getEditorPaneModeControls(paneId) : null),
    () => (paneId ? getEditorPaneModeControls(paneId) : null),
  )

  if (!state || !paneId || !state.editorPaneIds.includes(paneId)) return null

  const pane = state.getEditorPane(paneId)
  const moveTargets = state.editorPaneIds
    .filter((id) => id !== paneId)
    .map((id) => ({
      id,
      label: `Editor ${state.editorPaneIds.indexOf(id) + 1}`,
    }))

  const items: ActionMenuButtonItem[] = [
    {
      id: 'split-right',
      label: 'Split right',
      action: () => {
        state.onActivateEditorPane(paneId)
        state.onSplitEditorPane(paneId, 'right')
      },
    },
    {
      id: 'split-down',
      label: 'Split down',
      action: () => {
        state.onActivateEditorPane(paneId)
        state.onSplitEditorPane(paneId, 'below')
      },
    },
  ]

  if (pane.activeFilePath) {
    for (const target of moveTargets) {
      items.push({
        id: `move-${target.id}`,
        label: `Move file to ${target.label}`,
        action: () => {
          state.onActivateEditorPane(paneId)
          state.onMoveFileToPane(pane.activeFilePath!, target.id, paneId)
        },
      })
    }
  }

  const modeItems: ActionMenuButtonItem[] = []

  if (pane.activeFilePath && modeControls && (modeControls.canShowPreview || modeControls.canShowDiff)) {
    modeItems.push({
      id: 'mode-editor',
      label: 'Editor',
      action: () => {
        state.onActivateEditorPane(paneId)
        modeControls.showEditor()
      },
    })

    if (modeControls.canShowPreview) {
      modeItems.push({
        id: 'mode-preview',
        label: 'Preview',
        action: () => {
          state.onActivateEditorPane(paneId)
          modeControls.showPreview()
        },
      })
    }

    if (modeControls.canShowDiff) {
      modeItems.push({
        id: 'mode-diff',
        label: 'Diff',
        action: () => {
          state.onActivateEditorPane(paneId)
          modeControls.showDiff()
        },
      })
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <ActionMenuButton
        buttonLabel={<ModeButtonIcon />}
        title="File mode options"
        menuLabel="File mode options"
        items={modeItems}
      />
      <ActionMenuButton
        buttonLabel={<PaneButtonIcon />}
        title="Pane actions"
        menuLabel="Pane actions"
        items={items}
      />
    </div>
  )
}
