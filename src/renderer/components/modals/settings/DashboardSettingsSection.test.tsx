import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardSettingsSection } from './DashboardSettingsSection'
import { DockStateContext, type DockAppState } from '../../editor/editor-shell/dock-panel-types'

function renderSection(props: { initialCard?: string | null } = {}): void {
  render(
    <DockStateContext.Provider value={{ theme: 'dark' } as unknown as DockAppState}>
      <DashboardSettingsSection initialCard={props.initialCard} />
    </DockStateContext.Provider>,
  )
}

describe('DashboardSettingsSection', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => ({ worktrees: 0, cleanableBranches: 0, repos: 0 })), on: vi.fn(() => () => {}) }
  })

  it('shows the card grid, drills in on click, and returns via back', () => {
    renderSection()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Worktrees/i }))
    expect(screen.getByTitle('manifold.worktrees.panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to Dashboard/i }))
    expect(screen.queryByTitle('manifold.worktrees.panel')).toBeNull()
  })

  it('opens straight into a card when initialCard is set', () => {
    renderSection({ initialCard: 'worktrees' })
    expect(screen.getByTitle('manifold.worktrees.panel')).toBeInTheDocument()
  })
})
