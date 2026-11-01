import type { AgentSession, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

export interface WorkspaceGitContext {
  workspace?: Workspace
  projects: Project[]
  sessionsByProject: Record<string, AgentSession[]>
}

export interface WorkspaceFilesChanged {
  sessionId: string
  source?: string
}

// Renderer paths are absolute POSIX paths; collapse separators and dot segments
// without depending on Node's path module across the preload boundary.
function normalizePath(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return `/${parts.join('/')}`
}

/** undefined means discovery is incomplete: conservatively refresh everything.
 * An empty selection means a known checkout outside this workspace. */
export function affectedWorkspaceProjects(event: WorkspaceFilesChanged, context?: WorkspaceGitContext): string[] | undefined {
  if (!context?.workspace) return undefined
  const session = Object.values(context.sessionsByProject).flat().find((item) => item.id === event.sessionId)
  const path = event.source ?? session?.worktreePath
  if (!path) return undefined
  const normalized = normalizePath(path)
  return context.workspace.projectIds.filter((id) => {
    const project = context.projects.find((item) => item.id === id)
    const checkout = context.workspace?.worktreePaths?.[id] ?? project?.path
    return [project?.path, checkout].some((candidate) => candidate !== undefined && normalizePath(candidate) === normalized)
  })
}
