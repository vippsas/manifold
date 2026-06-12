import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { FileTreeNode } from '../../../../shared/types'
import { useFileTreeClipboard } from './useFileTreeClipboard'

const nodes: FileTreeNode[] = [{ name: 'a.ts', path: '/r/a.ts', isDirectory: false }]

describe('useFileTreeClipboard', () => {
  it('copy then paste imports into the target dir and keeps the clipboard', async () => {
    const onImportPaths = vi.fn().mockResolvedValue(null)
    const { result } = renderHook(() => useFileTreeClipboard({ onImportPaths }))
    act(() => result.current.copy(nodes))
    expect(result.current.hasClipboard).toBe(true)
    await act(async () => { await result.current.paste('/dest') })
    expect(onImportPaths).toHaveBeenCalledWith('/dest', ['/r/a.ts'])
    expect(result.current.hasClipboard).toBe(true)
  })

  it('cut then paste moves the path and clears the clipboard', async () => {
    const onMovePath = vi.fn().mockResolvedValue(null)
    const { result } = renderHook(() => useFileTreeClipboard({ onMovePath }))
    act(() => result.current.cut(nodes))
    await act(async () => { await result.current.paste('/dest') })
    expect(onMovePath).toHaveBeenCalledWith('/r/a.ts', '/dest')
    expect(result.current.hasClipboard).toBe(false)
  })

  it('paste is a no-op with nothing on the clipboard', async () => {
    const onImportPaths = vi.fn().mockResolvedValue(null)
    const { result } = renderHook(() => useFileTreeClipboard({ onImportPaths }))
    await act(async () => { await result.current.paste('/dest') })
    expect(onImportPaths).not.toHaveBeenCalled()
  })
})
