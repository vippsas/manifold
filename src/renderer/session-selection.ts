import type { AgentSession } from '../shared/types'
import type { Superagent } from '../shared/superagent-types'

export interface SessionSelectionOptions {
  preserveSuperagent?: boolean
}

export function shouldPreserveSuperagentSelection(
  activeSuperagent: Pick<Superagent, 'fleetProjectIds'> | null,
  projectId: string,
  options?: SessionSelectionOptions,
): boolean {
  if (!options?.preserveSuperagent) return false
  if (!activeSuperagent) return false
  return activeSuperagent.fleetProjectIds.includes(projectId)
}

export function collectSuperagentChildSessionIds(
  superagents: readonly Pick<Superagent, 'childSessionIds'>[] | undefined,
): Set<string> {
  const sessionIds = new Set<string>()
  for (const superagent of superagents ?? []) {
    for (const sessionId of superagent.childSessionIds) {
      sessionIds.add(sessionId)
    }
  }
  return sessionIds
}

export function collectSuperagentFleetWorktreePaths(
  superagents: readonly Pick<Superagent, 'fleetWorktreePaths'>[] | undefined,
): Set<string> {
  const worktreePaths = new Set<string>()
  for (const superagent of superagents ?? []) {
    for (const worktreePath of Object.values(superagent.fleetWorktreePaths ?? {})) {
      worktreePaths.add(worktreePath)
    }
  }
  return worktreePaths
}

export function collectSuperagentFleetProjectIds(
  superagents: readonly Pick<Superagent, 'fleetProjectIds'>[] | undefined,
): Set<string> {
  const projectIds = new Set<string>()
  for (const superagent of superagents ?? []) {
    for (const projectId of superagent.fleetProjectIds) {
      projectIds.add(projectId)
    }
  }
  return projectIds
}

export function filterStandaloneProjectSessions<T extends Pick<AgentSession, 'id' | 'parentSuperagentId' | 'worktreePath'>>(
  sessions: readonly T[],
  superagentChildSessionIds: ReadonlySet<string>,
  superagentFleetWorktreePaths?: ReadonlySet<string>,
): T[] {
  return sessions.filter((session) => (
    !session.parentSuperagentId
    && !superagentChildSessionIds.has(session.id)
    && !superagentFleetWorktreePaths?.has(session.worktreePath)
  ))
}
