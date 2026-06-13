import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { SidebarCollapseAction } from './SidebarCollapseAction'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'

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
