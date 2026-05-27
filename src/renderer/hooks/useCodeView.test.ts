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

  it('reads image files via files:read-data-url and stores the data URL in content', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    mockInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'files:read-data-url') return dataUrl
      if (channel === 'files:read') return 'should not be used for images'
      return null
    })

    const { result } = renderHook(() => useCodeView('session-1'))

    act(() => {
      result.current.handleSelectFile('/repo/logo.png')
    })

    await waitFor(() => {
      expect(result.current.openFiles.map((file) => file.path)).toEqual(['/repo/logo.png'])
    })

    expect(mockInvoke).toHaveBeenCalledWith('files:read-data-url', 'session-1', '/repo/logo.png')
    expect(mockInvoke).not.toHaveBeenCalledWith('files:read', 'session-1', '/repo/logo.png')
    expect(result.current.activeFileContent).toBe(dataUrl)
  })

  it('still reads non-image files via files:read', async () => {
    mockInvoke.mockResolvedValue('const value = 1')

    const { result } = renderHook(() => useCodeView('session-1'))

    act(() => {
      result.current.handleSelectFile('/repo/file.ts')
    })

    await waitFor(() => {
      expect(result.current.openFiles).toHaveLength(1)
    })

    expect(mockInvoke).toHaveBeenCalledWith('files:read', 'session-1', '/repo/file.ts')
    expect(mockInvoke).not.toHaveBeenCalledWith('files:read-data-url', 'session-1', '/repo/file.ts')
  })
})
