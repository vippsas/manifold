import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import { useAgentSession } from './useAgentSession'

const mockInvoke = vi.fn()

function makeSession(id: string, projectId: string, displayName?: string): AgentSession {
  return {
    id, projectId, runtimeId: 'codex', branchName: 'manifold/test', worktreePath: `/tmp/${id}`,
    status: 'running', pid: 1, additionalDirs: [], ...(displayName ? { displayName } : {}),
  }
}

function spawnedOptions(): Record<string, unknown>[] {
  return mockInvoke.mock.calls.filter((c) => c[0] === 'agent:spawn').map((c) => c[1] as Record<string, unknown>)
}

beforeEach(() => {
  vi.clearAllMocks()
  window.electronAPI = { invoke: mockInvoke, send: vi.fn(), on: vi.fn(() => vi.fn()), getPathForFile: vi.fn() }
})

// Every project-scoped spawn — opening a project, creating one, promoting a draft
// chat — goes through this hook's `spawnAgent`, so it is where the default name is applied.
describe('useAgentSession spawnAgent default name', () => {
  it('names an unnamed spawn, numbering past the agents already open in the project', async () => {
    const existing = makeSession('s1', 'p1', 'Codex')
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'agent:sessions') return Promise.resolve([existing])
      if (channel === 'agent:spawn') return Promise.resolve(makeSession('s2', 'p1', 'Codex 2'))
      return Promise.resolve(undefined)
    })
    const { result } = renderHook(() => useAgentSession('p1'))
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))

    await act(async () => { await result.current.spawnAgent({ projectId: 'p1', runtimeId: 'codex', prompt: '' }) })

    expect(spawnedOptions()[0]).toMatchObject({ runtimeId: 'codex', displayName: 'Codex 2' })
  })

  it('leaves a name the caller supplied alone', async () => {
    mockInvoke.mockImplementation((channel: string) =>
      Promise.resolve(channel === 'agent:sessions' ? [] : makeSession('s1', 'p1', 'Mine')))
    const { result } = renderHook(() => useAgentSession('p1'))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('agent:sessions', 'p1'))

    await act(async () => { await result.current.spawnAgent({ projectId: 'p1', runtimeId: 'codex', prompt: '', displayName: 'Mine' }) })

    expect(spawnedOptions()[0].displayName).toBe('Mine')
  })

  it('gives the first agent of another project the plain runtime name', async () => {
    mockInvoke.mockImplementation((channel: string) =>
      Promise.resolve(channel === 'agent:sessions' ? [makeSession('s1', 'p1', 'Codex')] : makeSession('x', 'p2')))
    const { result } = renderHook(() => useAgentSession('p1'))
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))

    await act(async () => { await result.current.spawnAgent({ projectId: 'p2', runtimeId: 'codex', prompt: '' }) })

    expect(spawnedOptions()[0].displayName).toBe('Codex')
  })
})
