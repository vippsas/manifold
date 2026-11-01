import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSession } from '../../../shared/types'
import { useAgentSession } from './useAgentSession'
import { useAutoResume } from './useAutoResume'

const dormant: AgentSession = {
  id: 'a', projectId: 'p1', runtimeId: 'codex', branchName: '',
  worktreePath: '/wt/a', status: 'done', pid: null, additionalDirs: [],
}
const running: AgentSession = { ...dormant, id: 'b', status: 'running', pid: 42 }
const invoke = vi.fn()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  invoke.mockReset()
  window.electronAPI = {
    invoke, on: vi.fn(() => () => {}), send: vi.fn(), getPathForFile: vi.fn(),
  }
})

describe('useAutoResume', () => {
  it.each([
    { name: 'no selection', id: null, sessions: [dormant] },
    { name: 'missing session', id: 'missing', sessions: [dormant] },
    { name: 'running status', id: 'a', sessions: [{ ...dormant, status: 'running' as const }] },
    { name: 'existing pid', id: 'a', sessions: [{ ...dormant, pid: 42 }] },
    { name: 'missing runtime', id: 'a', sessions: [{ ...dormant, runtimeId: '' }] },
    { name: 'chat mode', id: 'a', sessions: [{ ...dormant, nonInteractive: true }] },
    { name: 'error status', id: 'a', sessions: [{ ...dormant, status: 'error' as const }] },
  ])('does not resume with $name', ({ id, sessions }) => {
    renderHook(() => useAutoResume(id, sessions, vi.fn()))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('resumes once across StrictMode effect replay and subsequent renders', async () => {
    const reply = deferred<AgentSession>()
    invoke.mockReturnValue(reply.promise)
    const setSessions = vi.fn()
    const { rerender } = renderHook(
      ({ sessions }) => useAutoResume('a', sessions, setSessions),
      { initialProps: { sessions: [dormant] }, wrapper: StrictMode },
    )
    rerender({ sessions: [{ ...dormant }] })
    expect(invoke.mock.calls).toEqual([['agent:resume', 'a', 'codex']])

    const resumed = { ...dormant, status: 'running' as const, pid: 42 }
    await act(async () => { reply.resolve(resumed) })
    const update = setSessions.mock.calls[0][0] as (prev: AgentSession[]) => AgentSession[]
    expect(update([dormant, running])).toEqual([resumed, running])
    rerender({ sessions: [{ ...dormant }] })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('does not restart a selected running agent when it later exits', () => {
    const setSessions = vi.fn()
    const { rerender } = renderHook(
      ({ session }) => useAutoResume('a', [session], setSessions),
      { initialProps: { session: { ...dormant, status: 'running' as const, pid: 42 } as AgentSession } },
    )
    rerender({ session: dormant })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not resume a reselected session while its earlier request is in flight', async () => {
    const reply = deferred<AgentSession>()
    invoke.mockReturnValue(reply.promise)
    const setSessions = vi.fn()
    const { rerender } = renderHook(
      ({ id }) => useAutoResume(id, [dormant, running], setSessions),
      { initialProps: { id: 'a' } },
    )
    rerender({ id: 'b' })
    rerender({ id: 'a' })
    expect(invoke).toHaveBeenCalledTimes(1)
    await act(async () => { reply.resolve({ ...dormant, status: 'running', pid: 42 }) })
    rerender({ id: 'a' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('leaves a failed resume dormant until a new selection', async () => {
    const failed = deferred<AgentSession>()
    const retried = deferred<AgentSession>()
    invoke.mockReturnValueOnce(failed.promise).mockReturnValueOnce(retried.promise)
    const setSessions = vi.fn()
    const { rerender } = renderHook(
      ({ id }) => useAutoResume(id, [{ ...dormant }], setSessions),
      { initialProps: { id: 'a' as string | null } },
    )
    await act(async () => { failed.reject(new Error('resume failed')) })
    rerender({ id: 'a' })
    expect(setSessions).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledTimes(1)
    rerender({ id: null })
    rerender({ id: 'a' })
    expect(invoke).toHaveBeenCalledTimes(2)
    await act(async () => { retried.resolve({ ...dormant, status: 'running', pid: 42 }) })
  })

  it('resumes a same-repo selection once despite sessions-changed resyncs', async () => {
    const reply = deferred<AgentSession>()
    const listeners = new Map<string, (...args: unknown[]) => void>()
    window.electronAPI.on = (channel, listener) => {
      listeners.set(channel, listener)
      return () => { listeners.delete(channel) }
    }
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'agent:sessions') return [running, dormant].map((s) => ({ ...s }))
      if (channel === 'agent:resume') return reply.promise
      throw new Error(`Unexpected IPC: ${channel}`)
    })
    const { result, rerender } = renderHook(() => useAgentSession('p1'))
    await waitFor(() => expect(result.current.activeSessionId).toBe('b'))
    expect(invoke.mock.calls.filter(([channel]) => channel === 'agent:resume')).toHaveLength(0)
    act(() => { result.current.setActiveSession('a') })
    const resync = async (): Promise<void> => {
      await act(async () => { listeners.get('agent:sessions-changed')!({ projectId: 'p1' }) })
    }
    await resync()
    expect(invoke.mock.calls.filter(([channel]) => channel === 'agent:resume'))
      .toEqual([['agent:resume', 'a', 'codex']])

    await act(async () => { reply.resolve({ ...dormant, status: 'running', pid: 42 }) })
    expect(result.current.activeSession?.pid).toBe(42)
    // Even a stale dormant list after completion must not repeat the resume.
    await resync()
    rerender()
    expect(result.current.activeSession?.pid).toBeNull()
    expect(invoke.mock.calls.filter(([channel]) => channel === 'agent:resume')).toHaveLength(1)
  })
})
