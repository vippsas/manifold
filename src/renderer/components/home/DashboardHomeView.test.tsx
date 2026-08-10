import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardHomeView } from './DashboardHomeView'
import { DockStateContext, type DockAppState } from '../editor/editor-shell/dock-panel-types'
import { registerPanelContribution, resetToInternal } from '../../plugins/contribution-registry'

function renderView(props: { onClose?: () => void; initialCard?: string | null } = {}): void {
  render(
    <DockStateContext.Provider value={{ theme: 'dark' } as unknown as DockAppState}>
      <DashboardHomeView onClose={props.onClose ?? vi.fn()} initialCard={props.initialCard} />
    </DockStateContext.Provider>,
  )
}

/** What an enabled plugin's view looks like once main's contributions reach the registry. */
function registerView(id: string, title: string): void {
  registerPanelContribution({ id, title, description: '', launcher: false, source: 'plugin', kind: 'webview' })
}

describe('DashboardHomeView', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => ({ worktrees: 0, cleanableBranches: 0, repos: 0 })), on: vi.fn(() => () => {}) }
    resetToInternal()
    registerView('manifold.worktrees.panel', 'Worktrees')
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

  it('hides a card whose plugin view is unavailable, and shows it once registered', () => {
    // Statistics ships disabled, so its view never reaches the registry.
    renderView()
    expect(screen.queryByRole('button', { name: /Statistics/i })).toBeNull()

    registerView('manifold.statistics.panel', 'Statistics')
    renderView()
    expect(screen.getAllByRole('button', { name: /Statistics/i }).length).toBeGreaterThan(0)
  })

  it('falls back to the grid when initialCard names an unavailable card', () => {
    renderView({ initialCard: 'statistics' })
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByTitle('manifold.statistics.panel')).toBeNull()
  })

  it('Esc closes from the grid', () => {
    const onClose = vi.fn()
    renderView({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
