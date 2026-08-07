import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import { useAppOverlays } from './useAppOverlays'

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/voss',
    worktreePath: '/wt',
    status: 'running',
    pid: 1,
    additionalDirs: [],
    ...overrides,
  } as AgentSession
}

function setup() {
  const deleteAgent = vi.fn(async () => undefined)
  const removeSession = vi.fn()
  const rendered = renderHook(() => useAppOverlays(
    vi.fn(async () => undefined),
    vi.fn(async () => undefined),
    deleteAgent,
    removeSession,
    vi.fn(async () => undefined),
    vi.fn(),
    vi.fn(),
    'proj-1',
  ))
  return { ...rendered, deleteAgent, removeSession }
}

// requestDeleteAgent is the one chokepoint every delete entry point funnels
// through, so gating it here is what makes the lock hold everywhere.
describe('useAppOverlays delete gate', () => {
  beforeEach(() => {
    window.electronAPI = { invoke: vi.fn(async () => '0.0.0-test') } as unknown as typeof window.electronAPI
  })

  it('opens the confirmation for an unlocked agent', () => {
    const { result } = setup()

    act(() => result.current.requestDeleteAgent(makeSession(), '/repos/alpha'))

    expect(result.current.pendingDelete).toEqual({ session: makeSession(), projectPath: '/repos/alpha' })
  })

  it('never opens the destructive dialog for a locked agent', () => {
    const { result } = setup()

    act(() => result.current.requestDeleteAgent(makeSession({ locked: true }), '/repos/alpha'))

    expect(result.current.pendingDelete).toBeNull()
  })

  it('deletes the agent once the confirmation is accepted', async () => {
    const { result, deleteAgent, removeSession } = setup()

    act(() => result.current.requestDeleteAgent(makeSession(), '/repos/alpha'))
    await act(async () => { await result.current.confirmDeleteAgent() })

    expect(deleteAgent).toHaveBeenCalledWith('sess-1')
    expect(removeSession).toHaveBeenCalledWith('sess-1')
    expect(result.current.pendingDelete).toBeNull()
  })
})
