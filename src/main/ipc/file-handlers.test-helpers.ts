import { vi } from 'vitest'
import type { AgentSession, FileTreeNode } from '../../shared/types'
import type { IpcDependencies } from './types'

export function makeSession(worktreePath: string, additionalDirs: string[] = []): AgentSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'codex',
    branchName: 'main',
    worktreePath,
    status: 'running',
    pid: 1,
    additionalDirs,
  }
}

export function makeDeps(
  session: AgentSession,
  tree: FileTreeNode,
  openFolders: {
    projectPaths?: string[]
    otherSessions?: AgentSession[]
    workspaceWorktreePaths?: Record<string, string>
  } = {},
): IpcDependencies {
  const projects = (openFolders.projectPaths ?? []).map((path, index) => ({ id: `proj-${index}`, path }))
  const workspaces = openFolders.workspaceWorktreePaths
    ? [{ id: 'w1', name: 'w1', projectIds: [], createdAt: '', worktreePaths: openFolders.workspaceWorktreePaths }]
    : []
  return {
    sessionManager: {
      getSession: vi.fn(() => session),
      listSessions: vi.fn(() => [session, ...(openFolders.otherSessions ?? [])]),
    },
    workspaceManager: { list: vi.fn(() => workspaces), get: vi.fn((id: string) => workspaces.find((w) => w.id === id)) },
    projectRegistry: { getProject: vi.fn(), listProjects: vi.fn(() => projects) },
    fileWatcher: {
      getFileTree: vi.fn(() => tree),
      notifyTreeChanged: vi.fn(),
      readFile: vi.fn((path: string) => `contents of ${path}`),
    },
  } as unknown as IpcDependencies
}
