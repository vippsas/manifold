import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceHeaderActions } from './WorkspaceHeaderActions'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { registerPanelContribution, resetToInternal } from '../../../plugins/contribution-registry'

// The "+ Apps" launcher only renders when at least one launcher contribution exists.
// Built-in modules ship as plugins now (Verdicts → manifold.statistics, #750) and none
// are seeded in tests, so register a plugin launcher view to mirror the real app.
beforeEach(() => {
  registerPanelContribution({ id: 'manifold.statistics.panel', title: 'Statistics', description: 'Stats.', launcher: true, source: 'plugin', kind: 'webview' })
})
afterEach(() => resetToInternal())

const state = {
  sessionId: 's1',
  onOpenModule: () => {},
  isModuleOpen: () => false,
  editorPaneIds: [],
} as unknown as DockAppState

function props(panelIds: string[], activePanelId = panelIds[0]): IDockviewHeaderActionsProps {
  return {
    panels: panelIds.map((id) => ({ id })),
    activePanel: { id: activePanelId },
  } as unknown as IDockviewHeaderActionsProps
}

describe('WorkspaceHeaderActions', () => {
  it('shows the launcher for the group that owns the agent panel', () => {
    render(
      <DockStateContext.Provider value={state}>
        <WorkspaceHeaderActions {...props(['agent', 'editor'])} />
      </DockStateContext.Provider>,
    )
    expect(screen.getByRole('button', { name: /open module/i })).toBeInTheDocument()
  })

  it('hides the launcher for groups without the agent panel', () => {
    render(
      <DockStateContext.Provider value={state}>
        <WorkspaceHeaderActions {...props(['fileTree', 'modifiedFiles'])} />
      </DockStateContext.Provider>,
    )
    expect(screen.queryByRole('button', { name: /open module/i })).not.toBeInTheDocument()
  })
})
