import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStatusNotification } from './useStatusNotification'
import type { AgentSession } from '../../shared/types'

function makeSession(id: string, status: AgentSession['status']): AgentSession {
  return {
    id,
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/test',
    worktreePath: '/tmp/test',
    status,
    pid: status === 'running' ? 1234 : null,
  }
}

describe('useStatusNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
    } as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not beep when status stays running', () => {
    const sessions = [makeSession('s1', 'running')]
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      { initialProps: { s: sessions, enabled: true } }
    )
    rerender({ s: [makeSession('s1', 'running')], enabled: true })
    vi.advanceTimersByTime(3000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('beeps after 2.5s when status leaves running', () => {
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      { initialProps: { s: [makeSession('s1', 'running')], enabled: true } }
    )
    rerender({ s: [makeSession('s1', 'waiting')], enabled: true })
    vi.advanceTimersByTime(2500)
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('app:beep')
  })

  it('cancels beep if status returns to running within window', () => {
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      { initialProps: { s: [makeSession('s1', 'running')], enabled: true } }
    )
    rerender({ s: [makeSession('s1', 'waiting')], enabled: true })
    vi.advanceTimersByTime(1000)
    rerender({ s: [makeSession('s1', 'running')], enabled: true })
    vi.advanceTimersByTime(2000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('does not beep when disabled', () => {
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      { initialProps: { s: [makeSession('s1', 'running')], enabled: false } }
    )
    rerender({ s: [makeSession('s1', 'waiting')], enabled: false })
    vi.advanceTimersByTime(3000)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('app:beep')
  })

  it('tracks multiple sessions independently', () => {
    const { rerender } = renderHook(
      ({ s, enabled }) => useStatusNotification(s, enabled),
      {
        initialProps: {
          s: [makeSession('s1', 'running'), makeSession('s2', 'running')],
          enabled: true,
        },
      }
    )
    rerender({
      s: [makeSession('s1', 'waiting'), makeSession('s2', 'running')],
      enabled: true,
    })
    vi.advanceTimersByTime(2500)
    expect(window.electronAPI.invoke).toHaveBeenCalledTimes(1)
  })
})
