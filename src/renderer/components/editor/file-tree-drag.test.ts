import { describe, expect, it, vi } from 'vitest'
import {
  FILE_TREE_DRAG_MIME,
  getDraggedTreePath,
  hasFileTreeDragData,
  readFileTreeDragData,
  writeFileTreeDragData,
} from './file-tree-drag'

function createMockDataTransfer(): DataTransfer {
  const values = new Map<string, string>()
  const dataTransfer = {
    dropEffect: 'none',
    effectAllowed: 'all',
    files: {} as FileList,
    items: {} as DataTransferItemList,
    types: [] as string[],
    clearData: vi.fn((format?: string) => {
      if (format) values.delete(format)
      else values.clear()
    }),
    getData: vi.fn((format: string) => values.get(format) ?? ''),
    setData: vi.fn((format: string, value: string) => {
      values.set(format, value)
      ;(dataTransfer.types as string[]) = Array.from(values.keys())
    }),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer

  return dataTransfer
}

describe('file-tree-drag', () => {
  it('derives a worktree-relative path', () => {
    expect(getDraggedTreePath('/repo/src/main.ts', '/repo')).toBe('src/main.ts')
  })

  it('writes and reads a tree drag payload', () => {
    const dataTransfer = createMockDataTransfer()

    writeFileTreeDragData(dataTransfer, 'src/main.ts')

    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(hasFileTreeDragData(dataTransfer)).toBe(true)
    expect(readFileTreeDragData(dataTransfer)).toBe('src/main.ts')
    expect(dataTransfer.setData).toHaveBeenCalledWith(FILE_TREE_DRAG_MIME, 'src/main.ts')
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'src/main.ts')
  })
})
