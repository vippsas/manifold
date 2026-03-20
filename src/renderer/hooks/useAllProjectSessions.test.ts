import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AgentSession, Project } from '../../shared/types'
import { useAllProjectSessions } from './useAllProjectSessions'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

const projects: Project[] = [
  { id: 'p1', name: 'Project One', path: '/p1', baseBranch: 'main', addedAt: '2026-01-01' },
  { id: 'p2', name: 'Project Two', path: '/p2', baseBranch: 'main', addedAt: '2026-01-02' },
]

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

describe('useAllProjectSessions', () => {
  it('refreshes background project sessions when they change', async () => {
    const activeSession = makeSession('active', 'p1')
    const initialBackgroundSessions = [makeSession('bg-1', 'p2')]
    const refreshedBackgroundSessions = [...initialBackgroundSessions, makeSession('bg-2', 'p2')]

    mockInvoke
      .mockResolvedValueOnce(initialBackgroundSessions)
      .mockResolvedValueOnce(refreshedBackgroundSessions)

    const { result } = renderHook(() => useAllProjectSessions(projects, 'p1', [activeSession]))

    await waitFor(() => {
      expect(result.current.sessionsByProject.p2).toEqual(initialBackgroundSessions)
    })

    act(() => {
      getListener('agent:sessions-changed')({ projectId: 'p2' })
    })

    await waitFor(() => {
      expect(result.current.sessionsByProject.p2).toEqual(refreshedBackgroundSessions)
    })

    expect(result.current.sessionsByProject.p1).toEqual([activeSession])
  })
})
