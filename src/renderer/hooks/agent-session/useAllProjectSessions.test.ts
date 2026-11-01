import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { AgentSession } from '../../../shared/types'
import { useAgentSession } from './useAgentSession'
import { useAllProjectSessions } from './useAllProjectSessions'
import { useWorkspaceEntry } from '../app/useWorkspaceEntry'
import { groupSessionsByWorkspace } from '../app/session-workspace-map'
import { mockInvoke, mockOn, projects, makeSession, getListener, installElectronApi } from './useAllProjectSessions.test-helpers'

beforeEach(installElectronApi)

describe('useAllProjectSessions', () => {
  it('refreshes only a dirty departing repo when its active resync is dropped', async () => {
    const a = makeSession('a', 'p1')
    const b = makeSession('b', 'p1')
    const two = makeSession('two', 'p2')
    const three = makeSession('three', 'p3')
    const registered = [...projects, { ...projects[1], id: 'p3', name: 'Project Three' }]
    let finishActive!: (sessions: AgentSession[]) => void
    let finishBackground!: (sessions: AgentSession[]) => void
    let p1Calls = 0
    mockInvoke.mockImplementation((_channel: string, projectId: string) => {
      if (projectId === 'p2') return Promise.resolve([two])
      if (projectId === 'p3') return Promise.resolve([three])
      if (++p1Calls === 1) return Promise.resolve([a, b])
      return new Promise<AgentSession[]>((resolve) => {
        if (p1Calls === 2) finishActive = resolve
        else finishBackground = resolve
      })
    })
    const { result, rerender } = renderHook(({ projectId }) => {
      const agent = useAgentSession(projectId)
      const all = useAllProjectSessions(registered, projectId, agent.sessions, agent.loadedProjectId)
      return { ...all, loadedProjectId: agent.loadedProjectId }
    }, { initialProps: { projectId: 'p1' } })
    await waitFor(() => expect(result.current.sessionsByProject.p1).toEqual([a, b]))
    // Deliver the event to both the active-session hook and the background cache.
    act(() => {
      for (const [channel, listener] of mockOn.mock.calls as unknown as [string, (event: unknown) => void][]) {
        if (channel === 'agent:sessions-changed') listener({ projectId: 'p1' })
      }
    })
    expect(p1Calls).toBe(2)
    rerender({ projectId: 'p2' })
    await waitFor(() => expect(result.current.loadedProjectId).toBe('p2'))
    await act(async () => { finishActive([a]) })
    expect(result.current.sessionsByProject.p1).toEqual([a, b])
    expect(p1Calls).toBe(3)
    await act(async () => { finishBackground([a]) })
    expect(result.current.sessionsByProject.p1).toEqual([a])
    expect(result.current.sessionsByProject.p2).toEqual([two])
    expect(mockInvoke.mock.calls.filter(([, id]) => id === 'p2')).toHaveLength(2)
    expect(mockInvoke.mock.calls.filter(([, id]) => id === 'p3')).toHaveLength(1)
  })

  it('retries dirty recovery after reentry invalidates an unfinished departing refresh', async () => {
    const a = makeSession('a', 'p1')
    const b = makeSession('b', 'p1')
    const two = makeSession('two', 'p2')
    const pendingOne: Array<(sessions: AgentSession[]) => void> = []
    const pendingTwo: Array<(sessions: AgentSession[]) => void> = []
    let holdReplies = false
    mockInvoke.mockImplementation((_channel: string, projectId: string) => {
      if (!holdReplies) return Promise.resolve(projectId === 'p1' ? [a, b] : [two])
      return new Promise<AgentSession[]>((resolve) => {
        const pending = projectId === 'p1' ? pendingOne : pendingTwo
        pending.push(resolve)
      })
    })
    const { result, rerender } = renderHook(({ projectId }) => {
      const agent = useAgentSession(projectId)
      return useAllProjectSessions(projects, projectId, agent.sessions, agent.loadedProjectId)
    }, { initialProps: { projectId: 'p1' } })
    await waitFor(() => expect(result.current.sessionsByProject).toEqual({ p1: [a, b], p2: [two] }))

    holdReplies = true
    act(() => {
      for (const [channel, listener] of mockOn.mock.calls as unknown as [string, (event: unknown) => void][]) {
        if (channel === 'agent:sessions-changed') listener({ projectId: 'p1' })
      }
    })
    rerender({ projectId: 'p2' })
    rerender({ projectId: 'p1' })
    rerender({ projectId: 'p2' })

    await act(async () => {
      pendingOne.forEach((resolve) => resolve([a]))
      pendingTwo.forEach((resolve) => resolve([two]))
    })
    expect(result.current.sessionsByProject.p1).toEqual([a])
    expect(result.current.sessionsByProject.p2).toEqual([two])
  })

  it('keeps cached sessions on discovery failure and retries on the next departure', async () => {
    const one = makeSession('one', 'p1')
    const two = makeSession('two', 'p2')
    mockInvoke.mockImplementation((_channel: string, projectId: string) =>
      projectId === 'p1' ? Promise.reject(new Error('Discovery failed')) : Promise.resolve([two]),
    )
    const { result, rerender } = renderHook(({ active, sessions }) =>
      useAllProjectSessions(projects, active, sessions, active), {
      initialProps: { active: 'p1', sessions: [one] },
    })
    await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([two]))
    act(() => { getListener('agent:sessions-changed')({ projectId: 'p1' }) })

    await act(async () => { rerender({ active: 'p2', sessions: [two] }) })

    expect(mockInvoke).toHaveBeenCalledWith('agent:sessions', 'p1')
    expect(result.current.sessionsByProject.p1).toEqual([one])

    mockInvoke.mockResolvedValue([])
    rerender({ active: 'p1', sessions: [one] })
    await act(async () => { rerender({ active: 'p2', sessions: [two] }) })
    expect(result.current.sessionsByProject.p1).toEqual([])
  })

  it('does not overwrite a departing repo snapshot with earlier background discovery', async () => {
    const old = makeSession('old', 'p2')
    const fresh = makeSession('fresh', 'p2')
    let resolve!: (sessions: AgentSession[]) => void
    mockInvoke.mockImplementation(() => new Promise<AgentSession[]>((done) => { resolve = done }))
    const { result, rerender } = renderHook(({ active, sessions }) => useAllProjectSessions(projects, active, sessions, active), {
      initialProps: { active: 'p1', sessions: [makeSession('one', 'p1')] },
    })
    rerender({ active: 'p2', sessions: [fresh] })
    rerender({ active: 'p1', sessions: [] })
    await act(async () => { resolve([old]) })
    expect(result.current.sessionsByProject.p2).toEqual([fresh])
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('discovers a departing repo when its initial active-session load has not finished', async () => {
    const one = makeSession('one', 'p1')
    const two = makeSession('two', 'p2')
    let finishFirst!: (sessions: AgentSession[]) => void
    const firstDiscovery = new Promise<AgentSession[]>((resolve) => { finishFirst = resolve })
    mockInvoke.mockImplementation((_channel: string, projectId: string) =>
      projectId === 'p1' ? firstDiscovery : Promise.resolve([two]),
    )
    const { result, rerender } = renderHook(({ projectId }) => {
      const agent = useAgentSession(projectId)
      const all = useAllProjectSessions(projects, projectId, agent.sessions, agent.loadedProjectId)
      return { ...all, loadedProjectId: agent.loadedProjectId }
    }, { initialProps: { projectId: 'p1' } })
    await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([two]))
    expect(result.current.loadedProjectId).toBeNull()

    rerender({ projectId: 'p2' })
    await waitFor(() => expect(result.current.loadedProjectId).toBe('p2'))
    await act(async () => { finishFirst([one]) })

    expect(result.current.sessionsByProject.p1).toEqual([one])
    expect(result.current.sessionsByProject.p2).toEqual([two])
  })

  it('keeps a newer snapshot when a departing-repo discovery finishes after reentry', async () => {
    const old = makeSession('old', 'p1')
    const fresh = makeSession('fresh', 'p1')
    const two = makeSession('two', 'p2')
    let finishFirst!: (sessions: AgentSession[]) => void
    const firstDiscovery = new Promise<AgentSession[]>((resolve) => { finishFirst = resolve })
    let firstRepoRequests = 0
    mockInvoke.mockImplementation((_channel: string, projectId: string) => {
      if (projectId === 'p2') return Promise.resolve([two])
      return ++firstRepoRequests <= 2 ? firstDiscovery : Promise.resolve([fresh])
    })
    const { result, rerender } = renderHook(({ projectId }) => {
      const agent = useAgentSession(projectId)
      const all = useAllProjectSessions(projects, projectId, agent.sessions, agent.loadedProjectId)
      return { ...all, loadedProjectId: agent.loadedProjectId }
    }, { initialProps: { projectId: 'p1' } })
    await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([two]))
    rerender({ projectId: 'p2' })
    await waitFor(() => expect(result.current.loadedProjectId).toBe('p2'))
    rerender({ projectId: 'p1' })
    await waitFor(() => expect(result.current.sessionsByProject.p1).toEqual([fresh]))
    rerender({ projectId: 'p2' })

    await act(async () => { finishFirst([old]) })
    expect(result.current.sessionsByProject.p1).toEqual([fresh])
  })

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
