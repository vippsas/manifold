import type { SearchContextResponse, SearchMode, SearchScopeKind } from '../../../shared/search-types'

export interface SearchScopeOption {
  value: SearchScopeKind
  label: string
}

export function getActiveContextSession(
  context: SearchContextResponse | null,
  fallbackSessionId: string | null,
) {
  const activeSessionId = context?.activeSessionId ?? fallbackSessionId
  if (!activeSessionId) return null
  return context?.sessions.find((session) => session.sessionId === activeSessionId) ?? null
}

export function getScopeOptions(
  sessionCount: number,
  additionalDirCount: number,
): SearchScopeOption[] {
  const options: SearchScopeOption[] = [
    { value: 'active-session', label: 'Active Agent' },
  ]

  if (additionalDirCount > 0) {
    options.push({ value: 'visible-roots', label: 'Visible Roots' })
  }
  if (sessionCount > 1) {
    options.push({ value: 'all-project-sessions', label: 'All Agents' })
  }

  return options
}

export function getInfoText(params: {
  context: SearchContextResponse | null
  mode: SearchMode
  scopeKind: SearchScopeKind
  additionalDirCount: number
  hasActiveSession: boolean
}): string | null {
  const { context, mode, scopeKind, additionalDirCount, hasActiveSession } = params
  if (!context) return null

  const agentCount = context.sessions.length
  if (mode === 'memory') {
    return `${agentCount} agent${agentCount === 1 ? '' : 's'} in project memory context`
  }

  if (scopeKind === 'visible-roots') {
    const totalRootCount = additionalDirCount + (hasActiveSession ? 1 : 0)
    return `${totalRootCount} visible root${totalRootCount === 1 ? '' : 's'} in active agent scope`
  }

  if (scopeKind === 'all-project-sessions') {
    return `${agentCount} agent${agentCount === 1 ? '' : 's'} in code search scope`
  }

  return 'Active agent worktree'
}

export function getSearchPlaceholder(mode: SearchMode): string {
  if (mode === 'memory') return 'Search memory...'
  if (mode === 'everything') return 'Search code and memory...'
  return 'Search code...'
}

export function getEmptyState(mode: SearchMode): string {
  if (mode === 'memory') return 'Search observations, summaries, and interactions'
  if (mode === 'everything') return 'Search across code, sessions, and memory'
  return 'Search across the current code scope'
}

export function formatMemoryDate(timestamp: number): string {
  const deltaMs = Date.now() - timestamp
  const deltaDays = Math.floor(deltaMs / (1000 * 60 * 60 * 24))
  if (deltaDays <= 0) return 'today'
  if (deltaDays === 1) return 'yesterday'
  if (deltaDays < 7) return `${deltaDays}d ago`
  return new Date(timestamp).toLocaleDateString()
}
