import type { BackgroundAgentSnapshot } from '../../../background-agent/schemas/background-agent-types'

export function createRefreshBootstrapSnapshot(
  snapshot: BackgroundAgentSnapshot | null,
): BackgroundAgentSnapshot {
  if (!snapshot) {
    return {
      profile: null,
      suggestions: [],
      status: {
        phase: 'profiling',
        isRefreshing: true,
        refreshState: 'running',
        lastRefreshedAt: null,
        error: null,
        summary: 'Starting a new Ideas refresh.',
        detail: 'Preparing local project context and research topics.',
        stepLabel: 'Step 1 of 4',
        recentActivity: ['Started a new Ideas refresh.'],
      },
    }
  }

  return {
    ...snapshot,
    status: {
      ...snapshot.status,
      phase: 'profiling',
      isRefreshing: true,
      refreshState: 'running',
      error: null,
      summary: 'Starting a new Ideas refresh.',
      detail: 'Preparing local project context and research topics.',
      stepLabel: 'Step 1 of 4',
      recentActivity: snapshot.status.recentActivity.at(-1) === 'Started a new Ideas refresh.'
        ? snapshot.status.recentActivity
        : [...snapshot.status.recentActivity, 'Started a new Ideas refresh.'].slice(-6),
    },
  }
}

export function createResumeBootstrapSnapshot(snapshot: BackgroundAgentSnapshot): BackgroundAgentSnapshot {
  return {
    ...snapshot,
    status: {
      ...snapshot.status,
      isRefreshing: true,
      refreshState: 'running',
      error: null,
      summary: 'Resuming the paused Ideas refresh.',
      detail: 'Reattaching the background agent to the saved research checkpoint.',
      recentActivity: snapshot.status.recentActivity.at(-1) === 'Resumed the paused Ideas refresh.'
        ? snapshot.status.recentActivity
        : [...snapshot.status.recentActivity, 'Resumed the paused Ideas refresh.'].slice(-6),
    },
  }
}

export function formatBackgroundAgentError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'Unknown background-agent error.'
}
