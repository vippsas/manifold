import { vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { ProjectSidebar } from './ProjectSidebar'
import { RepositoriesPanel } from './RepositoriesPanel'
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

export const sampleSessions: AgentSession[] = [
  { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'alpha/oslo', worktreePath: '/wt1', status: 'running', pid: 1, additionalDirs: [] },
  { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'alpha/bergen', worktreePath: '/wt2', status: 'waiting', pid: 2, additionalDirs: [] },
]

/**
 * Renders the repositories/sessions surface (repos, workspaces, agents, drafts,
 * actions). This content moved out of the sidebar into the title-bar switcher, so
 * the repository-behavior tests exercise `RepositoriesPanel` directly.
 */
export function renderSidebar(overrides = {}) {
  const defaultProps = {
    projects: sampleProjects,
    activeProjectId: 'p1',
    allProjectSessions: { p1: sampleSessions, p2: [] },
    activeSessionId: 's1',
    outputtingSessionIds: new Set<string>(),
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onRemoveProject: vi.fn(),
    onUpdateProject: vi.fn(),
    onRenameAgent: vi.fn(),
    onRequestDeleteAgent: vi.fn(),
    onNewAgent: vi.fn(),
    onNewProject: vi.fn(),
    onNewWorkspace: vi.fn(),
    fetchingProjectId: null,
    lastFetchedProjectId: null,
    fetchResult: null,
    fetchError: null,
    onFetchProject: vi.fn(),
    drafts: [],
    activeDraftId: null,
    onSelectDraft: vi.fn(),
    onDiscardDraft: vi.fn(),
    ...overrides,
  }

  return { ...render(<RepositoriesPanel {...defaultProps} />), props: defaultProps }
}

/** Renders the slim sidebar activity bar (Explorer + Source Control + Open Folder). */
export function renderProjectSidebar(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    onOpenFolder: vi.fn(),
    ...overrides,
  }
  return { ...render(<ProjectSidebar {...defaultProps} />), props: defaultProps }
}
