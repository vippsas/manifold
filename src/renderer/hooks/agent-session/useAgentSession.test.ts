import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import { useAgentSession } from './useAgentSession'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

function makeSession(id: string, projectId: string): AgentSession {
  return {
    id,
    projectId,
    runtimeId: 'codex',
    branchName: 'manifold/test',
    worktreePath: `/tmp/${id}`,
    status: 'running',
    pid: 1234,
    taskDescription: 'Test task',
    additionalDirs: [],
  }
}

function getListener(channel: string): (payload: unknown) => void {
  const match = mockOn.mock.calls.find(
    (call: unknown[]) => call[0] === channel
  ) as [string, (payload: unknown) => void] | undefined
  if (!match) throw new Error(`Missing listener for ${channel}`)
  return match[1]
}

beforeEach(() => {
  vi.clearAllMocks()
  window.electronAPI = {
    invoke: mockInvoke,
    send: vi.fn(),
    on: mockOn,
    getPathForFile: vi.fn(),
  }
})

describe('useAgentSession', () => {
  it('refreshes the active project when sessions change', async () => {
    const initialSessions: AgentSession[] = []
    const refreshedSessions = [makeSession('s1', 'p1')]

    mockInvoke
      .mockResolvedValueOnce(initialSessions)
      .mockResolvedValueOnce(refreshedSessions)

    const { result } = renderHook(() => useAgentSession('p1'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:sessions', 'p1')
    })

    act(() => {
      getListener('agent:sessions-changed')({ projectId: 'p1' })
    })

    await waitFor(() => {
      expect(result.current.sessions).toEqual(refreshedSessions)
    })

    expect(result.current.activeSessionId).toBe('s1')
  })

  it('does not mutate the current project state when spawning for another project', async () => {
    const spawnedSession = makeSession('s2', 'p2')

    mockInvoke
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(spawnedSession)

    const { result } = renderHook(() => useAgentSession('p1'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:sessions', 'p1')
    })

    let returnedSession: AgentSession | null = null
    await act(async () => {
      returnedSession = await result.current.spawnAgent({
        projectId: 'p2',
        runtimeId: 'codex',
        prompt: 'Test task',
      })
    })

    expect(returnedSession).toEqual(spawnedSession)
    expect(result.current.sessions).toEqual([])
    expect(result.current.activeSessionId).toBeNull()
  })

  it('resyncs the current project when spawn fails after backend session creation', async () => {
    const recoveredSession = makeSession('s3', 'p1')

    mockInvoke
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('spawn failed'))
      .mockResolvedValueOnce([recoveredSession])

    const { result } = renderHook(() => useAgentSession('p1'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('agent:sessions', 'p1')
    })

    let returnedSession: AgentSession | null = makeSession('placeholder', 'p1')
    await act(async () => {
      returnedSession = await result.current.spawnAgent({
        projectId: 'p1',
        runtimeId: 'codex',
        prompt: 'Test task',
      })
    })

    expect(returnedSession).toBeNull()

    await waitFor(() => {
      expect(result.current.sessions).toEqual([recoveredSession])
      expect(result.current.activeSessionId).toBe('s3')
    })
  })

  it('keeps the session visible until backend deletion succeeds', async () => {
    const session = makeSession('s1', 'p1')
    let resolveDelete: (() => void) | null = null

    mockInvoke
      .mockResolvedValueOnce([session])
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveDelete = resolve
      }))

    const { result } = renderHook(() => useAgentSession('p1'))

    await waitFor(() => {
      expect(result.current.sessions).toEqual([session])
    })

    let deletePromise: Promise<void> | null = null
    act(() => {
      deletePromise = result.current.deleteAgent('s1')
    })

    expect(result.current.sessions).toEqual([session])

    await act(async () => {
      resolveDelete?.()
      await deletePromise
    })

    expect(result.current.sessions).toEqual([])
    expect(result.current.activeSessionId).toBeNull()
  })

  it('closes one agent and leaves the other in the checkout they share', async () => {
    const sessionA = { ...makeSession('s1', 'p1'), worktreePath: '/tmp/shared' }
    const sessionB = { ...makeSession('s2', 'p1'), worktreePath: '/tmp/shared' }

    mockInvoke.mockResolvedValueOnce([sessionA, sessionB])

    const { result } = renderHook(() => useAgentSession('p1'))

    await waitFor(() => {
      expect(result.current.sessions).toEqual([sessionA, sessionB])
    })

    await act(async () => {
      await result.current.deleteAgent('s2')
    })

    expect(mockInvoke).toHaveBeenLastCalledWith('agent:kill', 's2')
    expect(result.current.sessions).toEqual([sessionA])
    expect(result.current.activeSessionId).toBe('s1')
  })

  it('restores the last selected agent when switching back to a repo', async () => {
    const p1a = makeSession('s1', 'p1')
    const p1b = makeSession('s2', 'p1')
    const p2a = makeSession('s3', 'p2')

    mockInvoke.mockImplementation((channel: string, arg: string) => {
      if (channel === 'agent:sessions') {
        if (arg === 'p1') return Promise.resolve([p1a, p1b])
        if (arg === 'p2') return Promise.resolve([p2a])
      }
      return Promise.resolve(undefined)
    })

    const { result, rerender } = renderHook(({ pid }) => useAgentSession(pid), {
      initialProps: { pid: 'p1' as string | null },
    })

    await waitFor(() => {
      expect(result.current.sessions).toEqual([p1a, p1b])
    })

    act(() => {
      result.current.setActiveSession('s2')
    })
    expect(result.current.activeSessionId).toBe('s2')

    rerender({ pid: 'p2' })
    await waitFor(() => {
      expect(result.current.activeSessionId).toBe('s3')
    })

    rerender({ pid: 'p1' })
    await waitFor(() => {
      expect(result.current.activeSessionId).toBe('s2')
    })
  })

  // The sessions list is per *repo*, but the view is per *workspace*. Entering a
  // workspace with no agent of its own (the footer's "+ New Agent", or clicking
  // an empty worktree workspace) clears the selection on purpose to show the
  // empty agent view. A resync must not undo that by promoting the repo's first
  // session — that agent lives in another workspace, and showing it there also
  // auto-resumed it (the "+ New Agent opened on a different workspace's agent" bug).
  it('keeps a deliberately cleared selection empty across a sessions-changed resync', async () => {
    const s1 = makeSession('s1', 'p1')
    const s2 = makeSession('s2', 'p1')
    mockInvoke.mockImplementation((channel: string) =>
      Promise.resolve(channel === 'agent:sessions' ? [s1, s2] : undefined))

    const { result } = renderHook(() => useAgentSession('p1'))
    await waitFor(() => expect(result.current.activeSessionId).toBe('s1'))

    act(() => { result.current.setActiveSession(null) })
    expect(result.current.activeSessionId).toBeNull()

    act(() => { getListener('agent:sessions-changed')({ projectId: 'p1' }) })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2))

    expect(result.current.activeSessionId).toBeNull()
  })

  it('keeps a deliberately cleared selection empty when the repo switches, ignoring the remembered agent', async () => {
    const p1a = makeSession('s1', 'p1')
    const p2a = makeSession('s3', 'p2')
    mockInvoke.mockImplementation((channel: string, arg: string) => {
      if (channel !== 'agent:sessions') return Promise.resolve(undefined)
      return Promise.resolve(arg === 'p1' ? [p1a] : [p2a])
    })

    const { result, rerender } = renderHook(({ pid }) => useAgentSession(pid), {
      initialProps: { pid: 'p1' as string | null },
    })
    await waitFor(() => expect(result.current.activeSessionId).toBe('s1'))

    rerender({ pid: 'p2' })
    await waitFor(() => expect(result.current.activeSessionId).toBe('s3'))

    // Enter an empty workspace of repo p1: the project moves and the selection
    // is cleared in the same render, as App's enterWorkspace does.
    act(() => { result.current.setActiveSession(null) })
    rerender({ pid: 'p1' })
    await waitFor(() => expect(result.current.sessions).toEqual([p1a]))

    expect(result.current.activeSessionId).toBeNull()
  })

  // Spawning is the usual thing to do from the empty view: the new agent must be
  // selected even though the resync it triggers lands before any effect ran.
  it('selects an agent spawned right after a clear', async () => {
    const s1 = makeSession('s1', 'p1')
    const s2 = makeSession('s2', 'p1')
    let listed = [s1]
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:sessions') return Promise.resolve(listed)
      if (channel === 'agent:spawn') { listed = [s1, s2]; return Promise.resolve(s2) }
      return Promise.resolve(undefined)
    })

    const { result } = renderHook(() => useAgentSession('p1'))
    await waitFor(() => expect(result.current.activeSessionId).toBe('s1'))

    act(() => { result.current.setActiveSession(null) })
    await act(async () => {
      await result.current.spawnAgent({ projectId: 'p1', runtimeId: 'codex' } as never)
    })
    await waitFor(() => expect(result.current.sessions).toEqual([s1, s2]))

    expect(result.current.activeSessionId).toBe('s2')
  })

  // Clearing is sticky only until something is selected again; a later resync
  // then behaves as before.
  it('lets a resync fall back to the first session again once an agent was selected after a clear', async () => {
    const s1 = makeSession('s1', 'p1')
    const s2 = makeSession('s2', 'p1')
    mockInvoke.mockImplementation((channel: string) =>
      Promise.resolve(channel === 'agent:sessions' ? [s1, s2] : undefined))

    const { result } = renderHook(() => useAgentSession('p1'))
    await waitFor(() => expect(result.current.activeSessionId).toBe('s1'))

    act(() => { result.current.setActiveSession(null) })
    act(() => { result.current.setActiveSession('s2') })
    expect(result.current.activeSessionId).toBe('s2')

    // s2 vanishes from the list: the fallback to the first session is wanted here.
    mockInvoke.mockImplementation((channel: string) =>
      Promise.resolve(channel === 'agent:sessions' ? [s1] : undefined))
    act(() => { getListener('agent:sessions-changed')({ projectId: 'p1' }) })
    await waitFor(() => expect(result.current.sessions).toEqual([s1]))

    expect(result.current.activeSessionId).toBe('s1')
  })

})
