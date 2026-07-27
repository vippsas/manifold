import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { LeftHeaderActions } from './LeftHeaderActions'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import type { AgentStatus } from '../../../../shared/types'

const panelsOf = (...ids: string[]): IDockviewHeaderActionsProps['panels'] =>
  ids.map((id) => ({ id })) as unknown as IDockviewHeaderActionsProps['panels']

function renderLeftActions(
  panels: IDockviewHeaderActionsProps['panels'],
  status: AgentStatus | null,
): void {
  const props = { panels, activePanel: panels[0] } as unknown as IDockviewHeaderActionsProps
  render(
    <DockStateContext.Provider value={{
      activeSessionStatus: status,
      activeProjectId: 'proj-1',
      activeSessionWorktreePath: '/repo/wt',
      activeSessionNoWorktree: false,
      onLaunchAgent: async () => null,
    } as unknown as DockAppState}>
      <LeftHeaderActions {...props} />
    </DockStateContext.Provider>,
  )
}

describe('LeftHeaderActions', () => {
  it('shows the add-agent button in the repositories group while the session is live', () => {
    renderLeftActions(panelsOf('projects'), 'running')
    expect(screen.getByRole('button', { name: /add agent/i })).toBeInTheDocument()
  })

  it('hides the add-agent button when the session is not running or waiting', () => {
    renderLeftActions(panelsOf('projects'), 'done')
    expect(screen.queryByRole('button', { name: /add agent/i })).toBeNull()
  })

  it('hides the add-agent button for a group that does not own the projects panel', () => {
    renderLeftActions(panelsOf('agent'), 'running')
    expect(screen.queryByRole('button', { name: /add agent/i })).toBeNull()
  })

  it('renders no sidebar collapse button — closing a panel replaces collapsing', () => {
    renderLeftActions(panelsOf('projects'), 'running')
    expect(screen.queryByRole('button', { name: /^Collapse / })).toBeNull()
  })
})
