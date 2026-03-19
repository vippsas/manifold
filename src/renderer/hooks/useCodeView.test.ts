import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCodeView } from './useCodeView'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
  }
})

describe('useCodeView', () => {
  it('opens an existing file in the preferred split without stealing it from the original split', async () => {
    mockInvoke.mockResolvedValue('const value = 1')

    const { result } = renderHook(() => useCodeView('session-1'))

    act(() => {
      result.current.createPane('editor:1', 'editor')
    })

    let paneId = ''
    act(() => {
      paneId = result.current.handleSelectFile('/repo/file.ts', 'editor')
    })

    expect(paneId).toBe('editor')

    await waitFor(() => {
      expect(result.current.getEditorPane('editor').openFiles).toHaveLength(1)
    })

    act(() => {
      paneId = result.current.handleSelectFile('/repo/file.ts', 'editor:1')
    })

    expect(paneId).toBe('editor:1')
    expect(result.current.getEditorPane('editor').openFiles.map((file) => file.path)).toEqual(['/repo/file.ts'])
    expect(result.current.getEditorPane('editor:1').openFiles.map((file) => file.path)).toEqual(['/repo/file.ts'])
    expect(result.current.activeEditorPaneId).toBe('editor:1')
  })

  it('moves an open file between editor panes', async () => {
    mockInvoke.mockResolvedValue('const value = 1')

    const { result } = renderHook(() => useCodeView('session-1'))

    act(() => {
      result.current.createPane('editor:1', 'editor')
      result.current.handleSelectFile('/repo/file.ts', 'editor')
    })

    await waitFor(() => {
      expect(result.current.getEditorPane('editor').openFiles).toHaveLength(1)
    })

    act(() => {
      result.current.moveFileToPane('/repo/file.ts', 'editor:1', 'editor')
    })

    expect(result.current.getEditorPane('editor').openFiles).toHaveLength(0)
    expect(result.current.getEditorPane('editor:1').openFiles.map((file) => file.path)).toEqual(['/repo/file.ts'])
    expect(result.current.activeEditorPaneId).toBe('editor:1')
  })

  it('closes a file only in the current split when a pane id is provided', async () => {
    mockInvoke.mockResolvedValue('const value = 1')

    const { result } = renderHook(() => useCodeView('session-1'))

    act(() => {
      result.current.createPane('editor:1', 'editor')
      result.current.handleSelectFile('/repo/file.ts', 'editor')
    })

    await waitFor(() => {
      expect(result.current.getEditorPane('editor').openFiles).toHaveLength(1)
    })

    act(() => {
      result.current.handleSelectFile('/repo/file.ts', 'editor:1')
    })

    expect(result.current.getEditorPane('editor:1').openFiles).toHaveLength(1)

    act(() => {
      result.current.handleCloseFile('/repo/file.ts', 'editor:1')
    })

    expect(result.current.getEditorPane('editor').openFiles.map((file) => file.path)).toEqual(['/repo/file.ts'])
    expect(result.current.getEditorPane('editor:1').openFiles).toHaveLength(0)
    expect(result.current.openFiles.map((file) => file.path)).toEqual(['/repo/file.ts'])
  })

  it('merges a closed split back into its fallback pane', async () => {
    mockInvoke
      .mockResolvedValueOnce('const left = 1')
      .mockResolvedValueOnce('const right = 2')

    const { result } = renderHook(() => useCodeView('session-1'))

    act(() => {
      result.current.createPane('editor:1', 'editor')
      result.current.handleSelectFile('/repo/left.ts', 'editor')
      result.current.handleSelectFile('/repo/right.ts', 'editor:1')
    })

    await waitFor(() => {
      expect(result.current.getEditorPane('editor').openFiles).toHaveLength(1)
      expect(result.current.getEditorPane('editor:1').openFiles).toHaveLength(1)
    })

    act(() => {
      result.current.removePane('editor:1', 'editor')
    })

    expect(result.current.getEditorPane('editor').openFiles.map((file) => file.path)).toEqual([
      '/repo/left.ts',
      '/repo/right.ts',
    ])
    expect(result.current.activeEditorPaneId).toBe('editor')
  })
})
