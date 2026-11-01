import type { WorkspaceRepoStatus } from '../../shared/workspace-types'
import { isGitProject } from '../../shared/project-kind'
import { gitExec } from '../git/git-exec'
import { gitStatus } from '../fs/file-watcher-utils'
import { parseWorkspaceStatus } from '../git/porcelain-status'
import type { IpcDependencies } from './types'

type Selection = Set<string> | null // null means every repo
interface Flight {
  promise: Promise<WorkspaceRepoStatus[]>
  pending?: Selection
}

/** One status round per workspace, shared by every IPC consumer. Requests that
 * arrive during a round invalidate it once, unioning any affected repo IDs. */
export function createWorkspaceStatusReader({ workspaceManager, projectRegistry }: Pick<IpcDependencies, 'workspaceManager' | 'projectRegistry'>) {
  const flights = new Map<string, Flight>()

  async function read(workspaceId: string, selection: Selection): Promise<WorkspaceRepoStatus[]> {
    const workspace = workspaceManager.get(workspaceId)
    if (!workspace) return []
    const statuses = await Promise.all(workspace.projectIds.map(async (projectId) => {
      const project = projectRegistry.getProject(projectId)
      if (!project || !isGitProject(project) || (selection && !selection.has(projectId))) return null
      const checkoutPath = workspace.worktreePaths?.[projectId] ?? project.path
      const [branch, groups, upstreamAheadBehind] = await Promise.all([
        gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], checkoutPath).then((out) => out.trim()).catch(() => ''),
        gitStatus(checkoutPath).then(parseWorkspaceStatus).catch(() => ({ staged: [], unstaged: [], untracked: [] })),
        gitExec(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], checkoutPath)
          .then((out) => {
            const [behind, ahead] = out.trim().split(/\s+/).map(Number)
            if (!Number.isFinite(behind) || !Number.isFinite(ahead)) return undefined
            return { behind, ahead }
          })
          .catch(() => undefined),
      ])
      return {
        projectId, projectName: project.name, checkoutPath, branch,
        ...(upstreamAheadBehind ? { upstreamAheadBehind } : {}),
        ...groups,
      }
    }))
    return statuses.filter((status): status is WorkspaceRepoStatus => status !== null)
  }

  return (workspaceId: string, projectIds?: string[]): Promise<WorkspaceRepoStatus[]> => {
    const selection = projectIds ? new Set(projectIds) : null
    const existing = flights.get(workspaceId)
    if (existing) {
      existing.pending = existing.pending === null || selection === null
        ? null : new Set([...(existing.pending ?? []), ...selection])
      return existing.promise
    }

    const flight: Flight = { promise: Promise.resolve([]), pending: selection }
    flights.set(workspaceId, flight)
    // Batch consumers arriving together before launching Git. Once a round
    // starts, further calls invalidate it and request one trailing round.
    flight.promise = Promise.resolve().then(async () => {
      let next: Selection = flight.pending ?? null
      let result: WorkspaceRepoStatus[] = []
      try {
        do {
          flight.pending = undefined
          const rows = await read(workspaceId, next)
          result = next === null ? rows : [...new Map([...result, ...rows].map((row) => [row.projectId, row])).values()]
          if (flight.pending === undefined) return result
          next = flight.pending
        } while (true)
      } finally {
        flights.delete(workspaceId)
      }
    })
    return flight.promise
  }
}
