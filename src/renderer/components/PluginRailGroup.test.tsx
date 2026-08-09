import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PluginRailGroup, type PluginRailProps } from './PluginRailGroup'
import { registerPanelContribution, resetToInternal } from '../plugins/contribution-registry'
import type { PanelContribution } from '../../shared/plugins/contributions'

function registerView(overrides: Partial<PanelContribution> & Pick<PanelContribution, 'id' | 'title'>): void {
  registerPanelContribution({
    description: '',
    launcher: false,
    source: 'plugin',
    ...overrides,
  })
}

function renderGroup(overrides: Partial<PluginRailProps> = {}): PluginRailProps {
  const props: PluginRailProps = {
    isOpen: overrides.isOpen ?? (() => false),
    onOpen: overrides.onOpen ?? vi.fn(),
    onClose: overrides.onClose ?? vi.fn(),
  }
  render(<PluginRailGroup {...props} />)
  return props
}

afterEach(() => { resetToInternal() })

describe('PluginRailGroup', () => {
  // The rail's promise is "an enabled plugin gets an icon" — `launcher` governs
  // the agent's Apps list only, so a launcher:false plugin must still appear.
  it('shows one icon per plugin view regardless of the launcher flag', () => {
    registerView({ id: 'manifold.statistics.panel', title: 'Statistics', launcher: false })
    registerView({ id: 'manifold.watch.panel', title: 'Watch', launcher: true })

    renderGroup()

    expect(screen.getByRole('button', { name: 'Statistics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Watch' })).toBeInTheDocument()
  })

  it('opens a view whose panel is closed', () => {
    registerView({ id: 'manifold.watch.panel', title: 'Watch' })
    const onOpen = vi.fn()
    const onClose = vi.fn()

    renderGroup({ isOpen: () => false, onOpen, onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))

    expect(onOpen).toHaveBeenCalledWith('manifold.watch.panel', 'Watch', undefined)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes a view whose panel is already open', () => {
    registerView({ id: 'manifold.watch.panel', title: 'Watch' })
    const onOpen = vi.fn()
    const onClose = vi.fn()

    renderGroup({ isOpen: () => true, onOpen, onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))

    expect(onClose).toHaveBeenCalledWith('manifold.watch.panel')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('routes a tree view through the tree opener', () => {
    registerView({ id: 'manifold.hello-tree.view', title: 'Hello Tree', kind: 'tree' })
    const onOpen = vi.fn()

    renderGroup({ onOpen })
    fireEvent.click(screen.getByRole('button', { name: 'Hello Tree' }))

    expect(onOpen).toHaveBeenCalledWith('manifold.hello-tree.view', 'Hello Tree', 'tree')
  })

  it('marks the icon of an open view as pressed', () => {
    registerView({ id: 'manifold.watch.panel', title: 'Watch' })
    registerView({ id: 'manifold.loop.panel', title: 'Loop' })

    renderGroup({ isOpen: (id) => id === 'manifold.loop.panel' })

    expect(screen.getByRole('button', { name: 'Loop' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Watch' })).toHaveAttribute('aria-pressed', 'false')
  })

  // A view contributed by a plugin built against a newer host names an icon we
  // don't ship; it must still get a usable glyph rather than an empty button.
  it('renders a glyph for a view with no icon', () => {
    registerView({ id: 'manifold.hello.panel', title: 'Hello' })

    renderGroup()

    expect(screen.getByRole('button', { name: 'Hello' }).querySelector('svg')).not.toBeNull()
  })

  // A separator hanging above empty space reads as a rendering bug.
  it('renders nothing at all — divider included — with no plugin views', () => {
    const { container } = render(
      <PluginRailGroup isOpen={() => false} onOpen={vi.fn()} onClose={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
