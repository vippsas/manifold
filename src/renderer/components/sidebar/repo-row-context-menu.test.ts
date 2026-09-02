import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextMenuAction } from '../common/ContextMenu'
import { buildRepoRowContextMenu, tildePath } from './repo-row-context-menu'

const HOME = '/Users/me'

describe('tildePath', () => {
  it('shortens a path under home', () => {
    expect(tildePath('/Users/me/projects/manifold-2', HOME)).toBe('~/projects/manifold-2')
  })

  it('shortens a Linux path under a Linux home', () => {
    expect(tildePath('/home/me/projects/manifold-2', '/home/me')).toBe('~/projects/manifold-2')
  })

  it('shortens the home directory itself to a bare tilde', () => {
    expect(tildePath('/Users/me', HOME)).toBe('~')
  })

  it('does not shorten another user\'s home', () => {
    expect(tildePath('/Users/someoneelse/projects/x', HOME)).toBe('/Users/someoneelse/projects/x')
  })

  it('does not shorten a sibling whose name merely extends home', () => {
    expect(tildePath('/Users/median/x', HOME)).toBe('/Users/median/x')
  })

  it('leaves a path outside any home alone', () => {
    expect(tildePath('/opt/repos/alpha', HOME)).toBe('/opt/repos/alpha')
  })

  it('ignores a trailing slash on the home value', () => {
    expect(tildePath('/Users/me/projects/x', '/Users/me/')).toBe('~/projects/x')
  })

  it('returns the path unchanged when home is absent or empty', () => {
    expect(tildePath('/Users/me/projects/x', undefined)).toBe('/Users/me/projects/x')
    expect(tildePath('/Users/me/projects/x', '')).toBe('/Users/me/projects/x')
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
    expect(labels(buildRepoRowContextMenu('/Users/me/repos/alpha', HOME)))
      .toEqual(['Copy Path', 'Copy Relative Path'])
  })

  it('Copy Path writes the absolute path', () => {
    itemNamed(buildRepoRowContextMenu('/Users/me/repos/alpha', HOME), 'Copy Path').action()
    expect(writeText).toHaveBeenCalledWith('/Users/me/repos/alpha')
  })

  it('Copy Relative Path writes the tilde-shortened path under home', () => {
    itemNamed(buildRepoRowContextMenu('/Users/me/repos/alpha', HOME), 'Copy Relative Path').action()
    expect(writeText).toHaveBeenCalledWith('~/repos/alpha')
  })

  it('Copy Relative Path stays absolute outside home', () => {
    itemNamed(buildRepoRowContextMenu('/opt/repos/alpha', HOME), 'Copy Relative Path').action()
    expect(writeText).toHaveBeenCalledWith('/opt/repos/alpha')
  })

  it('Copy Relative Path stays absolute when home is unknown', () => {
    itemNamed(buildRepoRowContextMenu('/Users/me/repos/alpha', undefined), 'Copy Relative Path').action()
    expect(writeText).toHaveBeenCalledWith('/Users/me/repos/alpha')
  })

  it('disables both items when the folder has no known path', () => {
    const items = buildRepoRowContextMenu(undefined, HOME)
    expect(labels(items)).toEqual(['Copy Path', 'Copy Relative Path'])
    for (const label of ['Copy Path', 'Copy Relative Path']) {
      const item = itemNamed(items, label)
      expect(item.disabled).toBe(true)
      item.action()
    }
    expect(writeText).not.toHaveBeenCalled()
  })
})
