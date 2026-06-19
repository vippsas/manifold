import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardHomeView } from './DashboardHomeView'
import { DockStateContext, type DockAppState } from '../editor/editor-shell/dock-panel-types'

function renderView(props: { onClose?: () => void; initialCard?: string | null } = {}): void {
  render(
    <DockStateContext.Provider value={{ theme: 'dark' } as unknown as DockAppState}>
      <DashboardHomeView onClose={props.onClose ?? vi.fn()} initialCard={props.initialCard} />
    </DockStateContext.Provider>,
  )
}

describe('DashboardHomeView', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => ({ worktrees: 0, cleanableBranches: 0, repos: 0 })), on: vi.fn(() => () => {}) }
  })

  it('shows the card grid, drills in on click, and returns via back', () => {
    renderView()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Worktrees/i }))
    expect(screen.getByTitle('manifold.worktrees.panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to Dashboard/i }))
    expect(screen.queryByTitle('manifold.worktrees.panel')).toBeNull()
  })

  it('opens straight into a card when initialCard is set', () => {
    renderView({ initialCard: 'worktrees' })
    expect(screen.getByTitle('manifold.worktrees.panel')).toBeInTheDocument()
  })

  it('Esc closes from the grid', () => {
    const onClose = vi.fn()
    renderView({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
