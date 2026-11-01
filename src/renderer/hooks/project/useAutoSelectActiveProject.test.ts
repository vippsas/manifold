import { beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
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
    useAutoSelectActiveProject({ ...all, activeProjectId: 'p1', projects: registered, setActiveProject })
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
    useAutoSelectActiveProject({ ...all, activeProjectId: active, projects: registered, setActiveProject })
    return all
  }, { initialProps: { active: 'p1', sessions: [one] } })
  await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([]))
  expect(result.current.backgroundDiscoverySettled).toBe(false)

  rerender({ active: 'p2', sessions: [] })
  await act(async () => { finishThird([three]) })

  expect(result.current.backgroundDiscoverySettled).toBe(true)
  expect(setActiveProject).not.toHaveBeenCalled()
})
