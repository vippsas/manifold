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
    for (const group of [['sidebar'], ['agent', 'editor'], ['editor']]) {
      const { unmount } = render(
        <DockStateContext.Provider value={state}>
          <WorkspaceHeaderActions {...props(group)} />
        </DockStateContext.Provider>,
      )
      expect(screen.queryByRole('button', { name: /open module/i })).not.toBeInTheDocument()
      unmount()
    }
  })

  // The editor's tab is icon-only without a per-tab close button, so its group
  // header carries the × instead.
  it('renders a close button for the editor group', () => {
    const onClosePanel = vi.fn()
    render(
      <DockStateContext.Provider value={{ ...state, onClosePanel } as unknown as DockAppState}>
        <WorkspaceHeaderActions {...props(['editor'])} />
      </DockStateContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close Editor' }))

    expect(onClosePanel).toHaveBeenCalledExactlyOnceWith('editor')
  })

  // The sidebar renders no tab of its own, so this × is the only way to close
  // it from the dock — without it the sidebar could only be collapsed.
  it('renders a close button for the sidebar group without any + action', () => {
    const onClosePanel = vi.fn()
    render(
      <DockStateContext.Provider value={{ ...state, onClosePanel } as unknown as DockAppState}>
        <WorkspaceHeaderActions {...props(['sidebar'])} />
      </DockStateContext.Provider>,
    )

    expect(screen.queryByRole('button', { name: /add agent/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close Sidebar' }))

    expect(onClosePanel).toHaveBeenCalledExactlyOnceWith('sidebar')
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
