import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WorkspaceHeaderActions } from './WorkspaceHeaderActions'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { ShellHeaderControls } from '../terminal/shell-header-controls'
import { registerShellHeaderControls, unregisterShellHeaderControls } from '../terminal/shell-header-controls'

const state = {
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

  it('shows the shell prompt toggle in the right header actions for the shell panel', () => {
    const onShellPromptChange = vi.fn()
    const controls: ShellHeaderControls = {
      activeTab: 'main',
      canAddShell: true,
      shellPrompt: true,
      extraShells: [],
      onSetActiveTab: vi.fn(),
      onRemoveShell: vi.fn(),
      onAddShell: vi.fn(),
      onShellPromptChange,
    }
    registerShellHeaderControls(controls)

    const { unmount } = render(
      <DockStateContext.Provider value={state}>
        <WorkspaceHeaderActions {...props(['shell'])} />
      </DockStateContext.Provider>,
    )

    const promptToggle = screen.getByRole('checkbox', { name: 'Use Manifold prompt in worktree shells' })
    expect(promptToggle).toBeChecked()
    fireEvent.click(promptToggle)
    expect(onShellPromptChange).toHaveBeenCalledWith(false)

    unmount()
    unregisterShellHeaderControls(controls)
  })
})
