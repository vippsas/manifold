import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { SidebarCollapseAction, LeftHeaderActions } from './SidebarCollapseAction'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import type { AgentStatus } from '../../../../shared/types'

const panelsOf = (...ids: string[]): IDockviewHeaderActionsProps['panels'] =>
  ids.map((id) => ({ id })) as unknown as IDockviewHeaderActionsProps['panels']

function renderAction(
  side: 'left' | 'right',
  panels: IDockviewHeaderActionsProps['panels'],
  onCollapseSidebar = vi.fn(),
): ReturnType<typeof vi.fn> {
  render(
    <DockStateContext.Provider value={{ onCollapseSidebar } as unknown as DockAppState}>
      <SidebarCollapseAction side={side} panels={panels} />
    </DockStateContext.Provider>,
  )
  return onCollapseSidebar
}

describe('SidebarCollapseAction', () => {
  it('renders the repositories collapse button for the projects group and collapses left', () => {
    const onCollapseSidebar = renderAction('left', panelsOf('projects'))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Repositories' }))
    expect(onCollapseSidebar).toHaveBeenCalledWith('left')
  })

  it('renders the files collapse button for the file-tree group and collapses right', () => {
    const onCollapseSidebar = renderAction('right', panelsOf('fileTree', 'modifiedFiles'))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Files' }))
    expect(onCollapseSidebar).toHaveBeenCalledWith('right')
  })

  it('renders nothing for a group that does not own the matching sidebar panel', () => {
    renderAction('left', panelsOf('agent', 'editor'))
    expect(screen.queryByRole('button', { name: /^Collapse / })).toBeNull()
  })
})

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
})
