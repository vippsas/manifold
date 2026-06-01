import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceHeaderActions } from './WorkspaceHeaderActions'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import type { IDockviewHeaderActionsProps } from 'dockview'

const state = {
  onOpenModule: () => {},
  isModuleOpen: () => false,
  editorPaneIds: [],
} as unknown as DockAppState

function props(panelIds: string[]): IDockviewHeaderActionsProps {
  return { panels: panelIds.map((id) => ({ id })) } as unknown as IDockviewHeaderActionsProps
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
