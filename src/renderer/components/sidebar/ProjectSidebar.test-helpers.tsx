import { vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { ProjectSidebar, type ProjectSidebarProps } from './ProjectSidebar'
import type { Workspace } from '../../../shared/workspace-types'
import type { Project, AgentSession } from '../../../shared/types'

export const mockInvoke = vi.fn()

export function installLocalStorage(): void {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
  }
  vi.stubGlobal('localStorage', storage)
}

export function installElectronApi(): void {
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
}

export const sampleProjects: Project[] = [
  { id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p2', name: 'Beta', path: '/repos/beta', baseBranch: 'main', addedAt: '2024-01-02' },
]

// Every repo lives in a workspace, so the default fixture is the ordinary shape:
// two one-folder workspaces. Named apart from their folders so assertions can tell
// a workspace row from the folder row beneath it.
export const sampleWorkspaces: Workspace[] = [
  { id: 'w1', name: 'alpha-space', projectIds: ['p1'], createdAt: '2024-01-01' },
  { id: 'w2', name: 'beta-space', projectIds: ['p2'], createdAt: '2024-01-02' },
]

export const sampleSessions: AgentSession[] = [
  { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'alpha/oslo', worktreePath: '/wt1', status: 'running', pid: 1, additionalDirs: [] },
  { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'alpha/bergen', worktreePath: '/wt2', status: 'waiting', pid: 2, additionalDirs: [] },
]

export function renderSidebar(overrides: Record<string, unknown> = {}) {
  const props = {
    projects: sampleProjects,
    activeProjectId: 'p1',
    outputtingSessionIds: new Set<string>(),
    workspaces: sampleWorkspaces,
    activeWorkspaceId: 'w1',
    sessionsByWorkspace: { w1: sampleSessions, w2: [] },
    onNewProject: vi.fn(),
    onNewWorkspace: vi.fn(),
    onSelectWorkspace: vi.fn(),
    onRenameWorkspace: vi.fn(),
    onRemoveWorkspace: vi.fn(async () => undefined),
    onCopyWorkspace: vi.fn(),
    onSelectWorkspaceRepo: vi.fn(),
    onAddProjectToWorkspace: vi.fn(),
    onRemoveProjectFromWorkspace: vi.fn(),
    drafts: [],
    activeDraftId: null,
    onSelectDraft: vi.fn(),
    onDiscardDraft: vi.fn(),
    ...overrides,
  }

  return { ...render(<ProjectSidebar {...props as unknown as ProjectSidebarProps} />), props }
}
