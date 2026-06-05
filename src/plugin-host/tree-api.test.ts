import { describe, expect, it, vi } from 'vitest'
import { TreeRegistry } from './tree-api'

function provider() {
  const data: Record<string, string[]> = { root: ['a', 'b'], a: ['a1'], b: [], a1: [] }
  return {
    getChildren: (el?: string) => data[el ?? 'root'],
    getTreeItem: (el: string) => ({ label: el.toUpperCase(), collapsibleState: (data[el]?.length ? 1 : 0) as 0 | 1, command: { command: 'open', arguments: [el] } }),
  }
}

describe('TreeRegistry', () => {
  it('serializes root children with fresh nodeIds and resolves grandchildren by nodeId', async () => {
    const reg = new TreeRegistry()
    reg.register('view.x', provider())
    const roots = await reg.getChildren('view.x', undefined)
    expect(roots.map((r) => r.label)).toEqual(['A', 'B'])
    expect(roots[0].collapsibleState).toBe('collapsed')
    expect(roots[1].collapsibleState).toBe('none')
    expect(roots[0].command).toEqual({ command: 'open', args: ['a'] })
    const kids = await reg.getChildren('view.x', roots[0].nodeId)
    expect(kids.map((k) => k.label)).toEqual(['A1'])
  })

  it('fires the refresh callback when the provider signals onDidChangeTreeData', () => {
    const reg = new TreeRegistry()
    let fire = () => {}
    reg.register('view.y', { getChildren: () => [], getTreeItem: () => ({ label: 'x' }), onDidChangeTreeData: (l: () => void) => { fire = l; return { dispose() {} } } })
    const onRefresh = vi.fn()
    reg.onRefresh(onRefresh)
    fire()
    expect(onRefresh).toHaveBeenCalledWith('view.y')
  })

  it('throws for an unknown view', async () => {
    const reg = new TreeRegistry()
    await expect(reg.getChildren('nope', undefined)).rejects.toThrow()
  })

  it('uses TreeItem.id as the nodeId when provided', async () => {
    const reg = new TreeRegistry()
    reg.register('v', { getChildren: (el?: string) => (el ? [] : ['x']), getTreeItem: () => ({ label: 'X', id: 'custom-id' }) })
    const roots = await reg.getChildren('v', undefined)
    expect(roots[0].nodeId).toBe('custom-id')
    // and it resolves by that id:
    expect(await reg.getChildren('v', 'custom-id')).toEqual([]) // 'x' has no children
  })

  it('returns [] for an unknown/stale nodeId (not roots)', async () => {
    const reg = new TreeRegistry()
    reg.register('v', { getChildren: (el?: string) => (el ? [] : ['root1']), getTreeItem: (el: string) => ({ label: el }) })
    await reg.getChildren('v', undefined)
    expect(await reg.getChildren('v', 'bogus')).toEqual([])
  })

  it('disposing a stale registration handle does not remove a newer registration of the same viewId', async () => {
    const reg = new TreeRegistry()
    const first = reg.register('view.x', provider())
    const second = reg.register('view.x', provider())
    // Dispose the FIRST (now stale) handle — it must not evict the live second registration.
    first.dispose()
    expect(reg.hasView('view.x')).toBe(true)
    const roots = await reg.getChildren('view.x', undefined)
    expect(roots.map((r) => r.label)).toEqual(['A', 'B'])
    // Disposing the live second handle still tears the view down.
    second.dispose()
    expect(reg.hasView('view.x')).toBe(false)
    await expect(reg.getChildren('view.x', undefined)).rejects.toThrow()
  })
})
