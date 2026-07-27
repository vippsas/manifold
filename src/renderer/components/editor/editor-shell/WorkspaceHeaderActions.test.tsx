import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceHeaderActions } from './WorkspaceHeaderActions'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { registerPanelContribution, resetToInternal } from '../../../plugins/contribution-registry'

// Even with launcher contributions registered, no group header renders the
// "+ Apps" module launcher any more — apps are per-worktree and live in the
// agent's options (AgentSettingsModal) instead.
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
  it('renders no module launcher in any group header (apps live in agent settings)', () => {
    for (const group of [['projects'], ['agent', 'editor'], ['fileTree', 'modifiedFiles']]) {
      const { unmount } = render(
        <DockStateContext.Provider value={state}>
          <WorkspaceHeaderActions {...props(group)} />
        </DockStateContext.Provider>,
      )
      expect(screen.queryByRole('button', { name: /open module/i })).not.toBeInTheDocument()
      unmount()
    }
  })
})
