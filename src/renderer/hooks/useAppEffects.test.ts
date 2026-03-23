import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppEffects } from './useAppEffects'
import type { UseDockLayoutResult } from './useDockLayout'

const listeners = new Map<string, (...args: unknown[]) => void>()

function createInput(webPreviewUrl: string | null, activeSessionId: string | null = 'session-1') {
  const panels = new Set<string>()
  const addPanel = vi.fn(({ id }: { id: string }) => {
    panels.add(id)
    return { api: { setActive: vi.fn() } }
  })
  const getPanel = vi.fn((id: string) => {
    if (panels.has(id) || id === 'editor') return { api: { setActive: vi.fn() } }
    return undefined
  })
  const apiRef = { current: { addPanel, getPanel } } as UseDockLayoutResult['apiRef']

  return {
    panels,
    addPanel,
    input: {
      activeSessionId,
      dockLayout: {
        apiRef,
        onReady: vi.fn(),
        togglePanel: vi.fn(),
        closePanel: vi.fn(),
        focusPanel: vi.fn(),
        ensureEditorPanel: vi.fn(() => 'editor'),
        splitEditorPane: vi.fn(() => null),
        isPanelVisible: vi.fn(() => true),
        resetLayout: vi.fn(),
        hiddenPanels: [],
        editorPanelIds: ['editor'],
      } satisfies UseDockLayoutResult,
      webPreviewUrl,
      settings: { defaultRuntime: 'codex' },
      setActiveProject: vi.fn(),
      spawnAgent: vi.fn(),
      refreshOpenFiles: vi.fn().mockResolvedValue(undefined),
      refreshDiff: vi.fn().mockResolvedValue(undefined),
    },
  }
}

function emit(channel: string, payload: unknown): void {
  const listener = listeners.get(channel)
  if (!listener) throw new Error(`No listener registered for ${channel}`)
  listener(payload)
}

describe('useAppEffects', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    listeners.clear()
    window.electronAPI = {
      invoke: vi.fn(async () => null),
      send: vi.fn(),
      on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
        listeners.set(channel, callback)
        return () => { listeners.delete(channel) }
      }),
    } as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not recreate the preview panel after a manual close for the same URL', () => {
    const { panels, addPanel, input } = createInput('http://127.0.0.1:5173')
    const { rerender } = renderHook(({ webPreviewUrl }) => useAppEffects({ ...input, webPreviewUrl }), {
      initialProps: { webPreviewUrl: input.webPreviewUrl },
    })

    expect(addPanel).toHaveBeenCalledTimes(1)
    panels.delete('webPreview')
    rerender({ webPreviewUrl: 'http://127.0.0.1:5173' })
    expect(addPanel).toHaveBeenCalledTimes(1)
  })

  it('auto-opens the preview again after the preview URL is reset and detected again', () => {
    const { panels, addPanel, input } = createInput('http://127.0.0.1:5173')
    const { rerender } = renderHook(({ webPreviewUrl }) => useAppEffects({ ...input, webPreviewUrl }), {
      initialProps: { webPreviewUrl: input.webPreviewUrl },
    })

    expect(addPanel).toHaveBeenCalledTimes(1)
    panels.delete('webPreview')
    rerender({ webPreviewUrl: null })
    rerender({ webPreviewUrl: 'http://127.0.0.1:5173' })
    expect(addPanel).toHaveBeenCalledTimes(2)
  })

  it('uses the runtime provided by app:auto-spawn when present', () => {
    const { input } = createInput(null)
    renderHook(() => useAppEffects({ ...input }))

    const autoSpawn = vi.mocked(window.electronAPI.on).mock.calls.find(([channel]) => channel === 'app:auto-spawn')?.[1]
    if (!autoSpawn) throw new Error('app:auto-spawn handler was not registered')

    autoSpawn('proj-1', 'feature/clock', true, 'codex')
    expect(input.spawnAgent).toHaveBeenCalledWith({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: '',
      existingBranch: 'feature/clock',
      noWorktree: true,
    })
  })

  it('spawns a pending developer launch on mount', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation(async (channel: string) => {
      if (channel === 'app:consume-pending-launch') {
        return { kind: 'developer', projectId: 'proj-1', branchName: 'feature/clock', runtimeId: 'codex' }
      }
      return null
    })

    const { input } = createInput(null)
    renderHook(() => useAppEffects({ ...input }))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(input.setActiveProject).toHaveBeenCalledWith('proj-1')
    expect(input.spawnAgent).toHaveBeenCalledWith({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: '',
      existingBranch: 'feature/clock',
      noWorktree: false,
    })
  })

  it('debounces open file refreshes while the active agent is producing output', () => {
    const { input } = createInput(null)
    renderHook(() => useAppEffects({ ...input }))

    act(() => {
      emit('agent:activity', { sessionId: 'session-1' })
      emit('agent:activity', { sessionId: 'session-1' })
      vi.advanceTimersByTime(149)
    })
    expect(input.refreshOpenFiles).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(input.refreshOpenFiles).toHaveBeenCalledTimes(1)
    expect(input.refreshDiff).not.toHaveBeenCalled()
  })

  it('flushes the pending refresh and updates diff when the active agent completes', () => {
    const { input } = createInput(null)
    renderHook(() => useAppEffects({ ...input }))

    act(() => {
      emit('agent:activity', { sessionId: 'session-1' })
      emit('agent:status', { sessionId: 'session-1', status: 'waiting' })
    })
    expect(input.refreshOpenFiles).toHaveBeenCalledTimes(1)
    expect(input.refreshDiff).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(input.refreshOpenFiles).toHaveBeenCalledTimes(1)
  })

  it('ignores output from background sessions', () => {
    const { input } = createInput(null)
    renderHook(() => useAppEffects({ ...input }))

    act(() => {
      emit('agent:activity', { sessionId: 'session-2' })
      vi.advanceTimersByTime(200)
    })
    expect(input.refreshOpenFiles).not.toHaveBeenCalled()
  })
})
