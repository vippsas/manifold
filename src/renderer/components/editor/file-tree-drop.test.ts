import { describe, it, expect, vi } from 'vitest'
import {
  collectDroppedPaths,
  describeDropTarget,
  hasDraggedFiles,
  resolveDropDirectory,
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
})
