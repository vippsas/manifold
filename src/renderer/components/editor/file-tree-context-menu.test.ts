import { describe, it, expect, vi } from 'vitest'
import type { FileTreeNode } from '../../../shared/types'
import type { ContextMenuAction } from './ContextMenu'
import { buildFileTreeContextMenu } from './file-tree-context-menu'

const fileNode: FileTreeNode = { name: 'a.ts', path: '/r/a.ts', isDirectory: false }
const dirNode: FileTreeNode = { name: 'sub', path: '/r/sub', isDirectory: true, children: [] }
const baseCfg = { rootPath: '/r', defaultDir: '/r' }

function labels(items: (ContextMenuAction | 'separator')[]): string[] {
  return items.filter((i): i is ContextMenuAction => i !== 'separator').map((i) => i.label)
}
function emptyClip() {
  return { hasClipboard: false, copy: vi.fn(), cut: vi.fn(), paste: vi.fn() }
}

describe('buildFileTreeContextMenu', () => {
  it('offers create + paste on empty space when the clipboard has content', () => {
    const items = buildFileTreeContextMenu(null, {
      ...baseCfg, createFile: vi.fn(), createFolder: vi.fn(),
      clipboard: { ...emptyClip(), hasClipboard: true },
    })
    expect(labels(items)).toEqual(['New File', 'New Folder', 'Paste'])
  })

  it('omits Paste on empty space when the clipboard is empty', () => {
    const items = buildFileTreeContextMenu(null, { ...baseCfg, createFile: vi.fn(), clipboard: emptyClip() })
    expect(labels(items)).toEqual(['New File'])
  })

  it('shows Open to the Side only for files', () => {
    const openFileToSide = vi.fn()
    expect(labels(buildFileTreeContextMenu(fileNode, { ...baseCfg, rename: vi.fn(), openFileToSide }))).toContain('Open to the Side')
    expect(labels(buildFileTreeContextMenu(dirNode, { ...baseCfg, rename: vi.fn(), openFileToSide }))).not.toContain('Open to the Side')
  })

  it('never leaves leading, trailing, or duplicate separators', () => {
    const items = buildFileTreeContextMenu(fileNode, { ...baseCfg, rename: vi.fn(), revealInFinder: vi.fn() })
    expect(items[0]).not.toBe('separator')
    expect(items[items.length - 1]).not.toBe('separator')
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i] === 'separator' && items[i - 1] === 'separator').toBe(false)
    }
  })

  it('Cut invokes the clipboard with the target node', () => {
    const clip = emptyClip()
    const items = buildFileTreeContextMenu(fileNode, { ...baseCfg, clipboard: clip })
    const cut = items.find((i): i is ContextMenuAction => i !== 'separator' && i.label === 'Cut')
    cut?.action()
    expect(clip.cut).toHaveBeenCalledWith([fileNode])
  })
})
