import { describe, it, expect, vi } from 'vitest'
import {
  collectDroppedPaths,
  describeDropTarget,
  hasDraggedFiles,
  resolveDropDirectory,
  resolveDropRootPath,
  validateInternalMove,
} from './file-tree-drop'

describe('file-tree-drop', () => {
  it('detects file drags from the data transfer payload', () => {
    const dataTransfer = {
      types: ['text/plain', 'Files'],
    } as unknown as DataTransfer

    expect(hasDraggedFiles(dataTransfer)).toBe(true)
    expect(hasDraggedFiles(null)).toBe(false)
  })

  it('resolves a directory row as the drop target', () => {
    document.body.innerHTML = '<div data-tree-root-path="/repo"><div data-tree-path="/repo/src" data-tree-is-directory="true"><span id="target"></span></div></div>'
    const target = document.getElementById('target')

    expect(resolveDropDirectory(target, '/repo')).toBe('/repo/src')
  })

  it('resolves a file row to its parent directory', () => {
    document.body.innerHTML = '<div data-tree-root-path="/repo"><div data-tree-path="/repo/src/index.ts" data-tree-is-directory="false"><span id="target"></span></div></div>'
    const target = document.getElementById('target')

    expect(resolveDropDirectory(target, '/repo')).toBe('/repo/src')
  })

  it('falls back to the nearest workspace root when not hovering a node', () => {
    document.body.innerHTML = '<div data-tree-root-path="/repo/extra"><div id="target"></div></div>'
    const target = document.getElementById('target')

    expect(resolveDropDirectory(target, '/repo')).toBe('/repo/extra')
  })

  it('collects unique dropped paths', () => {
    const getPathForFile = vi.fn((file: File) => file.name === 'first.txt' ? '/tmp/first.txt' : '/tmp/second.txt')
    const files = [
      new File(['first'], 'first.txt'),
      new File(['second'], 'second.txt'),
      new File(['duplicate'], 'first.txt'),
    ]

    expect(collectDroppedPaths(files, getPathForFile)).toEqual(['/tmp/first.txt', '/tmp/second.txt'])
  })

  it('formats the drop target label', () => {
    expect(describeDropTarget('/repo/src')).toBe('src')
    expect(describeDropTarget(null)).toBe('project root')
  })

  it('resolves the drop root path', () => {
    const root = document.createElement('div')
    root.dataset.treeRootPath = '/repo/extra'
    const target = document.createElement('div')
    root.appendChild(target)
    document.body.replaceChildren(root)

    expect(resolveDropRootPath(target)).toBe('/repo/extra')
  })

  describe('validateInternalMove', () => {
    it('accepts a move into a sibling directory', () => {
      const result = validateInternalMove('/repo/src/a.ts', '/repo', '/repo/lib', '/repo')
      expect(result).toEqual({ ok: true, newPath: '/repo/lib/a.ts' })
    })

    it('rejects a move into the current parent', () => {
      const result = validateInternalMove('/repo/src/a.ts', '/repo', '/repo/src', '/repo')
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('Already in this folder.')
    })

    it('rejects moving a folder into itself', () => {
      const result = validateInternalMove('/repo/src', '/repo', '/repo/src', '/repo')
      expect(result.ok).toBe(false)
    })

    it('rejects moving a folder into its descendant', () => {
      const result = validateInternalMove('/repo/src', '/repo', '/repo/src/sub', '/repo')
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/itself/)
    })

    it('rejects moving across worktrees', () => {
      const result = validateInternalMove('/repo/a.ts', '/repo', '/other/lib', '/other')
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/worktrees/)
    })

    it('allows a move when target root is unknown', () => {
      const result = validateInternalMove('/repo/a.ts', '/repo', '/repo/lib', null)
      expect(result.ok).toBe(true)
    })
  })
})
