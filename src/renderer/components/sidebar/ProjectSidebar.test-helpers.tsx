import { vi } from 'vitest'
import { render, within } from '@testing-library/react'
import React from 'react'
import { ProjectSidebar, type ProjectSidebarProps } from './ProjectSidebar'
import { __resetFoldStateForTests } from './sidebar-fold-state'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import type { DockAppState } from '../editor/editor-shell/dock-panel-types'
import type { Workspace } from '../../../shared/workspace-types'
import type { Project, AgentSession } from '../../../shared/types'

export const mockInvoke = vi.fn()

export function installLocalStorage(): void {
  __resetFoldStateForTests()
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

/** The label of the folder row named `name` inside an expanded workspace card,
 *  or null when no card is showing it. Scoped to the folder rows because a
 *  workspace row now carries its repo's name too, as a dimmed prefix, so a bare
 *  getByText would match both. */
export function folderLabel(name: string): HTMLElement | null {
  for (const row of document.querySelectorAll<HTMLElement>('.sidebar-repo-row')) {
    const label = within(row).queryByText(name)
    if (label) return label
  }
  return null
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

// Both done: the dot and the Working-now section follow agent *status* now, so a
// live default would put every workspace name on screen twice. Tests that need
// a live agent spread one of these with `status: 'running' | 'waiting'`.
export const sampleSessions: AgentSession[] = [
  { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'alpha/oslo', worktreePath: '/wt1', status: 'done', pid: 1, additionalDirs: [] },
  { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'alpha/bergen', worktreePath: '/wt2', status: 'done', pid: 2, additionalDirs: [] },
]

/** Seeds the fold store so every repo group renders expanded.
 *
 *  Repos ship **collapsed**, so a freshly rendered sidebar shows headers and no
 *  workspace rows at all. Most tests here are about the rows, not the fold
 *  default — they would each have to click a header open before they could say
 *  anything. This puts them straight at "the groups are open"; the default
 *  itself is pinned where it belongs, in `RepoGroup.test.tsx` and
 *  `sidebar-fold-state.test.ts`. Pass `seedGroupsOpen: false` to opt out. */
export function openAllGroups(projectIds: readonly string[]): void {
  localStorage.setItem(
    'manifold.sidebar.openWorkspaces.v2',
    JSON.stringify(projectIds.map((id) => `repo:${id}`)),
  )
}

/** Renders the sidebar inside a DockStateContext when `dock` is supplied. The
 *  cross-cutting row actions (favorites) read that context rather than props, so
 *  only the tests that exercise them need to provide it. */
export function renderSidebar(overrides: Record<string, unknown> = {}, dock?: Partial<DockAppState>) {
  const wrap = (ui: React.ReactElement): React.ReactElement =>
    dock
      ? <DockStateContext.Provider value={dock as DockAppState}>{ui}</DockStateContext.Provider>
      : ui
  const { seedGroupsOpen = true, ...propOverrides } = overrides as { seedGroupsOpen?: boolean }
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
    ...propOverrides,
  }

  if (seedGroupsOpen) {
    const projects = (props.projects ?? []) as { id: string }[]
    const workspaces = (props.workspaces ?? []) as { id: string; projectIds: string[] }[]
    // Lone groups (primary repo unregistered) are keyed by workspace, not repo.
    const known = new Set(projects.map((p) => p.id))
    const lone = workspaces.filter((w) => !known.has(w.projectIds[0])).map((w) => `lone:${w.id}`)
    openAllGroups([...projects.map((p) => p.id), ...lone])
  }

  const view = render(wrap(<ProjectSidebar {...props as unknown as ProjectSidebarProps} />))

  // Re-renders the same sidebar with some props changed, for the cases that only
  // show up on a change — switching the active workspace, say — rather than on a
  // fresh mount.
  const setProps = (next: Record<string, unknown>): void => {
    view.rerender(wrap(<ProjectSidebar {...{ ...props, ...next } as unknown as ProjectSidebarProps} />))
  }

  return { ...view, props, setProps }
}
