import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { AgentSession } from '../../../shared/types'
import { useAgentSession } from './useAgentSession'

it('pairs the loaded project with its sessions, including empty replies and reset', async () => {
  const replies = new Map<string, (sessions: AgentSession[]) => void>()
  window.electronAPI = {
    invoke: vi.fn(async (channel: string, projectId: string) => {
      if (channel !== 'agent:sessions') throw new Error(`Unexpected IPC: ${channel}`)
      return new Promise<AgentSession[]>((resolve) => { replies.set(projectId, resolve) })
    }),
    on: vi.fn(() => () => {}), send: vi.fn(), getPathForFile: vi.fn(),
  }
  const sibling: AgentSession = {
    id: 's2', projectId: 'p2', runtimeId: 'codex', branchName: '',
    worktreePath: '/wt/s2', status: 'running', pid: 1, additionalDirs: [],
  }
  const renders: Array<{ loadedProjectId: string | null; sessions: AgentSession[] }> = []
  const { result, rerender } = renderHook(({ projectId }) => {
    const agent = useAgentSession(projectId)
    renders.push({ loadedProjectId: agent.loadedProjectId, sessions: agent.sessions })
    return agent
  }, { initialProps: { projectId: 'p1' as string | null } })
  expect(result.current.loadedProjectId).toBeNull()

  await act(async () => { replies.get('p1')!([]) })
  expect(result.current.loadedProjectId).toBe('p1')
  expect(result.current.sessions).toEqual([])

  rerender({ projectId: 'p2' })
  expect(result.current.loadedProjectId).toBe('p1')
  expect(result.current.sessions).toEqual([])
  await act(async () => { replies.get('p2')!([sibling]) })
  expect(result.current.loadedProjectId).toBe('p2')
  expect(result.current.sessions).toEqual([sibling])

  rerender({ projectId: null })
  expect(result.current.loadedProjectId).toBeNull()
  expect(result.current.sessions).toEqual([])
  expect(renders.every(({ loadedProjectId, sessions }) => (
    loadedProjectId === 'p2' ? sessions[0] === sibling : sessions.length === 0
  ))).toBe(true)
})
