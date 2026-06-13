import type { AgentSession } from '../shared/types'

export function filterStandaloneProjectSessions<T extends Pick<AgentSession, 'id' | 'worktreePath' | 'workspaceId'>>(
  sessions: readonly T[],
): T[] {
  // Workspace agents are shown under their workspace, not the normal project list.
  return sessions.filter((session) => !session.workspaceId)
}

// A repo belongs in "With agents" only while an agent is still active. Finished
// (done) and errored agents are terminal, so a repo whose agents have all ended
// falls back to "Repositories" rather than lingering with no active work (#708).
export function filterActiveStandaloneProjectSessions<T extends Pick<AgentSession, 'id' | 'worktreePath' | 'workspaceId' | 'status'>>(
  sessions: readonly T[],
): T[] {
  return filterStandaloneProjectSessions(sessions).filter(
    (session) => session.status !== 'done' && session.status !== 'error',
  )
}
