import { beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import { useAgentSession } from '../agent-session/useAgentSession'
import { useAllProjectSessions } from '../agent-session/useAllProjectSessions'
import { installElectronApi, makeSession, mockInvoke, projects } from '../agent-session/useAllProjectSessions.test-helpers'
import { useAutoSelectActiveProject } from './useAutoSelectActiveProject'

beforeEach(installElectronApi)

it('waits for background discovery to settle before selecting the first repo with agents in registry order', async () => {
  const registered = [...projects, { ...projects[1], id: 'p3', name: 'Project Three' }]
  const activeRows: AgentSession[] = []
  const two = makeSession('two', 'p2')
  const three = makeSession('three', 'p3')
  const setActiveProject = vi.fn()
  let finishSecond!: (sessions: AgentSession[]) => void
  mockInvoke.mockImplementation((_channel: string, projectId: string) => projectId === 'p2'
    ? new Promise<AgentSession[]>((resolve) => { finishSecond = resolve })
    : Promise.resolve([three]))
  const { result } = renderHook(() => {
    const all = useAllProjectSessions(registered, 'p1', activeRows, 'p1')
    useAutoSelectActiveProject({ ...all, settledProjectId: 'p1', activeProjectId: 'p1', projects: registered, setActiveProject })
    return all
  })

  await waitFor(() => expect(result.current.sessionsByProject.p3).toEqual([three]))
  expect(result.current.backgroundDiscoverySettled).toBe(false)
  expect(setActiveProject).not.toHaveBeenCalled()

  await act(async () => { finishSecond([two]) })

  expect(result.current.backgroundDiscoverySettled).toBe(true)
  expect(setActiveProject).toHaveBeenCalledExactlyOnceWith('p2')
  expect(mockInvoke).toHaveBeenCalledTimes(2)
})

it('keeps a user-selected empty repo after the initial repo already had agents while discovery was pending', async () => {
  const registered = [...projects, { ...projects[1], id: 'p3', name: 'Project Three' }]
  const one = makeSession('one', 'p1')
  const three = makeSession('three', 'p3')
  const setActiveProject = vi.fn()
  let finishThird!: (sessions: AgentSession[]) => void
  mockInvoke.mockImplementation((_channel: string, projectId: string) => projectId === 'p2'
    ? Promise.resolve([])
    : new Promise<AgentSession[]>((resolve) => { finishThird = resolve }))
  const { result, rerender } = renderHook(({ active, sessions }) => {
    const all = useAllProjectSessions(registered, active, sessions, active)
    useAutoSelectActiveProject({ ...all, settledProjectId: active, activeProjectId: active, projects: registered, setActiveProject })
    return all
  }, { initialProps: { active: 'p1', sessions: [one] } })
  await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([]))
  expect(result.current.backgroundDiscoverySettled).toBe(false)

  rerender({ active: 'p2', sessions: [] })
  await act(async () => { finishThird([three]) })

  expect(result.current.backgroundDiscoverySettled).toBe(true)
  expect(setActiveProject).not.toHaveBeenCalled()
})

it.each([
  { outcome: 'keeps the restored repo when its delayed reply has agents', activeRows: [makeSession('one', 'p1')], expectedProjectId: null },
  { outcome: 'selects the first repo in registry order when the delayed active reply is empty', activeRows: [], expectedProjectId: 'p2' },
])('$outcome', async ({ activeRows, expectedProjectId }) => {
  const registered = [...projects, { ...projects[1], id: 'p3', name: 'Project Three' }]
  const two = makeSession('two', 'p2')
  const three = makeSession('three', 'p3')
  const setActiveProject = vi.fn()
  const replies = new Map<string, (sessions: AgentSession[]) => void>()
  mockInvoke.mockImplementation((_channel: string, projectId: string) =>
    new Promise<AgentSession[]>((resolve) => { replies.set(projectId, resolve) }))
  const { result } = renderHook(() => {
    const agent = useAgentSession('p1')
    const all = useAllProjectSessions(registered, 'p1', agent.sessions, agent.loadedProjectId)
    useAutoSelectActiveProject({ ...all, settledProjectId: agent.settledProjectId, activeProjectId: 'p1', projects: registered, setActiveProject })
    return { ...all, loadedProjectId: agent.loadedProjectId }
  })

  await act(async () => { replies.get('p3')!([three]) })
  expect(result.current.backgroundDiscoverySettled).toBe(false)
  expect(setActiveProject).not.toHaveBeenCalled()

  await act(async () => { replies.get('p2')!([two]) })
  expect(result.current.backgroundDiscoverySettled).toBe(true)
  expect(result.current.loadedProjectId).toBeNull()
  expect(result.current.sessionsByProject.p1).toEqual([])
  expect(setActiveProject).not.toHaveBeenCalled()

  await act(async () => { replies.get('p1')!(activeRows) })
  expect(result.current.loadedProjectId).toBe('p1')
  expect(result.current.sessionsByProject.p1).toEqual(activeRows)
  if (expectedProjectId) expect(setActiveProject).toHaveBeenCalledExactlyOnceWith(expectedProjectId)
  else expect(setActiveProject).not.toHaveBeenCalled()
  expect(mockInvoke).toHaveBeenCalledTimes(3)
})

it.each([true, false])('selects the first repo with agents when active discovery fails (failure first: %s)', async (failureFirst) => {
  const registered = [...projects, { ...projects[1], id: 'p3', name: 'Project Three' }]
  const setActiveProject = vi.fn()
  const replies = new Map<string, { resolve: (sessions: AgentSession[]) => void; reject: (error: Error) => void }>()
  mockInvoke.mockImplementation((_channel: string, projectId: string) =>
    new Promise<AgentSession[]>((resolve, reject) => { replies.set(projectId, { resolve, reject }) }))
  const { result } = renderHook(() => {
    const agent = useAgentSession('p1')
    const all = useAllProjectSessions(registered, 'p1', agent.sessions, agent.loadedProjectId)
    useAutoSelectActiveProject({ ...all, settledProjectId: agent.settledProjectId, activeProjectId: 'p1', projects: registered, setActiveProject })
    return { agent, ...all }
  })

  await act(async () => {
    replies.get('p3')!.resolve([makeSession('three', 'p3')])
    if (failureFirst) replies.get('p1')!.reject(new Error('Discovery unavailable'))
  })
  expect(result.current.backgroundDiscoverySettled).toBe(false)
  expect(setActiveProject).not.toHaveBeenCalled()

  await act(async () => { replies.get('p2')!.resolve([makeSession('two', 'p2')]) })
  expect(result.current.backgroundDiscoverySettled).toBe(true)
  if (!failureFirst) {
    expect(setActiveProject).not.toHaveBeenCalled()
    await act(async () => { replies.get('p1')!.reject(new Error('Discovery unavailable')) })
  }

  expect(result.current.agent.loadedProjectId).toBeNull()
  expect(result.current.agent.sessions).toEqual([])
  expect(setActiveProject).toHaveBeenCalledExactlyOnceWith('p2')
  expect(mockInvoke).toHaveBeenCalledTimes(3)
})

it('keeps a user-selected empty repo after spawning before the initial active discovery finishes', async () => {
  const spawned = { ...makeSession('one', 'p1'), nonInteractive: true, pid: null }
  const setActiveProject = vi.fn()
  const pending: Array<(sessions: AgentSession[]) => void> = []
  mockInvoke.mockImplementation((channel: string, projectId: string) => {
    if (channel === 'agent:spawn') return Promise.resolve(spawned)
    if (channel !== 'agent:sessions') throw new Error(`Unexpected IPC: ${channel}`)
    if (projectId === 'p2') return Promise.resolve([])
    return new Promise<AgentSession[]>((resolve) => { pending.push(resolve) })
  })
  const { result, rerender } = renderHook(({ active }) => {
    const agent = useAgentSession(active)
    const all = useAllProjectSessions(projects, active, agent.sessions, agent.loadedProjectId)
    useAutoSelectActiveProject({ ...all, settledProjectId: agent.settledProjectId, activeProjectId: active, projects, setActiveProject })
    return { agent, ...all }
  }, { initialProps: { active: 'p1' } })
  await waitFor(() => expect(result.current.backgroundDiscoverySettled).toBe(true))

  await act(async () => {
    await result.current.agent.spawnAgent({ projectId: 'p1', runtimeId: 'codex', prompt: '', nonInteractive: true })
  })
  expect(result.current.agent.loadedProjectId).toBeNull()
  expect(result.current.sessionsByProject.p1).toEqual([spawned])

  rerender({ active: 'p2' })
  await waitFor(() => expect(result.current.agent.loadedProjectId).toBe('p2'))
  expect(setActiveProject).not.toHaveBeenCalled()

  await act(async () => { pending.forEach((resolve) => resolve([spawned])) })
  expect(setActiveProject).not.toHaveBeenCalled()
})
