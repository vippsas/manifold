import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import { useAgentSession } from './useAgentSession'
import { useAllProjectSessions } from './useAllProjectSessions'
import { useWorkspaceEntry } from '../app/useWorkspaceEntry'
import { groupSessionsByWorkspace } from '../app/session-workspace-map'

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
  it('keeps a background agent on every render when leaving an empty repo with its new reply pending', async () => {
    const sibling = makeSession('s2', 'p2')
    const workspaces = [{ id: 'w', name: 'Workspace', projectIds: ['p1', 'p2'], createdAt: '' }]
    const pending: Array<(rows: AgentSession[]) => void> = []
    let holdReply = false
    mockInvoke.mockImplementation(async (channel: string, projectId: string) => {
      if (channel !== 'agent:sessions') throw new Error(`Unexpected IPC: ${channel}`)
      if (projectId === 'p1') return []
      if (holdReply) return new Promise<AgentSession[]>((resolve) => { pending.push(resolve) })
      return [sibling]
    })
    const renders: Array<{ workspace: AgentSession[]; p2: AgentSession[] }> = []
    const { result } = renderHook(() => {
      const [activeProjectId, setActiveProject] = useState<string | null>('p1')
      const agent = useAgentSession(activeProjectId)
      const { sessionsByProject } = useAllProjectSessions(projects, activeProjectId, agent.sessions, agent.loadedProjectId)
      const sessionsByWorkspace = groupSessionsByWorkspace(sessionsByProject, workspaces)
      const entry = useWorkspaceEntry({
        workspaces, sessionsByWorkspace, favorites: [], activeProjectId, activeWorkspaceId: 'w',
        activeSessionId: agent.activeSessionId, selectSession: agent.setActiveSession,
        selectWorkspace: () => {}, setActiveProject,
      })
      if (holdReply) renders.push({ workspace: sessionsByWorkspace.w ?? [], p2: sessionsByProject.p2 })
      return { agent, entry, activeProjectId, setActiveProject, sessionsByProject }
    })
    await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([sibling]))
    expect(result.current.agent.sessions).toEqual([])

    holdReply = true
    // The dock's onSelectSession callback uses this same selection wrapper.
    await act(async () => { result.current.entry.setActiveSession(sibling.id) })
    expect(result.current.activeProjectId).toBe('p2')
    expect(result.current.agent.activeSessionId).toBe(sibling.id)
    expect(pending).toHaveLength(1)
    expect(renders.length).toBeGreaterThan(0)
    expect(renders.every(({ workspace }) => workspace.includes(sibling))).toBe(true)
    expect(renders.every(({ p2 }) => p2.length === 1 && p2[0] === sibling)).toBe(true)

    // Expose p2 as a background repo again while its requests are pending:
    // the snapshot must also have retained S2, not cached p1's empty list.
    await act(async () => { result.current.setActiveProject('p1') })
    expect(result.current.sessionsByProject.p2).toEqual([sibling])
    expect(renders.every(({ p2 }) => p2.length === 1 && p2[0] === sibling)).toBe(true)
    await act(async () => { pending.forEach((resolve) => resolve([sibling])) })
  })

  it('refreshes background project sessions when they change', async () => {
    const activeSession = makeSession('active', 'p1')
    const initialBackgroundSessions = [makeSession('bg-1', 'p2')]
    const refreshedBackgroundSessions = [...initialBackgroundSessions, makeSession('bg-2', 'p2')]

    mockInvoke
      .mockResolvedValueOnce(initialBackgroundSessions)
      .mockResolvedValueOnce(refreshedBackgroundSessions)

    const { result } = renderHook(() => useAllProjectSessions(projects, 'p1', [activeSession], 'p1'))

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

  it('shows a newly spawned agent while initial session discovery is pending', async () => {
    const spawned = { ...makeSession('s1', 'p1'), nonInteractive: true, pid: null }
    const pending: Array<(sessions: AgentSession[]) => void> = []
    mockInvoke.mockImplementation((channel: string, projectId: string) => {
      if (channel === 'agent:spawn') return Promise.resolve(spawned)
      if (channel !== 'agent:sessions') throw new Error(`Unexpected IPC: ${channel}`)
      if (projectId === 'p2') return Promise.resolve([])
      return new Promise<AgentSession[]>((resolve) => { pending.push(resolve) })
    })
    const { result } = renderHook(() => {
      const agent = useAgentSession('p1')
      const all = useAllProjectSessions(projects, 'p1', agent.sessions, agent.loadedProjectId)
      return { agent, ...all }
    })

    await act(async () => {
      await result.current.agent.spawnAgent({ projectId: 'p1', runtimeId: 'codex', prompt: '', nonInteractive: true })
    })
    expect(result.current.agent.loadedProjectId).toBeNull()
    expect(result.current.agent.sessions).toEqual([spawned])
    expect(result.current.sessionsByProject.p1).toEqual([spawned])

    await act(async () => { pending.forEach((resolve) => resolve([spawned])) })
    expect(result.current.sessionsByProject.p1).toEqual([spawned])
  })

  it('does not cache a foreign session when a spawn finishes after switching repos', async () => {
    const original = makeSession('s1', 'p1')
    const sibling = makeSession('s2', 'p2')
    const spawned = makeSession('s3', 'p1')
    let finishSpawn!: (session: AgentSession) => void
    let finishRefresh!: (sessions: AgentSession[]) => void
    let holdRefresh = false
    mockInvoke.mockImplementation((channel: string, projectId: string) => {
      if (channel === 'agent:spawn') {
        return new Promise<AgentSession>((resolve) => { finishSpawn = resolve })
      }
      if (channel !== 'agent:sessions') throw new Error(`Unexpected IPC: ${channel}`)
      if (projectId === 'p2') return Promise.resolve([sibling])
      if (holdRefresh) {
        return new Promise<AgentSession[]>((resolve) => { finishRefresh = resolve })
      }
      return Promise.resolve([original])
    })
    const renders: AgentSession[][] = []
    const { result, rerender } = renderHook(({ projectId }) => {
      const agent = useAgentSession(projectId)
      const all = useAllProjectSessions(projects, projectId, agent.sessions, agent.loadedProjectId)
      if (holdRefresh) renders.push(all.sessionsByProject.p2)
      return { agent, ...all }
    }, { initialProps: { projectId: 'p1' } })
    await waitFor(() => expect(result.current.agent.loadedProjectId).toBe('p1'))

    let spawnPromise!: Promise<AgentSession | null>
    act(() => {
      spawnPromise = result.current.agent.spawnAgent({ projectId: 'p1', runtimeId: 'codex', prompt: '' })
    })
    rerender({ projectId: 'p2' })
    await waitFor(() => expect(result.current.agent.loadedProjectId).toBe('p2'))

    holdRefresh = true
    await act(async () => {
      finishSpawn(spawned)
      await spawnPromise
    })
    expect(result.current.sessionsByProject.p2).toEqual([sibling])
    expect(renders.every((sessions) => sessions.length === 1 && sessions[0] === sibling)).toBe(true)

    // The late spawn's refresh must not leave a contaminated background cache.
    await act(async () => { finishRefresh([original, spawned]) })
    expect(result.current.sessionsByProject.p2).toEqual([sibling])
  })
})
