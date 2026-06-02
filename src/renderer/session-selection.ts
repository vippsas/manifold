import type { AgentSession } from '../shared/types'

export function filterStandaloneProjectSessions<T extends Pick<AgentSession, 'id' | 'worktreePath' | 'workspaceId'>>(
  sessions: readonly T[],
): T[] {
  // Workspace agents are shown under their workspace, not the normal project list.
  return sessions.filter((session) => !session.workspaceId)
}
