import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    for (const group of [['projects'], ['agent', 'editor'], ['modifiedFiles', 'editor']]) {
      const { unmount } = render(
        <DockStateContext.Provider value={state}>
          <WorkspaceHeaderActions {...props(group)} />
        </DockStateContext.Provider>,
      )
      expect(screen.queryByRole('button', { name: /open module/i })).not.toBeInTheDocument()
      unmount()
    }
  })

  // The Files / Modified Files tabs are icon-only without per-tab close
  // buttons, so their group header carries a single × that closes both.
  it('renders one close button for the files group that closes every file panel', () => {
    const onClosePanel = vi.fn()
    render(
      <DockStateContext.Provider value={{ ...state, onClosePanel } as unknown as DockAppState}>
        <WorkspaceHeaderActions {...props(['modifiedFiles', 'editor'])} />
      </DockStateContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close Files' }))

    expect(onClosePanel).toHaveBeenCalledTimes(2)
    expect(onClosePanel).toHaveBeenCalledWith('modifiedFiles')
    expect(onClosePanel).toHaveBeenCalledWith('modifiedFiles')
  })

  it('renders a close button for the repositories group without any + action', () => {
    const onClosePanel = vi.fn()
    render(
      <DockStateContext.Provider value={{ ...state, onClosePanel } as unknown as DockAppState}>
        <WorkspaceHeaderActions {...props(['projects'])} />
      </DockStateContext.Provider>,
    )

    expect(screen.queryByRole('button', { name: /add agent/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close Repositories' }))

    expect(onClosePanel).toHaveBeenCalledExactlyOnceWith('projects')
  })

  it('renders no group close button in groups without an icon-tab panel', () => {
    render(
      <DockStateContext.Provider value={state}>
        <WorkspaceHeaderActions {...props(['agent', 'shell'])} />
      </DockStateContext.Provider>,
    )

    expect(screen.queryByRole('button', { name: /^Close / })).not.toBeInTheDocument()
  })
})
