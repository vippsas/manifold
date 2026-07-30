import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityBar, type ActivityBarProps } from './ActivityBar'
import type { DockPanelId } from '../hooks/dock-layout/useDockLayout'

function makeDockLayout(visible: DockPanelId[] = []): ActivityBarProps['dockLayout'] {
  return {
    isPanelVisible: (id: DockPanelId) => visible.includes(id),
    togglePanel: vi.fn(),
  }
}

describe('ActivityBar', () => {
  it('renders one button per rail item, labeled with the item title', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession />)

    for (const label of ['Repositories', 'Agent', 'Editor', 'Shell']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('offers no separate rail item for the panels that share the files item', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession />)

    expect(screen.queryByRole('button', { name: 'Modified Files' })).not.toBeInTheDocument()
  })

  // The tree lives under a repo's row in Repositories, so the rail has nothing
  // left to toggle for it.
  it('offers no Files rail item', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession />)

    expect(screen.queryByRole('button', { name: 'Files' })).not.toBeInTheDocument()
  })

  it('marks visible panels as active', () => {
    render(<ActivityBar dockLayout={makeDockLayout(['projects', 'shell'])} hasActiveSession />)

    expect(screen.getByRole('button', { name: 'Repositories' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Shell' })).toHaveClass('activity-bar-item--active')
    expect(screen.getByRole('button', { name: 'Editor' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Editor' })).not.toHaveClass('activity-bar-item--active')
  })

  it('marks the files item active while any of its panels is open', () => {
    render(<ActivityBar dockLayout={makeDockLayout(['editor'])} hasActiveSession />)

    expect(screen.getByRole('button', { name: 'Editor' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens both tabs of the files item when it is closed', () => {
    const dockLayout = makeDockLayout(['projects'])
    render(<ActivityBar dockLayout={dockLayout} hasActiveSession />)

    fireEvent.click(screen.getByRole('button', { name: 'Editor' }))

    expect(dockLayout.togglePanel).toHaveBeenCalledWith('modifiedFiles')
    expect(dockLayout.togglePanel).toHaveBeenCalledWith('editor')
  })

  it('closes every open panel of the files item in one click', () => {
    const dockLayout = makeDockLayout(['editor'])
    render(<ActivityBar dockLayout={dockLayout} hasActiveSession />)

    fireEvent.click(screen.getByRole('button', { name: 'Editor' }))

    expect(dockLayout.togglePanel).toHaveBeenCalledWith('editor')
    expect(dockLayout.togglePanel).not.toHaveBeenCalledWith('modifiedFiles')
  })

  it('disables session-dependent panels when no session is active', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession={false} />)

    expect(screen.getByRole('button', { name: 'Repositories' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Agent' })).toBeEnabled()
    for (const label of ['Editor', 'Shell']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
    }
  })

  it('renders the panel name as a hover tooltip inside each item', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession />)

    const shell = screen.getByRole('button', { name: 'Shell' })
    const tooltip = shell.querySelector('.activity-bar-tooltip')
    expect(tooltip).not.toBeNull()
    expect(tooltip).toHaveTextContent('Shell')
  })

  it('renders a settings button at the bottom that opens settings', () => {
    const onOpenSettings = vi.fn()
    render(
      <ActivityBar dockLayout={makeDockLayout()} hasActiveSession={false} onOpenSettings={onOpenSettings} />,
    )

    const settings = screen.getByRole('button', { name: 'Settings' })
    expect(settings).toBeEnabled()
    fireEvent.click(settings)
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('omits the settings button when no handler is provided', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession />)

    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('renders a search button directly above settings that opens the search modal', () => {
    const onOpenSearch = vi.fn()
    render(
      <ActivityBar dockLayout={makeDockLayout()} hasActiveSession={false} onOpenSearch={onOpenSearch} onOpenSettings={vi.fn()} />,
    )

    const search = screen.getByRole('button', { name: 'Search' })
    const settings = screen.getByRole('button', { name: 'Settings' })
    expect(search.nextElementSibling).toBe(settings)
    fireEvent.click(search)
    expect(onOpenSearch).toHaveBeenCalled()
  })

  it('omits the search button when no handler is provided', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession onOpenSettings={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
  })
})
