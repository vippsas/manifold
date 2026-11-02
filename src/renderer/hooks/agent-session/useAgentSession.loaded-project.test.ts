import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { AgentSession } from '../../../shared/types'
import { useAgentSession } from './useAgentSession'
import { getListener, installElectronApi, makeSession, mockInvoke } from './useAllProjectSessions.test-helpers'

beforeEach(installElectronApi)

it('pairs the loaded project with its sessions, including empty replies and reset', async () => {
  const replies = new Map<string, (sessions: AgentSession[]) => void>()
  window.electronAPI = {
    invoke: vi.fn(async (channel: string, projectId: string) => {
      if (channel !== 'agent:sessions') throw new Error(`Unexpected IPC: ${channel}`)
      return new Promise<AgentSession[]>((resolve) => { replies.set(projectId, resolve) })
    }),
    on: vi.fn(() => () => {}), send: vi.fn(), getPathForFile: vi.fn(),
  }
  const sibling: AgentSession = {
    id: 's2', projectId: 'p2', runtimeId: 'codex', branchName: '',
    worktreePath: '/wt/s2', status: 'running', pid: 1, additionalDirs: [],
  }
  const renders: Array<{ loadedProjectId: string | null; sessions: AgentSession[] }> = []
  const { result, rerender } = renderHook(({ projectId }) => {
    const agent = useAgentSession(projectId)
    renders.push({ loadedProjectId: agent.loadedProjectId, sessions: agent.sessions })
    return agent
  }, { initialProps: { projectId: 'p1' as string | null } })
  expect(result.current.loadedProjectId).toBeNull()
  expect(result.current.settledProjectId).toBeNull()

  await act(async () => { replies.get('p1')!([]) })
  expect(result.current.loadedProjectId).toBe('p1')
  expect(result.current.settledProjectId).toBe('p1')
  expect(result.current.sessions).toEqual([])

  rerender({ projectId: 'p2' })
  expect(result.current.loadedProjectId).toBe('p1')
  expect(result.current.settledProjectId).toBeNull()
  expect(result.current.sessions).toEqual([])
  await act(async () => { replies.get('p2')!([sibling]) })
  expect(result.current.loadedProjectId).toBe('p2')
  expect(result.current.settledProjectId).toBe('p2')
  expect(result.current.sessions).toEqual([sibling])

  rerender({ projectId: null })
  expect(result.current.loadedProjectId).toBeNull()
  expect(result.current.settledProjectId).toBeNull()
  expect(result.current.sessions).toEqual([])
  expect(renders.every(({ loadedProjectId, sessions }) => (
    loadedProjectId === 'p2' ? sessions[0] === sibling : sessions.length === 0
  ))).toBe(true)
})

it('settles failed discovery without claiming a successful load and recovers on a later event', async () => {
  const session = makeSession('one', 'p1')
  let finishRetry!: (sessions: AgentSession[]) => void
  mockInvoke.mockRejectedValueOnce(new Error('Discovery unavailable'))
    .mockImplementationOnce(() => new Promise<AgentSession[]>((resolve) => { finishRetry = resolve }))
  const { result } = renderHook(() => useAgentSession('p1'))

  await waitFor(() => expect(result.current.settledProjectId).toBe('p1'))
  expect(result.current.loadedProjectId).toBeNull()
  expect(result.current.sessions).toEqual([])

  act(() => { getListener('agent:sessions-changed')({ projectId: 'p1' }) })
  expect(result.current.settledProjectId).toBeNull()
  await act(async () => { finishRetry([session]) })
  expect(result.current.settledProjectId).toBe('p1')
  expect(result.current.loadedProjectId).toBe('p1')
  expect(result.current.sessions).toEqual([session])

  mockInvoke.mockRejectedValueOnce(new Error('Refresh unavailable'))
  await act(async () => { getListener('agent:sessions-changed')({ projectId: 'p1' }) })
  expect(result.current.settledProjectId).toBe('p1')
  expect(result.current.loadedProjectId).toBe('p1')
  expect(result.current.sessions).toEqual([session])
})

it.each([true, false])('ignores an obsolete discovery completion during a newer request (failure: %s)', async (failure) => {
  const replies: Array<{ resolve: (sessions: AgentSession[]) => void; reject: (error: Error) => void }> = []
  mockInvoke.mockImplementation(() => new Promise<AgentSession[]>((resolve, reject) => { replies.push({ resolve, reject }) }))
  const { result } = renderHook(() => useAgentSession('p1'))
  act(() => { getListener('agent:sessions-changed')({ projectId: 'p1' }) })

  await act(async () => {
    if (failure) replies[0].reject(new Error('Obsolete failure'))
    else replies[0].resolve([makeSession('obsolete', 'p1')])
  })
  expect(result.current.settledProjectId).toBeNull()
  expect(result.current.loadedProjectId).toBeNull()
  expect(result.current.sessions).toEqual([])

  await act(async () => { replies[1].resolve([]) })
  expect(result.current.settledProjectId).toBe('p1')
  expect(result.current.loadedProjectId).toBe('p1')
  expect(mockInvoke).toHaveBeenCalledTimes(2)
})
