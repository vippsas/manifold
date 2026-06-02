import type { AgentSession } from '../shared/types'

export function filterStandaloneProjectSessions<T extends Pick<AgentSession, 'id' | 'worktreePath'>>(
  sessions: readonly T[],
): T[] {
  return [...sessions]
}
