import type { AgentSession } from '../../../shared/types'

export type AddMode = 'new-slot' | 'reuse-session'

export interface ProjectSelectionState {
  loading: boolean
  standaloneCount: number
  compatibleSessions: AgentSession[]
  mode: AddMode
  reuseSessionId: string | null
}

export function pluralizeAgents(count: number): string {
  return count === 1 ? 'agent' : 'agents'
}

export function dedupeSessionsByWorktree(sessions: AgentSession[]): AgentSession[] {
  const seen = new Set<string>()
  return sessions.filter((session) => {
    const key = `${session.worktreePath}:${session.branchName}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
