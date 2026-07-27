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
  it('renders one button per dock panel, labeled with the panel title', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession />)

    for (const label of ['Repositories', 'Agent', 'Editor', 'Files', 'Modified Files', 'Shell']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('marks visible panels as active', () => {
    render(<ActivityBar dockLayout={makeDockLayout(['projects', 'shell'])} hasActiveSession />)

    expect(screen.getByRole('button', { name: 'Repositories' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Shell' })).toHaveClass('activity-bar-item--active')
    expect(screen.getByRole('button', { name: 'Editor' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Editor' })).not.toHaveClass('activity-bar-item--active')
  })

  it('toggles the panel when an item is clicked', () => {
    const dockLayout = makeDockLayout(['projects'])
    render(<ActivityBar dockLayout={dockLayout} hasActiveSession />)

    fireEvent.click(screen.getByRole('button', { name: 'Files' }))

    expect(dockLayout.togglePanel).toHaveBeenCalledWith('fileTree')
  })

  it('disables session-dependent panels when no session is active', () => {
    render(<ActivityBar dockLayout={makeDockLayout()} hasActiveSession={false} />)

    expect(screen.getByRole('button', { name: 'Repositories' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Agent' })).toBeEnabled()
    for (const label of ['Editor', 'Files', 'Modified Files', 'Shell']) {
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
})
