import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PluginTree } from './plugin-tree'
import type { SerializedTreeItem } from '../../../../shared/plugins/tree'

const ROOT_COLLAPSIBLE: SerializedTreeItem = {
  nodeId: 'parent-1',
  label: 'Parent Node',
  collapsibleState: 'collapsed',
  description: 'a folder',
}

const CHILD_ITEM: SerializedTreeItem = {
  nodeId: 'child-1',
  label: 'Child Node',
  collapsibleState: 'none',
}

const ROOT_LEAF: SerializedTreeItem = {
  nodeId: 'leaf-1',
  label: 'Leaf Node',
  collapsibleState: 'none',
  command: { command: 'myExtension.open', args: ['/path'] },
}

const ROOT_AUTO_EXPANDED: SerializedTreeItem = {
  nodeId: 'parent-2',
  label: 'Auto Parent',
  collapsibleState: 'expanded',
}

describe('PluginTree', () => {
  it('renders root labels', () => {
    const loadChildren = vi.fn()
    const onActivate = vi.fn()
    render(
      <PluginTree
        roots={[ROOT_COLLAPSIBLE, ROOT_LEAF]}
        reloadKey={0}
        loadChildren={loadChildren}
        onActivate={onActivate}
      />,
    )
    expect(screen.getByText('Parent Node')).toBeInTheDocument()
    expect(screen.getByText('Leaf Node')).toBeInTheDocument()
  })

  it('calls loadChildren on expand and shows child label', async () => {
    const loadChildren = vi.fn().mockResolvedValue([CHILD_ITEM])
    const onActivate = vi.fn()
    render(
      <PluginTree
        roots={[ROOT_COLLAPSIBLE, ROOT_LEAF]}
        reloadKey={0}
        loadChildren={loadChildren}
        onActivate={onActivate}
      />,
    )

    // Click the collapsible row to expand
    fireEvent.click(screen.getByText('Parent Node'))

    expect(loadChildren).toHaveBeenCalledWith('parent-1')

    // The child label should appear after the async load
    await waitFor(() => expect(screen.getByText('Child Node')).toBeInTheDocument())
  })

  it('calls onActivate when a leaf with a command is clicked', () => {
    const loadChildren = vi.fn()
    const onActivate = vi.fn()
    render(
      <PluginTree
        roots={[ROOT_COLLAPSIBLE, ROOT_LEAF]}
        reloadKey={0}
        loadChildren={loadChildren}
        onActivate={onActivate}
      />,
    )

    fireEvent.click(screen.getByText('Leaf Node'))

    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenCalledWith(ROOT_LEAF)
  })

  it('resets expansion and cache when reloadKey changes', async () => {
    const loadChildren = vi.fn().mockResolvedValue([CHILD_ITEM])
    const onActivate = vi.fn()
    const { rerender } = render(
      <PluginTree
        roots={[ROOT_COLLAPSIBLE]}
        reloadKey={0}
        loadChildren={loadChildren}
        onActivate={onActivate}
      />,
    )

    // Expand the collapsible row
    fireEvent.click(screen.getByText('Parent Node'))
    await waitFor(() => expect(screen.getByText('Child Node')).toBeInTheDocument())

    // Simulate a refresh: new reloadKey collapses all
    rerender(
      <PluginTree
        roots={[ROOT_COLLAPSIBLE]}
        reloadKey={1}
        loadChildren={loadChildren}
        onActivate={onActivate}
      />,
    )

    expect(screen.queryByText('Child Node')).not.toBeInTheDocument()
  })

  it('caches children: re-expanding a node does not reload', async () => {
    const loadChildren = vi.fn().mockResolvedValue([CHILD_ITEM])
    const onActivate = vi.fn()
    render(
      <PluginTree
        roots={[ROOT_COLLAPSIBLE]}
        reloadKey={0}
        loadChildren={loadChildren}
        onActivate={onActivate}
      />,
    )

    // Expand → load
    fireEvent.click(screen.getByText('Parent Node'))
    await waitFor(() => expect(screen.getByText('Child Node')).toBeInTheDocument())

    // Collapse
    fireEvent.click(screen.getByText('Parent Node'))
    await waitFor(() => expect(screen.queryByText('Child Node')).not.toBeInTheDocument())

    // Re-expand → served from cache, no second load
    fireEvent.click(screen.getByText('Parent Node'))
    await waitFor(() => expect(screen.getByText('Child Node')).toBeInTheDocument())

    expect(loadChildren).toHaveBeenCalledTimes(1)
  })

  it('auto-expands a root flagged "expanded" and loads its children without a click', async () => {
    const loadChildren = vi.fn().mockResolvedValue([CHILD_ITEM])
    const onActivate = vi.fn()
    render(
      <PluginTree
        roots={[ROOT_AUTO_EXPANDED]}
        reloadKey={0}
        loadChildren={loadChildren}
        onActivate={onActivate}
      />,
    )

    await waitFor(() => expect(loadChildren).toHaveBeenCalledWith('parent-2'))
    await waitFor(() => expect(screen.getByText('Child Node')).toBeInTheDocument())
  })
})
