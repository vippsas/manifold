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
})
