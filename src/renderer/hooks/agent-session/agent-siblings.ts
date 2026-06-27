import type { AgentSession } from '../../../shared/types'

export const SIBLING_PANEL_PREFIX = 'agent:'

export function siblingPanelId(sessionId: string): string {
  return `${SIBLING_PANEL_PREFIX}${sessionId}`
}

export function isSiblingPanelId(panelId: string): boolean {
  return panelId.startsWith(SIBLING_PANEL_PREFIX)
}

export function parseSiblingSessionId(panelId: string): string | null {
  if (!isSiblingPanelId(panelId)) return null
  return panelId.slice(SIBLING_PANEL_PREFIX.length)
}

export function getSiblingSessions(
  sessions: AgentSession[],
  worktreePath: string | null,
): AgentSession[] {
  if (!worktreePath) return []
  return sessions.filter((s) => s.worktreePath === worktreePath)
}

export function getPrimarySession(
  sessions: AgentSession[],
  worktreePath: string | null,
): AgentSession | null {
  const siblings = getSiblingSessions(sessions, worktreePath)
  return siblings[0] ?? null
}

export function getExtraSiblings(
  sessions: AgentSession[],
  worktreePath: string | null,
): AgentSession[] {
  const siblings = getSiblingSessions(sessions, worktreePath)
  return siblings.slice(1)
}

export function dedupeSessionsByWorktree(sessions: AgentSession[]): AgentSession[] {
  const seen = new Set<string>()
  const result: AgentSession[] = []
  for (const session of sessions) {
    const key = session.worktreePath
    if (!key) {
      result.push(session)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    result.push(session)
  }
  return result
}
