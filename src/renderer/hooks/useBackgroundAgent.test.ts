import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type {
  BackgroundAgentGenerationStatus,
  BackgroundAgentSnapshot,
} from '../../../background-agent/schemas/background-agent-types'
import { useBackgroundAgent } from './useBackgroundAgent'

const mockInvoke = vi.fn()

const idleStatus: BackgroundAgentGenerationStatus = {
  phase: 'idle',
  isRefreshing: false,
  refreshState: 'idle',
  lastRefreshedAt: null,
  error: null,
  summary: null,
  detail: null,
  stepLabel: null,
  recentActivity: [],
}

const idleSnapshot: BackgroundAgentSnapshot = {
  profile: null,
  suggestions: [],
  status: idleStatus,
}

describe('useBackgroundAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: mockInvoke,
      on: vi.fn(() => vi.fn()),
      send: vi.fn(),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the first refresh click active through an initial stale idle status', async () => {
    let statusCalls = 0
    let resolveRefresh: ((value: BackgroundAgentSnapshot) => void) | null = null

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'background-agent:list-suggestions') {
        return Promise.resolve(idleSnapshot)
      }
      if (channel === 'background-agent:get-status') {
        statusCalls += 1
        if (statusCalls === 1) {
          return Promise.resolve(idleStatus)
        }
        return Promise.resolve({
          ...idleStatus,
          phase: 'researching',
          isRefreshing: true,
          refreshState: 'running',
          summary: 'Researching the web for source-backed ideas.',
          detail: 'Prepared 2 focused research threads using codex.',
          stepLabel: 'Step 2 of 4',
          recentActivity: ['Built a local project profile.'],
        } satisfies BackgroundAgentGenerationStatus)
      }
      if (channel === 'background-agent:refresh') {
        return new Promise<BackgroundAgentSnapshot>((resolve) => {
          resolveRefresh = resolve
        })
      }
      throw new Error(`Unexpected IPC channel: ${channel}`)
    })

    const { result } = renderHook(() => useBackgroundAgent('project-1', 'session-1'))

    await flushEffects()

    expect(result.current.isLoading).toBe(false)
    expect(result.current.snapshot).toEqual(idleSnapshot)

    act(() => {
      void result.current.refresh()
    })

    expect(mockInvoke).toHaveBeenCalledWith('background-agent:refresh', 'project-1', 'session-1')
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.snapshot?.status.summary).toBe('Starting a new Ideas refresh.')

    await act(async () => {
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })

    expect(statusCalls).toBe(1)
    expect(result.current.isRefreshing).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(statusCalls).toBe(2)
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.snapshot?.status.summary).toBe('Researching the web for source-backed ideas.')

    act(() => {
      resolveRefresh?.({
        profile: null,
        suggestions: [],
        status: {
          phase: 'ready',
          isRefreshing: false,
          refreshState: 'idle',
          lastRefreshedAt: '2026-03-30T20:00:00.000Z',
          error: null,
          summary: 'Prepared 0 source-backed ideas.',
          detail: 'The project profile is ready, but external research did not yield strong enough signals.',
          stepLabel: 'Step 4 of 4',
          recentActivity: ['Completed ranking, but no idea cards survived the evidence threshold.'],
        },
      })
    })

    await flushEffects()

    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.snapshot?.status.phase).toBe('ready')
  })

  it('resumes polling when mounted during an active refresh', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'background-agent:list-suggestions') {
        return Promise.resolve({
          profile: null,
          suggestions: [],
          status: {
            ...idleStatus,
            phase: 'researching',
            isRefreshing: true,
            refreshState: 'running',
            summary: 'Researching the web for source-backed ideas.',
            detail: 'Prepared 2 focused research threads using codex.',
            stepLabel: 'Step 2 of 4',
            recentActivity: ['Built a local project profile.'],
          },
        } satisfies BackgroundAgentSnapshot)
      }
      if (channel === 'background-agent:get-status') {
        return Promise.resolve({
          ...idleStatus,
          phase: 'ready',
          isRefreshing: false,
          refreshState: 'idle',
          summary: 'Prepared 1 source-backed idea.',
          detail: 'The Ideas feed is ready to review.',
          stepLabel: 'Step 4 of 4',
          recentActivity: ['Ranked and stored 1 idea card.'],
        } satisfies BackgroundAgentGenerationStatus)
      }
      throw new Error(`Unexpected IPC channel: ${channel}`)
    })

    const { result } = renderHook(() => useBackgroundAgent('project-1', 'session-1'))

    await flushEffects()

    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.snapshot?.status.phase).toBe('researching')

    await act(async () => {
      vi.advanceTimersByTime(800)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockInvoke).toHaveBeenCalledWith('background-agent:get-status', 'project-1')
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.snapshot?.status.phase).toBe('ready')
  })

  it('sends pause and stop commands for an active refresh', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'background-agent:list-suggestions') {
        return Promise.resolve({
          profile: null,
          suggestions: [],
          status: {
            ...idleStatus,
            phase: 'researching',
            isRefreshing: true,
            refreshState: 'running',
            summary: 'Researching the web for source-backed ideas.',
            detail: 'Topic 1 of 4',
            recentActivity: [],
          },
        } satisfies BackgroundAgentSnapshot)
      }
      if (channel === 'background-agent:pause') {
        return Promise.resolve({
          profile: null,
          suggestions: [],
          status: {
            ...idleStatus,
            phase: 'researching',
            isRefreshing: true,
            refreshState: 'pause_requested',
            summary: 'Pausing the Ideas refresh after the current step.',
            detail: 'Waiting for the active research step to finish before pausing.',
            recentActivity: ['Pause requested for the active Ideas refresh.'],
          },
        } satisfies BackgroundAgentSnapshot)
      }
      if (channel === 'background-agent:stop') {
        return Promise.resolve({
          profile: null,
          suggestions: [],
          status: {
            ...idleStatus,
            phase: 'researching',
            isRefreshing: false,
            refreshState: 'stopped',
            summary: 'Ideas refresh stopped.',
            detail: 'Refresh again to start a new Ideas run.',
            recentActivity: ['Stopped the active Ideas refresh.'],
          },
        } satisfies BackgroundAgentSnapshot)
      }
      throw new Error(`Unexpected IPC channel: ${channel}`)
    })

    const { result } = renderHook(() => useBackgroundAgent('project-1', 'session-1'))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => { await result.current.pause() })
    expect(mockInvoke).toHaveBeenCalledWith('background-agent:pause', 'project-1')
    expect(result.current.status?.refreshState).toBe('pause_requested')

    await act(async () => { await result.current.stop() })
    expect(mockInvoke).toHaveBeenCalledWith('background-agent:stop', 'project-1')
    expect(result.current.status?.refreshState).toBe('stopped')
  })

  it('resumes a paused refresh through IPC', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'background-agent:list-suggestions') {
        return Promise.resolve({
          profile: null,
          suggestions: [],
          status: {
            ...idleStatus,
            phase: 'researching',
            isRefreshing: false,
            refreshState: 'paused',
            summary: 'Ideas refresh paused.',
            detail: 'Resume to continue with 3 remaining research topics.',
            recentActivity: ['Paused the Ideas refresh.'],
          },
        } satisfies BackgroundAgentSnapshot)
      }
      if (channel === 'background-agent:resume') {
        return Promise.resolve({
          profile: null,
          suggestions: [],
          status: {
            ...idleStatus,
            phase: 'ready',
            isRefreshing: false,
            refreshState: 'idle',
            summary: 'Prepared 1 source-backed idea.',
            detail: 'The Ideas feed is ready to review.',
            recentActivity: ['Ranked and stored 1 idea card.'],
          },
        } satisfies BackgroundAgentSnapshot)
      }
      if (channel === 'background-agent:get-status') {
        return Promise.resolve(idleStatus)
      }
      throw new Error(`Unexpected IPC channel: ${channel}`)
    })

    const { result } = renderHook(() => useBackgroundAgent('project-1', 'session-1'))
    await flushEffects()
    await act(async () => { await result.current.resume() })

    expect(mockInvoke).toHaveBeenCalledWith('background-agent:resume', 'project-1', 'session-1')
    expect(result.current.status?.phase).toBe('ready')
  })
})
async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
