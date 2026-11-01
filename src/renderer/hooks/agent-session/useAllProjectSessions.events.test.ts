import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import { useAgentSession } from './useAgentSession'
import { useAllProjectSessions } from './useAllProjectSessions'
import { mockInvoke, mockOn, projects, makeSession, getListener, installElectronApi } from './useAllProjectSessions.test-helpers'

beforeEach(installElectronApi)

function emit(channel: string, event: unknown): void {
  for (const [name, listener] of mockOn.mock.calls as unknown as [string, (event: unknown) => void][]) {
    if (name === channel) listener(event)
  }
}

describe('background session lifecycle events', () => {
  it.each(['cold', 'cached'])('retains lifecycle events while a slower repo delays %s discovery', async (cache) => {
    const one = makeSession('one', 'p1')
    const two = makeSession('two', 'p2')
    const sibling = makeSession('sibling', 'p2')
    const three = makeSession('three', 'p3')
    const activeRows = [one]
    const registered = [...projects, { ...projects[1], id: 'p3', name: 'Project Three' }]
    let finishThird!: (sessions: AgentSession[]) => void
    mockInvoke.mockImplementation((_channel: string, projectId: string) => projectId === 'p2'
      ? Promise.resolve([two, sibling])
      : new Promise<AgentSession[]>((resolve) => { finishThird = resolve }))
    const { result, rerender } = renderHook(({ registry }) =>
      useAllProjectSessions(registry, 'p1', activeRows, 'p1'), {
      initialProps: { registry: cache === 'cached' ? projects : registered },
    })
    if (cache === 'cached') {
      await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([two, sibling]))
      rerender({ registry: registered })
    }
    // p2 has replied, but p3 is still holding the discovery batch open.
    await act(async () => {})
    mockInvoke.mockClear()

    act(() => {
      getListener('agent:status')({ sessionId: sibling.id, status: 'waiting' })
      getListener('agent:exit')({ sessionId: two.id, code: 0 })
    })
    await act(async () => { finishThird([three]) })

    expect(result.current.sessionsByProject.p2).toEqual([
      { ...two, status: 'done', pid: null },
      { ...sibling, status: 'waiting' },
    ])
    expect(result.current.sessionsByProject.p3).toEqual([three])
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it.each([0, 1, null])('marks a departed session done and clears its pid on exit code %s without discovery', async (code) => {
    const one = makeSession('one', 'p1')
    const two = makeSession('two', 'p2')
    mockInvoke.mockResolvedValue([two])
    const { result, rerender } = renderHook(({ active, sessions }) =>
      useAllProjectSessions(projects, active, sessions, active), {
      initialProps: { active: 'p1', sessions: [one] },
    })
    await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([two]))
    rerender({ active: 'p2', sessions: [two] })
    const activeRows = result.current.sessionsByProject.p2
    mockInvoke.mockClear()

    act(() => { getListener('agent:exit')({ sessionId: one.id, code }) })

    expect(result.current.sessionsByProject.p1).toEqual([{ ...one, status: 'done', pid: null }])
    expect(result.current.sessionsByProject.p2).toBe(activeRows)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('updates running to waiting without discovery and preserves unchanged rows and arrays', async () => {
    const active = makeSession('active', 'p1')
    const background = makeSession('background', 'p2')
    const sibling = makeSession('sibling', 'p2')
    const activeRows = [active]
    mockInvoke.mockResolvedValue([background, sibling])
    const { result } = renderHook(() => useAllProjectSessions(projects, 'p1', activeRows, 'p1'))
    await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([background, sibling]))
    const previousRows = result.current.sessionsByProject.p2
    mockInvoke.mockClear()

    act(() => { getListener('agent:status')({ sessionId: background.id, status: 'waiting' }) })

    const waitingRows = result.current.sessionsByProject.p2
    expect(waitingRows).toEqual([{ ...background, status: 'waiting' }, sibling])
    expect(waitingRows).not.toBe(previousRows)
    expect(waitingRows[1]).toBe(sibling)
    expect(result.current.sessionsByProject.p1).toBe(activeRows)

    act(() => {
      getListener('agent:status')({ sessionId: background.id, status: 'waiting' })
      getListener('agent:status')({ sessionId: 'unknown', status: 'done' })
      getListener('agent:exit')({ sessionId: 'unknown', code: 0 })
    })
    expect(result.current.sessionsByProject.p2).toBe(waitingRows)
    act(() => { getListener('agent:exit')({ sessionId: background.id, code: 0 }) })
    const exitedRows = result.current.sessionsByProject.p2
    act(() => { getListener('agent:exit')({ sessionId: background.id, code: 0 }) })
    expect(result.current.sessionsByProject.p2).toBe(exitedRows)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('leaves active events to useAgentSession without applying the background exit policy twice', async () => {
    const one = makeSession('one', 'p1')
    const two = makeSession('two', 'p2')
    mockInvoke.mockImplementation(async (_channel: string, projectId: string) => projectId === 'p1' ? [one] : [two])
    const { result, rerender } = renderHook(({ projectId }) => {
      const agent = useAgentSession(projectId)
      const all = useAllProjectSessions(projects, projectId, agent.sessions, agent.loadedProjectId)
      return { agent, ...all }
    }, { initialProps: { projectId: 'p1' } })
    await waitFor(() => expect(result.current.sessionsByProject).toEqual({ p1: [one], p2: [two] }))
    const backgroundRows = result.current.sessionsByProject.p2
    mockInvoke.mockClear()

    act(() => { emit('agent:status', { sessionId: one.id, status: 'waiting' }) })
    expect(result.current.agent.sessions[0].status).toBe('waiting')
    expect(result.current.sessionsByProject.p1).toBe(result.current.agent.sessions)
    act(() => { emit('agent:exit', { sessionId: one.id, code: 1 }) })
    const exitedRows = result.current.agent.sessions
    // The active hook retains its existing nonzero-exit behaviour.
    expect(exitedRows).toEqual([{ ...one, status: 'error', pid: null }])
    expect(result.current.sessionsByProject.p1).toBe(exitedRows)
    expect(result.current.sessionsByProject.p2).toBe(backgroundRows)
    expect(mockInvoke).not.toHaveBeenCalled()

    rerender({ projectId: 'p2' })
    await waitFor(() => expect(result.current.agent.loadedProjectId).toBe('p2'))
    expect(result.current.sessionsByProject.p1).toBe(exitedRows)
  })

  it('does not patch active cache rows when only the background listener receives an event', async () => {
    const one = makeSession('one', 'p1')
    const two = makeSession('two', 'p2')
    const activeRows = [one]
    mockInvoke.mockResolvedValue([two])
    const { result, rerender } = renderHook(({ active, sessions }) =>
      useAllProjectSessions(projects, active, sessions, active), {
      initialProps: { active: 'p1', sessions: activeRows },
    })
    await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([two]))
    mockInvoke.mockClear()
    act(() => {
      getListener('agent:status')({ sessionId: one.id, status: 'waiting' })
      getListener('agent:exit')({ sessionId: one.id, code: 0 })
    })
    rerender({ active: 'p2', sessions: [two] })
    expect(result.current.sessionsByProject.p1).toBe(activeRows)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('keeps lifecycle events for a cached repo left before its active discovery completes', async () => {
    const one = makeSession('one', 'p1')
    const two = makeSession('two', 'p2')
    let finishSecond!: (sessions: AgentSession[]) => void
    let holdSecond = false
    mockInvoke.mockImplementation((_channel: string, projectId: string) => {
      if (projectId === 'p1') return Promise.resolve([one])
      return holdSecond
        ? new Promise<AgentSession[]>((resolve) => { finishSecond = resolve })
        : Promise.resolve([two])
    })
    const { result, rerender } = renderHook(({ projectId }) => {
      const agent = useAgentSession(projectId)
      return { agent, ...useAllProjectSessions(projects, projectId, agent.sessions, agent.loadedProjectId) }
    }, { initialProps: { projectId: 'p1' } })
    await waitFor(() => expect(result.current.sessionsByProject).toEqual({ p1: [one], p2: [two] }))
    // Visit p2 first so departure has a snapshot and will not rediscover it.
    rerender({ projectId: 'p2' })
    await waitFor(() => expect(result.current.agent.loadedProjectId).toBe('p2'))
    rerender({ projectId: 'p1' })
    await waitFor(() => expect(result.current.agent.loadedProjectId).toBe('p1'))
    holdSecond = true
    rerender({ projectId: 'p2' })
    expect(result.current.agent.loadedProjectId).toBe('p1')
    mockInvoke.mockClear()

    act(() => { emit('agent:status', { sessionId: two.id, status: 'done' }) })
    expect(result.current.sessionsByProject.p2).toEqual([{ ...two, status: 'done' }])
    act(() => { emit('agent:exit', { sessionId: two.id, code: 0 }) })
    expect(result.current.sessionsByProject.p2).toEqual([{ ...two, status: 'done', pid: null }])
    expect(mockInvoke).not.toHaveBeenCalled()
    rerender({ projectId: 'p1' })
    await act(async () => { finishSecond([two]) })

    expect(result.current.sessionsByProject.p2).toEqual([{ ...two, status: 'done', pid: null }])
    expect(mockInvoke.mock.calls).toEqual([['agent:sessions', 'p1']])
  })

  it('lets a later dirty refresh replace older event state by write order, without a version bump', async () => {
    const one = makeSession('one', 'p1')
    const old = makeSession('two', 'p2')
    const fresh = { ...old, status: 'done' as const, pid: null }
    let finishRefresh!: (sessions: AgentSession[]) => void
    mockInvoke.mockResolvedValueOnce([old])
      .mockImplementationOnce(() => new Promise<AgentSession[]>((resolve) => { finishRefresh = resolve }))
    const { result, rerender } = renderHook(({ active, sessions }) =>
      useAllProjectSessions(projects, active, sessions, active), {
      initialProps: { active: 'p1', sessions: [one] },
    })
    await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([old]))
    rerender({ active: 'p2', sessions: [old] })
    act(() => { getListener('agent:sessions-changed')({ projectId: 'p2' }) })
    rerender({ active: 'p1', sessions: [one] })
    expect(mockInvoke).toHaveBeenCalledTimes(2)
    mockInvoke.mockClear()

    // Refreshes do not advance snapshotVersions. This tests write ordering,
    // not the snapshot-version guard exercised in the version tests.
    act(() => {
      getListener('agent:status')({ sessionId: old.id, status: 'waiting' })
    })
    expect(result.current.sessionsByProject.p2).toEqual([{ ...old, status: 'waiting' }])
    await act(async () => { finishRefresh([fresh]) })

    expect(result.current.sessionsByProject.p2).toEqual([fresh])
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
