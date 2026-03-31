import type {
  BackgroundAgentGenerationStatus,
  BackgroundAgentSnapshot,
} from '../../../background-agent/schemas/background-agent-types'
import type { WebResearchResult, WebResearchTopic } from '../../../background-agent/connectors/web/web-research-types'
import { cloneProjectState, toSnapshot, type BackgroundAgentProjectState } from './background-agent-types'

export type RequestedRefreshAction = 'pause' | 'stop'

export interface BackgroundAgentRefreshExecutionControl {
  requestedAction: RequestedRefreshAction | null
}

export function withStatus(
  state: BackgroundAgentProjectState,
  status: BackgroundAgentGenerationStatus,
): BackgroundAgentProjectState {
  const next = cloneProjectState(state)
  next.status = {
    ...status,
    recentActivity: [...status.recentActivity],
  }
  return next
}

export function createProfilingState(existingState: BackgroundAgentProjectState): BackgroundAgentProjectState {
  const initialState = cloneProjectState(existingState)
  initialState.pendingRefresh = null
  initialState.status = {
    phase: 'profiling',
    isRefreshing: true,
    refreshState: 'running',
    lastRefreshedAt: existingState.status.lastRefreshedAt,
    error: null,
    summary: 'Building a project profile from local docs and metadata.',
    detail: 'Reading README, planning docs, package manifests, and repo structure.',
    stepLabel: 'Step 1 of 4',
    recentActivity: [
      'Started a new Ideas refresh.',
      'Reading local project context to understand what this product is.',
    ],
  }
  return initialState
}

export function createPausedState(
  state: BackgroundAgentProjectState,
  completedTopics: number,
  totalTopics: number,
): BackgroundAgentProjectState {
  const paused = cloneProjectState(state)
  const remainingTopics = Math.max(0, totalTopics - completedTopics)
  paused.status = {
    phase: remainingTopics > 0 ? 'researching' : 'synthesizing',
    isRefreshing: false,
    refreshState: 'paused',
    lastRefreshedAt: state.status.lastRefreshedAt,
    error: null,
    summary: 'Ideas refresh paused.',
    detail: remainingTopics > 0
      ? `Resume to continue with ${remainingTopics} remaining research ${remainingTopics === 1 ? 'topic' : 'topics'}.`
      : 'Web research is complete. Resume to synthesize and rank the idea feed.',
    stepLabel: remainingTopics > 0
      ? (completedTopics > 0
        ? `Paused after topic ${completedTopics} of ${totalTopics}`
        : `Paused before topic 1 of ${totalTopics}`)
      : 'Ready to synthesize',
    recentActivity: appendActivity(state.status.recentActivity, [
      'Paused the Ideas refresh.',
    ]),
  }
  return paused
}

export function createStoppedState(
  state: BackgroundAgentProjectState,
  activity: string,
): BackgroundAgentProjectState {
  const stopped = cloneProjectState(state)
  stopped.pendingRefresh = null
  stopped.status = {
    phase: state.status.phase,
    isRefreshing: false,
    refreshState: 'stopped',
    lastRefreshedAt: state.status.lastRefreshedAt,
    error: null,
    summary: 'Ideas refresh stopped.',
    detail: 'Refresh again to start a new Ideas run.',
    stepLabel: null,
    recentActivity: appendActivity(state.status.recentActivity, [
      activity,
    ]),
  }
  return stopped
}

export function createFailedState(
  state: BackgroundAgentProjectState,
  summary: string,
  error: unknown,
  keepPendingRefresh: boolean,
): BackgroundAgentProjectState {
  const failed = cloneProjectState(state)
  if (!keepPendingRefresh) {
    failed.pendingRefresh = null
  }
  failed.status = {
    phase: 'error',
    isRefreshing: false,
    refreshState: keepPendingRefresh && failed.pendingRefresh ? 'paused' : 'idle',
    lastRefreshedAt: state.status.lastRefreshedAt,
    error: formatError(error),
    summary,
    detail: keepPendingRefresh && failed.pendingRefresh
      ? 'The refresh paused because resume could not continue. Fix the issue and resume again, or start a fresh refresh.'
      : 'The background agent could not finish building the feed.',
    stepLabel: null,
    recentActivity: appendActivity(state.status.recentActivity, [
      `${summary.replace(/\.$/, '')}: ${formatError(error)}`,
    ]),
  }
  return failed
}

export function createRecoveredInterruptedState(
  state: BackgroundAgentProjectState,
): BackgroundAgentProjectState {
  return withStatus(state, {
    phase: 'error',
    isRefreshing: false,
    refreshState: state.pendingRefresh ? 'paused' : 'idle',
    lastRefreshedAt: state.status.lastRefreshedAt,
    error: state.status.error ?? 'Previous Ideas refresh was interrupted.',
    summary: state.pendingRefresh
      ? 'The previous Ideas refresh was interrupted and can be resumed.'
      : 'The previous Ideas refresh was interrupted.',
    detail: state.pendingRefresh
      ? 'No live background task is attached anymore. Resume to continue from the last checkpoint or refresh to restart.'
      : 'No live background research task is attached to this refresh anymore. Refresh again to retry.',
    stepLabel: null,
    recentActivity: appendActivity(state.status.recentActivity, [
      'Recovered a stale refresh state with no active background task.',
    ]),
  })
}

export function completeRequestedAction(
  state: BackgroundAgentProjectState,
  execution: BackgroundAgentRefreshExecutionControl,
  completedTopics: number,
  totalTopics: number,
): BackgroundAgentSnapshot | null {
  if (execution.requestedAction === 'pause') {
    return toSnapshot(createPausedState(state, completedTopics, totalTopics))
  }
  if (execution.requestedAction === 'stop') {
    return toSnapshot(createStoppedState(state, 'Stopped the active Ideas refresh.'))
  }
  return null
}

export function createEmptyResearchResult(topic: WebResearchTopic): WebResearchResult {
  return {
    topic: { ...topic },
    topicSummary: '',
    findings: [],
    sources: [],
    candidateSuggestions: [],
  }
}

export function cloneResearchResult(result: WebResearchResult): WebResearchResult {
  return {
    ...result,
    topic: { ...result.topic },
    findings: [...result.findings],
    sources: result.sources.map((source) => ({ ...source })),
    candidateSuggestions: result.candidateSuggestions.map((suggestion) => ({
      ...suggestion,
      evidence: [...suggestion.evidence],
    })),
  }
}

export function mapRequestedActionToRefreshState(
  requestedAction: RequestedRefreshAction | null,
): BackgroundAgentGenerationStatus['refreshState'] {
  switch (requestedAction) {
    case 'pause':
      return 'pause_requested'
    case 'stop':
      return 'stop_requested'
    default:
      return 'running'
  }
}

export function getRequestedActionSummary(requestedAction: RequestedRefreshAction): string {
  return requestedAction === 'pause'
    ? 'Pausing the Ideas refresh after the current step.'
    : 'Stopping the Ideas refresh after the current step.'
}

export function getRequestedActionDetail(requestedAction: RequestedRefreshAction): string {
  return requestedAction === 'pause'
    ? 'Waiting for the active research step to finish before pausing.'
    : 'Waiting for the active research step to finish before stopping.'
}

export function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'Unknown background-agent error.'
}

export function sanitizeForLog(value: string, maxLength = 220): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`
}

export function appendActivity(
  existing: string[],
  nextItems: Array<string | null | undefined>,
  limit = 6,
): string[] {
  const merged = [...existing]
  for (const item of nextItems) {
    if (!item) continue
    const trimmed = item.trim()
    if (!trimmed) continue
    if (merged.at(-1) !== trimmed) {
      merged.push(trimmed)
    }
  }
  return merged.slice(-limit)
}
