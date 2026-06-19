import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardSidebarButton } from './DashboardSidebarButton'
import { DockStateContext, type DockAppState } from '../editor/editor-shell/dock-panel-types'

describe('DashboardSidebarButton', () => {
  it('renders and opens the dashboard on click', () => {
    const onOpenDashboard = vi.fn()
    render(
      <DockStateContext.Provider value={{ onOpenDashboard } as unknown as DockAppState}>
        <DashboardSidebarButton />
      </DockStateContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Dashboard/i }))
    expect(onOpenDashboard).toHaveBeenCalled()
  })

  it('renders nothing without an open handler', () => {
    const { container } = render(
      <DockStateContext.Provider value={{} as DockAppState}>
        <DashboardSidebarButton />
      </DockStateContext.Provider>,
    )
    expect(container.firstChild).toBeNull()
  })
})
