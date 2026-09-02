import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextMenuAction } from '../common/ContextMenu'
import { buildRepoRowContextMenu, tildePath } from './repo-row-context-menu'

describe('tildePath', () => {
  it('shortens a macOS path under home', () => {
    expect(tildePath('/Users/tester/projects/manifold-2')).toBe('~/projects/manifold-2')
  })

  it('shortens a Linux path under home', () => {
    expect(tildePath('/home/tester/projects/manifold-2')).toBe('~/projects/manifold-2')
  })

  it('shortens the home directory itself to a bare tilde', () => {
    expect(tildePath('/Users/tester')).toBe('~')
  })

  it('leaves a path outside any home directory alone', () => {
    expect(tildePath('/opt/repos/alpha')).toBe('/opt/repos/alpha')
  })

  it('does not mistake a sibling of /Users for a home', () => {
    expect(tildePath('/Usersdata/repos/alpha')).toBe('/Usersdata/repos/alpha')
  })
})

describe('buildRepoRowContextMenu', () => {
  const writeText = vi.fn()

  beforeEach(() => {
    writeText.mockReset()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
  })

  function labels(items: ReturnType<typeof buildRepoRowContextMenu>): string[] {
    return items.map((item) => (item === 'separator' ? '—' : item.label))
  }

  function itemNamed(items: ReturnType<typeof buildRepoRowContextMenu>, label: string): ContextMenuAction {
    const found = items.find((item) => item !== 'separator' && item.label === label)
    if (!found || found === 'separator') throw new Error(`no item labelled ${label}`)
    return found
  }

  it('offers Copy Path then Copy Relative Path, adjacent', () => {
    expect(labels(buildRepoRowContextMenu('/Users/tester/repos/alpha')))
      .toEqual(['Copy Path', 'Copy Relative Path'])
  })

  it('Copy Path writes the absolute path', () => {
    itemNamed(buildRepoRowContextMenu('/Users/tester/repos/alpha'), 'Copy Path').action()
    expect(writeText).toHaveBeenCalledWith('/Users/tester/repos/alpha')
  })

  it('Copy Relative Path writes the tilde-shortened path under home', () => {
    itemNamed(buildRepoRowContextMenu('/Users/tester/repos/alpha'), 'Copy Relative Path').action()
    expect(writeText).toHaveBeenCalledWith('~/repos/alpha')
  })

  it('Copy Relative Path falls back to the absolute path outside home', () => {
    itemNamed(buildRepoRowContextMenu('/opt/repos/alpha'), 'Copy Relative Path').action()
    expect(writeText).toHaveBeenCalledWith('/opt/repos/alpha')
  })

  it('disables both items when the folder has no known path', () => {
    const items = buildRepoRowContextMenu(undefined)
    expect(labels(items)).toEqual(['Copy Path', 'Copy Relative Path'])
    for (const label of ['Copy Path', 'Copy Relative Path']) {
      const item = itemNamed(items, label)
      expect(item.disabled).toBe(true)
      item.action()
    }
    expect(writeText).not.toHaveBeenCalled()
  })
})
