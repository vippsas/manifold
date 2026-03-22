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
  workspaceSessionCount: number,
  workspaceProjectCount: number,
): SearchScopeOption[] {
  const options: SearchScopeOption[] = [
    { value: 'active-session', label: 'Active Agent' },
  ]

  if (additionalDirCount > 0) {
    options.push({ value: 'visible-roots', label: 'Visible Roots' })
  }
  if (workspaceSessionCount > 1) {
    options.push({
      value: 'all-project-sessions',
      label: workspaceProjectCount > 1 ? 'All Agents (Workspace)' : 'All Agents',
    })
  }

  return options
}

export function getInfoText(params: {
  context: SearchContextResponse | null
  mode: SearchMode
  scopeKind: SearchScopeKind
  additionalDirCount: number
  totalAdditionalDirCount: number
  workspaceAgentCount: number
  workspaceProjectCount: number
  workspaceAdditionalDirCount: number
  hasActiveSession: boolean
}): string | null {
  const {
    context,
    mode,
    scopeKind,
    additionalDirCount,
    totalAdditionalDirCount,
    workspaceAgentCount,
    workspaceProjectCount,
    workspaceAdditionalDirCount,
    hasActiveSession,
  } = params
  if (!context) return null

  const agentCount = context.sessions.length
  if (mode === 'memory') {
    return `${agentCount} agent${agentCount === 1 ? '' : 's'} in project memory context`
  }

  if (mode === 'everything') {
    if (scopeKind === 'all-project-sessions') {
      const totalRootCount = workspaceAgentCount + workspaceAdditionalDirCount
      if (workspaceProjectCount > 1) {
        return `${workspaceAgentCount} agent${workspaceAgentCount === 1 ? '' : 's'} across ${workspaceProjectCount} repos, ${totalRootCount} code root${totalRootCount === 1 ? '' : 's'}, and workspace memory`
      }
      return `${agentCount} agent${agentCount === 1 ? '' : 's'}, ${totalRootCount} code root${totalRootCount === 1 ? '' : 's'}, and project memory`
    }

    if (scopeKind === 'visible-roots') {
      const totalRootCount = additionalDirCount + (hasActiveSession ? 1 : 0)
      return `${totalRootCount} active code root${totalRootCount === 1 ? '' : 's'} and project memory`
    }

    return 'Active agent code and project memory'
  }

  if (scopeKind === 'visible-roots') {
    const totalRootCount = additionalDirCount + (hasActiveSession ? 1 : 0)
    return `${totalRootCount} visible root${totalRootCount === 1 ? '' : 's'} in active agent scope`
  }

  if (scopeKind === 'all-project-sessions') {
    if (workspaceProjectCount > 1) {
      return `${workspaceAgentCount} agent${workspaceAgentCount === 1 ? '' : 's'} across ${workspaceProjectCount} repos in code search scope`
    }
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
