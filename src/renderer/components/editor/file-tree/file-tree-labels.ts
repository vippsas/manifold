import type { AgentSession, Project } from '../../../../shared/types'

/**
 * Repo name encoded in a managed worktree path: `…/worktrees/<repo>/<worktree-dir>`.
 * Lets roots keep a repository label even when their project record is gone.
 */
function repoNameFromWorktreePath(rootPath: string): string | undefined {
  const match = rootPath.match(/\/worktrees\/([^/]+)\/[^/]+\/?$/)
  return match?.[1]
}

/**
 * Display names for workspace file-tree roots, keyed by root path.
 *
 * Only populated when the session spans multiple repos (has additional roots),
 * so single-repo trees keep rendering without a header. Each root resolves to
 * its repo's `Project.name`, falling back to the repo segment of a managed
 * worktree path; roots we can't resolve either way are omitted so the file
 * tree falls back to the directory basename.
 */
export function buildRootLabels({
  primaryTreePath,
  additionalRootPaths,
  activeSession,
  projects,
}: {
  primaryTreePath: string | null
  additionalRootPaths: string[]
  activeSession: Pick<AgentSession, 'projectId' | 'workspaceWorktreePaths'> | null
  projects: Pick<Project, 'id' | 'name'>[]
}): Map<string, string> {
  const labels = new Map<string, string>()
  if (additionalRootPaths.length === 0) return labels

  const nameById = new Map(projects.map((p) => [p.id, p.name]))

  const primaryName = (activeSession ? nameById.get(activeSession.projectId) : undefined)
    ?? (primaryTreePath ? repoNameFromWorktreePath(primaryTreePath) : undefined)
  if (primaryTreePath && primaryName) labels.set(primaryTreePath, primaryName)

  const worktreePaths = activeSession?.workspaceWorktreePaths ?? {}
  for (const rootPath of additionalRootPaths) {
    const projectId = Object.entries(worktreePaths).find(([, path]) => path === rootPath)?.[0]
    const name = (projectId ? nameById.get(projectId) : undefined) ?? repoNameFromWorktreePath(rootPath)
    if (name) labels.set(rootPath, name)
  }

  return labels
}
