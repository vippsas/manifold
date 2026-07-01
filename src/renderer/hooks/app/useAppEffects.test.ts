import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppEffects } from './useAppEffects'
import type { UseDockLayoutResult } from '../dock-layout/useDockLayout'

const listeners = new Map<string, (...args: unknown[]) => void>()

function createInput(activeSessionId: string | null = 'session-1') {
  const panels = new Set<string>()
  const addPanel = vi.fn(({ id }: { id: string }) => {
    panels.add(id)
    return { api: { setActive: vi.fn() } }
  })
  const getPanel = vi.fn((id: string) => {
    if (panels.has(id) || id === 'editor') return { api: { setActive: vi.fn() } }
    return undefined
  })
  const apiRef = { current: { addPanel, getPanel } } as unknown as UseDockLayoutResult['apiRef']

  return {
    panels,
    addPanel,
    input: {
      activeSessionId,
      dockLayout: {
        apiRef,
        isRestoringRef: { current: false },
        onReady: vi.fn(),
        togglePanel: vi.fn(),
        closePanel: vi.fn(),
        toggleMaximizePanel: vi.fn(),
        focusPanel: vi.fn(),
        openSiblingPanel: vi.fn(),
        closeSiblingPanel: vi.fn(),
        ensureEditorPanel: vi.fn(() => 'editor'),
        splitEditorPane: vi.fn(() => null),
        findEditorPanelForSplit: vi.fn(() => null),
        isPanelVisible: vi.fn(() => true),
        resetLayout: vi.fn(),
        hiddenPanels: [],
        editorPanelIds: ['editor'],
        layoutVersion: 0,
        layoutReloadVersion: 0,
        openPluginView: vi.fn(),
        openPluginTreeView: vi.fn(),
      } satisfies UseDockLayoutResult,
      settings: { defaultRuntime: 'codex' },
      setActiveProject: vi.fn(),
      setActiveSession: vi.fn(),
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

  it('uses the runtime provided by app:auto-spawn when present', () => {
    const { input } = createInput()
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

    const { input } = createInput()
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
    const { input } = createInput()
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
    const { input } = createInput()
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
    const { input } = createInput()
    renderHook(() => useAppEffects({ ...input }))

    act(() => {
      emit('agent:activity', { sessionId: 'session-2' })
      vi.advanceTimersByTime(200)
    })
    expect(input.refreshOpenFiles).not.toHaveBeenCalled()
  })

  it('opens the sibling panel on plugins:reveal-session', () => {
    const { input } = createInput()
    renderHook(() => useAppEffects({ ...input }))

    const reveal = vi.mocked(window.electronAPI.on).mock.calls.find(([channel]) => channel === 'plugins:reveal-session')?.[1]
    if (!reveal) throw new Error('plugins:reveal-session handler was not registered')

    act(() => {
      reveal('sess-42', 'Watching: intro')
    })
    expect(input.dockLayout.openSiblingPanel).toHaveBeenCalledWith('sess-42', 'Watching: intro')
  })

  it('ignores reveal events without a session id', () => {
    const { input } = createInput()
    renderHook(() => useAppEffects({ ...input }))

    const reveal = vi.mocked(window.electronAPI.on).mock.calls.find(([channel]) => channel === 'plugins:reveal-session')?.[1]
    if (!reveal) throw new Error('plugins:reveal-session handler was not registered')

    act(() => {
      reveal(undefined, 'x')
    })
    expect(input.dockLayout.openSiblingPanel).not.toHaveBeenCalled()
  })

  it('focuses the session then the project on notification:open-session', () => {
    const { input } = createInput()
    renderHook(() => useAppEffects({ ...input }))

    act(() => {
      emit('notification:open-session', { projectId: 'proj-1', sessionId: 'sess-9' })
    })
    expect(input.setActiveSession).toHaveBeenCalledWith('sess-9')
    expect(input.setActiveProject).toHaveBeenCalledWith('proj-1')
    expect(input.dockLayout.openSiblingPanel).toHaveBeenCalledWith('sess-9')
    // Session must be set before the project so the project-change refetch
    // doesn't clobber the target session.
    const sessionOrder = vi.mocked(input.setActiveSession).mock.invocationCallOrder[0]
    const projectOrder = vi.mocked(input.setActiveProject).mock.invocationCallOrder[0]
    expect(sessionOrder).toBeLessThan(projectOrder)
  })

  it('ignores notification:open-session without a session id', () => {
    const { input } = createInput()
    renderHook(() => useAppEffects({ ...input }))

    act(() => {
      emit('notification:open-session', { projectId: 'proj-1', sessionId: '' })
    })
    expect(input.setActiveSession).not.toHaveBeenCalled()
    expect(input.setActiveProject).not.toHaveBeenCalled()
    expect(input.dockLayout.openSiblingPanel).not.toHaveBeenCalled()
  })

  it('reports the active session id to the main process on mount', () => {
    const { input } = createInput('session-7')
    renderHook(() => useAppEffects({ ...input }))

    expect(window.electronAPI.send).toHaveBeenCalledWith('notifications:active-session', 'session-7')
  })

  it('reports a null active session when none is selected', () => {
    const { input } = createInput(null)
    renderHook(() => useAppEffects({ ...input }))

    expect(window.electronAPI.send).toHaveBeenCalledWith('notifications:active-session', null)
  })
})
