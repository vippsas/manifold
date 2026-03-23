import { renderHook, act } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useAppEffects } from './useAppEffects'
import type { UseDockLayoutResult } from './useDockLayout'

const listeners = new Map<string, (...args: unknown[]) => void>()

function createDockLayout(): UseDockLayoutResult {
  return {
    apiRef: { current: null },
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
  }
}

function emit<T>(channel: string, payload: T): void {
  const listener = listeners.get(channel)
  if (!listener) {
    throw new Error(`No listener registered for ${channel}`)
  }
  listener(payload)
}

describe('useAppEffects', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    listeners.clear()
    window.electronAPI = {
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
        listeners.set(channel, callback)
        return () => {
          listeners.delete(channel)
        }
      }),
    } as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces open file refreshes while the active agent is producing output', () => {
    const refreshOpenFiles = vi.fn().mockResolvedValue(undefined)
    const refreshDiff = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useAppEffects({
        activeSessionId: 'session-1',
        dockLayout: createDockLayout(),
        webPreviewUrl: null,
        settings: { defaultRuntime: 'codex' },
        setActiveProject: vi.fn(),
        spawnAgent: vi.fn(),
        refreshOpenFiles,
        refreshDiff,
      }),
    )

    act(() => {
      emit('agent:activity', { sessionId: 'session-1' })
      emit('agent:activity', { sessionId: 'session-1' })
      vi.advanceTimersByTime(149)
    })

    expect(refreshOpenFiles).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(refreshOpenFiles).toHaveBeenCalledTimes(1)
    expect(refreshDiff).not.toHaveBeenCalled()
  })

  it('flushes the pending refresh and updates diff when the active agent completes', () => {
    const refreshOpenFiles = vi.fn().mockResolvedValue(undefined)
    const refreshDiff = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useAppEffects({
        activeSessionId: 'session-1',
        dockLayout: createDockLayout(),
        webPreviewUrl: null,
        settings: { defaultRuntime: 'codex' },
        setActiveProject: vi.fn(),
        spawnAgent: vi.fn(),
        refreshOpenFiles,
        refreshDiff,
      }),
    )

    act(() => {
      emit('agent:activity', { sessionId: 'session-1' })
      emit('agent:status', { sessionId: 'session-1', status: 'waiting' })
    })

    expect(refreshOpenFiles).toHaveBeenCalledTimes(1)
    expect(refreshDiff).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(refreshOpenFiles).toHaveBeenCalledTimes(1)
  })

  it('ignores output from background sessions', () => {
    const refreshOpenFiles = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useAppEffects({
        activeSessionId: 'session-1',
        dockLayout: createDockLayout(),
        webPreviewUrl: null,
        settings: { defaultRuntime: 'codex' },
        setActiveProject: vi.fn(),
        spawnAgent: vi.fn(),
        refreshOpenFiles,
        refreshDiff: vi.fn().mockResolvedValue(undefined),
      }),
    )

    act(() => {
      emit('agent:activity', { sessionId: 'session-2' })
      vi.advanceTimersByTime(200)
    })

    expect(refreshOpenFiles).not.toHaveBeenCalled()
  })
})
