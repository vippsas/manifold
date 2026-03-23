import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AgentSession } from '../../shared/types'
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
})
