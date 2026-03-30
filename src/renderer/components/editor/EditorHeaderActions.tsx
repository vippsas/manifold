import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { ActionMenuButton, type ActionMenuButtonItem } from './ActionMenuButton'
import { DockStateContext } from './dock-panel-types'
import {
  getEditorPaneModeControls,
  subscribeEditorPaneModeControls,
} from './editor-pane-mode-controls'

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
        buttonLabel="Mode"
        title="File mode options"
        menuLabel="File mode options"
        items={modeItems}
      />
      <ActionMenuButton
        buttonLabel="Pane"
        title="Pane actions"
        menuLabel="Pane actions"
        items={items}
      />
    </div>
  )
}
