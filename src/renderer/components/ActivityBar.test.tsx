import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityBar, type ActivityBarProps } from './ActivityBar'
import type { DockPanelId } from '../hooks/dock-layout/useDockLayout'
import type { SidebarViewId } from './sidebar/sidebar-views'

function makeDockLayout(visible: DockPanelId[] = []): ActivityBarProps['dockLayout'] {
  return {
    isPanelVisible: (id: DockPanelId) => visible.includes(id),
    togglePanel: vi.fn(),
    focusPanel: vi.fn(),
  }
}

function renderRail(
  dockLayout: ActivityBarProps['dockLayout'],
  overrides: Partial<ActivityBarProps> = {},
): { onSelectSidebarView: ActivityBarProps['onSelectSidebarView'] } {
  const onSelectSidebarView = overrides.onSelectSidebarView ?? vi.fn()
  render(
    <ActivityBar
      dockLayout={dockLayout}
      sidebarView={overrides.sidebarView ?? 'explorer'}
      onSelectSidebarView={onSelectSidebarView}
      hasActiveSession={overrides.hasActiveSession ?? true}
      onOpenSettings={overrides.onOpenSettings}
    />,
  )
  return { onSelectSidebarView }
}

describe('ActivityBar', () => {
  it('offers one button per sidebar view and one per main-area panel', () => {
    renderRail(makeDockLayout())

    for (const label of ['Explorer', 'Source Control', 'Search', 'Agent', 'Editor', 'Shell']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  // The views live inside the one sidebar column now, so there is nothing named
  // after the panels they replaced.
  it('offers no rail item for the retired panels', () => {
    renderRail(makeDockLayout())

    for (const label of ['Repositories', 'Modified Files', 'Files']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('marks only the sidebar view actually on show as active', () => {
    renderRail(makeDockLayout(['sidebar']), { sidebarView: 'sourceControl' })

    expect(screen.getByRole('button', { name: 'Source Control' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-pressed', 'false')
  })

  // A collapsed sidebar shows nothing, so no view icon may claim to be active —
  // otherwise the rail says Explorer is open when the sidebar is shut.
  it('marks no sidebar view active while the sidebar is collapsed', () => {
    renderRail(makeDockLayout(), { sidebarView: 'explorer' })

    expect(screen.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Explorer' })).not.toHaveClass('activity-bar-item--active')
  })

  it('switches the sidebar view without reopening the sidebar', () => {
    const dockLayout = makeDockLayout(['sidebar'])
    const { onSelectSidebarView } = renderRail(dockLayout, { sidebarView: 'explorer' })

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(onSelectSidebarView).toHaveBeenCalledWith('search')
    expect(dockLayout.togglePanel).not.toHaveBeenCalled()
    expect(dockLayout.focusPanel).toHaveBeenCalledWith('sidebar')
  })

  it('opens the collapsed sidebar on the view that was asked for', () => {
    const dockLayout = makeDockLayout()
    const { onSelectSidebarView } = renderRail(dockLayout, { sidebarView: 'explorer' })

    fireEvent.click(screen.getByRole('button', { name: 'Source Control' }))

    expect(onSelectSidebarView).toHaveBeenCalledWith('sourceControl')
    expect(dockLayout.togglePanel).toHaveBeenCalledWith('sidebar')
  })

  // VS Code's behaviour: the icon of the view on show is a toggle, so the same
  // click that revealed the sidebar puts it away again.
  it('collapses the sidebar when the view already showing is clicked', () => {
    const dockLayout = makeDockLayout(['sidebar'])
    const { onSelectSidebarView } = renderRail(dockLayout, { sidebarView: 'explorer' })

    fireEvent.click(screen.getByRole('button', { name: 'Explorer' }))

    expect(dockLayout.togglePanel).toHaveBeenCalledWith('sidebar')
    expect(onSelectSidebarView).not.toHaveBeenCalled()
  })

  it('toggles a main-area panel directly', () => {
    const dockLayout = makeDockLayout()
    renderRail(dockLayout)

    fireEvent.click(screen.getByRole('button', { name: 'Shell' }))

    expect(dockLayout.togglePanel).toHaveBeenCalledWith('shell')
  })

  it('marks visible main-area panels as active', () => {
    renderRail(makeDockLayout(['shell']))

    expect(screen.getByRole('button', { name: 'Shell' })).toHaveClass('activity-bar-item--active')
    expect(screen.getByRole('button', { name: 'Editor' })).toHaveAttribute('aria-pressed', 'false')
  })

  // The sidebar views work without an agent — they are about the workspace, not
  // the session — so only the session-scoped panels go dim.
  it('disables session-dependent panels when no session is active', () => {
    renderRail(makeDockLayout(), { hasActiveSession: false })

    for (const label of ['Explorer', 'Source Control', 'Search', 'Agent']) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled()
    }
    for (const label of ['Editor', 'Shell']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
    }
  })

  it('renders the view name as a hover tooltip inside each item', () => {
    renderRail(makeDockLayout())

    const tooltip = screen.getByRole('button', { name: 'Source Control' }).querySelector('.activity-bar-tooltip')
    expect(tooltip).toHaveTextContent('Source Control')
  })

  it('renders a settings button at the bottom that opens settings', () => {
    const onOpenSettings = vi.fn()
    renderRail(makeDockLayout(), { hasActiveSession: false, onOpenSettings })

    const settings = screen.getByRole('button', { name: 'Settings' })
    expect(settings).toBeEnabled()
    fireEvent.click(settings)
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('omits the settings button when no handler is provided', () => {
    renderRail(makeDockLayout())

    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })
})
