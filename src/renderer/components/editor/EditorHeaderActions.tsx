import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { ActionMenuButton, type ActionMenuButtonItem } from './ActionMenuButton'
import { DockStateContext } from './dock-panel-types'
import {
  getEditorPaneModeControls,
  subscribeEditorPaneModeControls,
} from './editor-pane-mode-controls'

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

function SwapIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.25H9L7.25 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 7.75H3L4.75 9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const MODE_LABEL: Record<'editor' | 'preview' | 'diff', string> = {
  editor: 'Editor',
  preview: 'Preview',
  diff: 'Diff',
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

  // A single toggle button: shows the current view mode and cycles to the next
  // available one on click (a 2-way toggle when only Editor+Preview or
  // Editor+Diff exist; a 3-way cycle for a changed markdown file).
  let modeToggle: { label: string; nextLabel: string; isEditor: boolean; cycle: () => void } | null = null

  if (pane.activeFilePath && modeControls && (modeControls.canShowPreview || modeControls.canShowDiff)) {
    const available: Array<'editor' | 'preview' | 'diff'> = ['editor']
    if (modeControls.canShowPreview) available.push('preview')
    if (modeControls.canShowDiff) available.push('diff')

    const current = available.includes(modeControls.mode) ? modeControls.mode : 'editor'
    const next = available[(available.indexOf(current) + 1) % available.length]

    modeToggle = {
      label: MODE_LABEL[current],
      nextLabel: MODE_LABEL[next],
      isEditor: current === 'editor',
      cycle: () => {
        state.onActivateEditorPane(paneId)
        if (next === 'editor') modeControls.showEditor()
        else if (next === 'preview') modeControls.showPreview()
        else modeControls.showDiff()
      },
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {modeToggle && (
        <button
          type="button"
          onClick={modeToggle.cycle}
          title={`Switch to ${modeToggle.nextLabel}`}
          style={{
            ...modeToggleStyles.button,
            ...(modeToggle.isEditor ? {} : modeToggleStyles.buttonAlt),
          }}
        >
          <SwapIcon />
          {modeToggle.label}
        </button>
      )}
      <ActionMenuButton
        buttonLabel={<PaneButtonIcon />}
        title="Pane actions"
        menuLabel="Pane actions"
        items={items}
      />
    </div>
  )
}

const modeToggleStyles: Record<string, React.CSSProperties> = {
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '1px 8px',
    fontSize: '11px',
    lineHeight: 1.7,
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  buttonAlt: {
    color: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
}
