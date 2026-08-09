import { describe, it, expect, vi } from 'vitest'
import type { MenuItem } from '../common/ContextMenu'
import { buildWorkspaceContextMenu } from './workspace-context-menu'

function labels(items: MenuItem[]): string[] {
  return items.map((i) => (i === 'separator' ? '---' : i.label))
}

const required = {
  isFavorite: false,
  toggleFavorite: vi.fn(),
  removeWorkspace: vi.fn(),
}

describe('buildWorkspaceContextMenu', () => {
  it('offers to add when the workspace is not a favorite', () => {
    const items = buildWorkspaceContextMenu({ ...required, isFavorite: false })
    expect(labels(items)[0]).toBe('Add to Favorites')
  })

  it('offers to remove when the workspace is already a favorite', () => {
    const items = buildWorkspaceContextMenu({ ...required, isFavorite: true })
    expect(labels(items)[0]).toBe('Remove from Favorites')
  })

  it('runs the toggle handler for the favorites item', () => {
    const toggleFavorite = vi.fn()
    const items = buildWorkspaceContextMenu({ ...required, toggleFavorite })
    const first = items[0]
    if (first === 'separator') throw new Error('expected an action')
    first.action()
    expect(toggleFavorite).toHaveBeenCalledOnce()
  })

  it('lists every action when all handlers are supplied', () => {
    const items = buildWorkspaceContextMenu({
      ...required,
      rename: vi.fn(),
      copyToWorktree: vi.fn(),
      addFolder: vi.fn(),
    })
    expect(labels(items)).toEqual([
      'Add to Favorites',
      '---',
      'Rename…',
      'New Workspace, Same Folders',
      'Add Folder…',
      '---',
      'Remove Workspace',
    ])
  })

  // Starting an agent lives on the agent group's tab bar and nowhere else; a
  // second route from this menu read as a competing way to do the same thing.
  it('offers no way to start an agent', () => {
    const items = buildWorkspaceContextMenu({
      ...required,
      rename: vi.fn(),
      copyToWorktree: vi.fn(),
      addFolder: vi.fn(),
    })
    expect(labels(items).some((label) => /agent/i.test(label))).toBe(false)
  })

  it('omits actions whose handler is absent', () => {
    const items = buildWorkspaceContextMenu({ ...required, rename: vi.fn() })
    expect(labels(items)).toEqual([
      'Add to Favorites',
      '---',
      'Rename…',
      '---',
      'Remove Workspace',
    ])
  })

  it('leaves no doubled separator when every optional action is absent', () => {
    const items = buildWorkspaceContextMenu(required)
    expect(labels(items)).toEqual(['Add to Favorites', '---', 'Remove Workspace'])
  })

  // The row's `+` button opens this menu, so it has to be worth opening even
  // where the dock state favorites read from is absent — no favorites item, no
  // leading separator, and never an empty menu.
  it('drops the favorites item, and its separator, without a toggle handler', () => {
    const items = buildWorkspaceContextMenu({
      removeWorkspace: vi.fn(),
      copyToWorktree: vi.fn(),
      addFolder: vi.fn(),
    })
    expect(labels(items)).toEqual([
      'New Workspace, Same Folders',
      'Add Folder…',
      '---',
      'Remove Workspace',
    ])
  })
})
