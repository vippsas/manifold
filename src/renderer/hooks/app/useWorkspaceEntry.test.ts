import { StrictMode, useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSession, ResolvedFavorite } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { useAgentSession } from '../agent-session/useAgentSession'
import { useWorkspaceEntry } from './useWorkspaceEntry'

const session = (id: string, projectId: string): AgentSession => ({
  id, projectId, runtimeId: 'codex', branchName: '', worktreePath: `/wt/${id}`,
  status: 'running', pid: 1, additionalDirs: [],
})
const a = session('a', 'p1')
const b = session('b', 'p1')
const c = session('c', 'p2')
const d = session('d', 'p3')
const workspaces: Workspace[] = [
  { id: 'w1', name: 'One', projectIds: ['p1', 'p3'], createdAt: '' },
  { id: 'w2', name: 'Two', projectIds: ['p2'], createdAt: '' },
  { id: 'w3', name: 'Shared folder', projectIds: ['p1'], createdAt: '' },
]
const favorites: ResolvedFavorite[] = [{ id: 'w1', name: 'One', kind: 'multi' }]
const initialSessions = { w1: [a, b, d], w2: [c], w3: [a, b] }
let listed: AgentSession[]

function useHarness(sessionsByWorkspace = initialSessions) {
  const [activeProjectId, setActiveProject] = useState<string | null>('p1')
  const [activeWorkspaceId, selectWorkspace] = useState<string | null>('w1')
  const agent = useAgentSession(activeProjectId)
  const entry = useWorkspaceEntry({
    workspaces, favorites, sessionsByWorkspace, activeProjectId, activeWorkspaceId,
    activeSessionId: agent.activeSessionId,
    selectWorkspace, selectSession: agent.setActiveSession, setActiveProject,
  })
  return { ...entry, activeWorkspaceId, activeProjectId, agent }
}

beforeEach(() => {
  listed = [a, b, c, d]
  window.electronAPI = {
    invoke: vi.fn(async (channel: string, projectId: string) => {
      if (channel === 'agent:sessions') return listed.filter((s) => s.projectId === projectId)
      throw new Error(`Unexpected IPC: ${channel}`)
    }),
    on: vi.fn(() => () => {}), send: vi.fn(), getPathForFile: vi.fn(),
  }
})

describe('useWorkspaceEntry', () => {
  it('remembers a tab selection before a same-batch workspace/project switch (#945)', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper: StrictMode })
    await waitFor(() => expect(result.current.agent.activeSessionId).toBe('a'))

    act(() => {
      result.current.setActiveSession('b')
      result.current.enterWorkspace('w2')
    })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([c]))
    expect(result.current.agent.activeSessionId).toBe('c')

    act(() => { result.current.enterWorkspace('w1') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([a, b]))
    expect(result.current.agent.activeSessionId).toBe('b')
  })

  it('updates memory on every tab click and keeps workspaces sharing a repo separate', async () => {
    const { result } = renderHook(() => useHarness())
    await waitFor(() => expect(result.current.agent.activeSessionId).toBe('a'))

    act(() => { result.current.setActiveSession('b') })
    act(() => { result.current.enterWorkspace('w2') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([c]))
    act(() => { result.current.enterWorkspace('w3') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([a, b]))
    expect(result.current.agent.activeSessionId).toBe('a')

    act(() => { result.current.enterWorkspace('w1') })
    expect(result.current.agent.activeSessionId).toBe('b')
    act(() => { result.current.setActiveSession('a') })
    act(() => { result.current.setActiveSession('b') })
    act(() => { result.current.enterWorkspace('w2') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([c]))
    act(() => { result.current.enterWorkspace('w3') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([a, b]))
    expect(result.current.agent.activeSessionId).toBe('a')
  })

  it('pairs the incoming workspace with its repo after a same-batch cross-repo tab selection', async () => {
    const { result } = renderHook(() => useHarness())
    await waitFor(() => expect(result.current.agent.activeSessionId).toBe('a'))
    act(() => {
      result.current.setActiveSession('d')
      result.current.enterWorkspace('w3')
    })
    expect(result.current.activeWorkspaceId).toBe('w3')
    expect(result.current.activeProjectId).toBe('p1')
    expect(result.current.agent.activeSessionId).toBe('a')

    act(() => { result.current.enterWorkspace('w1') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([d]))
    expect(result.current.agent.activeSessionId).toBe('d')
  })

  it.each(['sidebar', 'favorite', 'shortcut'])('restores a sibling in a different repo via %s', async (route) => {
    const { result } = renderHook(() => useHarness())
    await waitFor(() => expect(result.current.agent.activeSessionId).toBe('a'))
    act(() => { result.current.setActiveSession('d') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([d]))
    expect(result.current.activeProjectId).toBe('p3')

    act(() => { result.current.enterWorkspace('w2') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([c]))
    act(() => {
      if (route === 'sidebar') result.current.enterWorkspace('w1')
      else if (route === 'favorite') result.current.activateFavorite(favorites[0])
      else result.current.jumpToFavorite(0)
    })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([d]))
    expect(result.current.agent.activeSessionId).toBe('d')
    expect(result.current.activeProjectId).toBe('p3')
  })

  it('uses the primary when the remembered tab was deleted', async () => {
    const { result, rerender } = renderHook(({ rows }) => useHarness(rows), {
      initialProps: { rows: initialSessions },
    })
    await waitFor(() => expect(result.current.agent.activeSessionId).toBe('a'))
    act(() => { result.current.setActiveSession('b') })
    act(() => { result.current.enterWorkspace('w2') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([c]))
    listed = [a, c, d]
    rerender({ rows: { ...initialSessions, w1: [a, d] } })

    act(() => { result.current.enterWorkspace('w1') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([a]))
    expect(result.current.agent.activeSessionId).toBe('a')
  })

  it('keeps the empty view when every remembered workspace agent is gone', async () => {
    const { result, rerender } = renderHook(({ rows }) => useHarness(rows), {
      initialProps: { rows: initialSessions },
    })
    await waitFor(() => expect(result.current.agent.activeSessionId).toBe('a'))
    act(() => { result.current.setActiveSession('b') })
    act(() => { result.current.enterWorkspace('w2') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([c]))
    rerender({ rows: { ...initialSessions, w1: [] } })

    act(() => { result.current.enterWorkspace('w1') })
    await waitFor(() => expect(result.current.agent.sessions).toEqual([a, b]))
    expect(result.current.agent.activeSessionId).toBeNull()
  })
})
