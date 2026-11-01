import { vi } from 'vitest'
import type { AgentSession, Project } from '../../../shared/types'

export const mockInvoke = vi.fn()
export const mockOn = vi.fn(() => vi.fn())

export const projects: Project[] = [
  { id: 'p1', name: 'Project One', path: '/p1', baseBranch: 'main', addedAt: '2026-01-01' },
  { id: 'p2', name: 'Project Two', path: '/p2', baseBranch: 'main', addedAt: '2026-01-02' },
]

export function makeSession(id: string, projectId: string): AgentSession {
  return {
    id,
    projectId,
    runtimeId: 'codex',
    branchName: 'manifold/test',
    worktreePath: `/tmp/${id}`,
    status: 'running',
    pid: 1234,
    taskDescription: 'Test task',
    additionalDirs: [],
  }
}

export function getListener(channel: string): (payload: unknown) => void {
  const match = mockOn.mock.calls.find(
    (call: unknown[]) => call[0] === channel
  ) as [string, (payload: unknown) => void] | undefined
  if (!match) throw new Error(`Missing listener for ${channel}`)
  return match[1]
}

export function installElectronApi(): void {
  vi.clearAllMocks()
  window.electronAPI = {
    invoke: mockInvoke,
    send: vi.fn(),
    on: mockOn,
    getPathForFile: vi.fn(),
  }
}
