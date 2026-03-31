import React from 'react'
import { useBackgroundAgent } from '../../hooks/useBackgroundAgent'
import { useDockState } from '../editor/dock-panel-types'
import { ActionMenuButton } from '../editor/ActionMenuButton'
import { backgroundAgentPanelStyles as s } from './BackgroundAgentPanel.styles'
import { BackgroundSuggestionCard } from './BackgroundSuggestionCard'

export function BackgroundAgentPanel(): React.JSX.Element {
  const dock = useDockState()
  const backgroundAgent = useBackgroundAgent(dock.activeProjectId, dock.sessionId)

  if (!dock.activeProjectId) {
    return <div style={s.empty}>Select a project to get ideas.</div>
  }

  if (backgroundAgent.isLoading && !backgroundAgent.snapshot) {
    return <div style={s.empty}>Loading idea feed...</div>
  }

  const snapshot = backgroundAgent.snapshot
  const status = backgroundAgent.status
  const refreshState = status?.refreshState ?? 'idle'
  const isPaused = refreshState === 'paused'
  const isStopped = refreshState === 'stopped'
  const isPauseRequested = refreshState === 'pause_requested'
  const isStopRequested = refreshState === 'stop_requested'
  const summaryText = status?.summary ?? getFallbackStatusText(status?.phase)
  const detailText = status?.detail ?? null
  const activityItems = (status?.recentActivity ?? [])
    .filter((item) => item !== summaryText && item !== detailText)
    .slice()
    .reverse()
  const subtitle = backgroundAgent.isRefreshing || isPaused || isStopped
    ? summaryText
    : snapshot?.status.lastRefreshedAt
      ? `Last refreshed ${new Date(snapshot.status.lastRefreshedAt).toLocaleString()}`
      : 'Refresh to build the first project-aware feed'
  const canClear = !backgroundAgent.isRefreshing && !backgroundAgent.isClearing && (
    Boolean(snapshot?.profile) || backgroundAgent.suggestions.length > 0
  )
  const showStatusCard = backgroundAgent.isRefreshing || isPaused || isStopped
  const primaryAction = isPaused
    ? () => void backgroundAgent.resume()
    : backgroundAgent.isRefreshing
      ? () => void backgroundAgent.pause()
      : () => void backgroundAgent.refresh()
  const primaryLabel = isPaused
    ? 'Resume Ideas'
    : isPauseRequested
      ? 'Pausing...'
      : isStopRequested
        ? 'Stopping...'
        : backgroundAgent.isRefreshing
          ? 'Pause Ideas'
          : 'Refresh Ideas'
  const primaryDisabled = backgroundAgent.isClearing || isPauseRequested || isStopRequested
  const actionMenuItems = [
    ...((backgroundAgent.isRefreshing || isPaused) && !isStopRequested ? [{
      id: 'stop',
      label: 'Stop Refresh',
      action: () => void backgroundAgent.stop(),
    }] : []),
    ...(canClear ? [{
      id: 'clear',
      label: 'Clear Ideas',
      action: () => void backgroundAgent.clear(),
    }] : []),
  ]

  return (
    <div style={s.wrapper}>
      <div style={s.toolbar}>
        <div style={s.toolbarMeta}>
          <div style={s.title}>Project Ideas</div>
          <div style={s.subtitle}>{subtitle}</div>
        </div>
        <div style={s.toolbarActions}>
          <button
            type="button"
            style={{
              ...s.refreshButton,
              ...(primaryDisabled ? s.refreshButtonDisabled : {}),
            }}
            onClick={primaryAction}
            disabled={primaryDisabled}
          >
            {(isPauseRequested || isStopRequested) && (
              <span className="spinner" aria-hidden="true" style={s.buttonSpinner} />
            )}
            <span>{primaryLabel}</span>
          </button>
          <ActionMenuButton
            buttonLabel="More"
            title="More actions"
            menuLabel="Ideas actions"
            items={actionMenuItems}
          />
        </div>
      </div>

      <div style={s.content}>
        {backgroundAgent.error && <div style={s.error}>{backgroundAgent.error}</div>}

        {showStatusCard && (
          <div style={s.statusCard}>
            {backgroundAgent.isRefreshing && <span className="spinner" aria-hidden="true" />}
            <div style={s.statusBody}>
              <div style={s.statusHeader}>
                <div style={s.statusHeadline}>{summaryText}</div>
                {status?.stepLabel && <div style={s.statusStep}>{status.stepLabel}</div>}
              </div>
              {detailText && <div style={s.statusText}>{detailText}</div>}
              {activityItems.length > 0 && (
                <ul style={s.activityList}>
                  {activityItems.map((item, index) => (
                    <li key={`${index}:${item}`} style={s.activityItem}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {snapshot?.profile && (
          <div style={s.infoCard}>
            <div style={s.infoLabel}>Project Profile</div>
            <div style={s.infoText}>{snapshot.profile.summary}</div>
            {snapshot.profile.architectureShape && (
              <div style={s.infoText}>Architecture: {snapshot.profile.architectureShape}</div>
            )}
            {snapshot.profile.dependencyStack.length > 0 && (
              <div style={s.infoText}>Stack: {snapshot.profile.dependencyStack.join(', ')}</div>
            )}
            {snapshot.profile.recentChanges.length > 0 && (
              <React.Fragment>
                <div style={s.infoText}>Recent changes:</div>
                <ul style={s.infoList}>
                {snapshot.profile.recentChanges.map((item, index) => (
                  <li key={`${index}:${item}`} style={s.infoItem}>{item}</li>
                ))}
                </ul>
              </React.Fragment>
            )}
          </div>
        )}

        {snapshot && snapshot.suggestions.length > 0 ? (
          snapshot.suggestions.map((suggestion) => (
            <BackgroundSuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onFeedback={backgroundAgent.submitFeedback}
            />
          ))
        ) : (
          <div style={s.empty}>
            {snapshot?.profile
              ? 'The project profile is ready, but there are no source-backed ideas yet.'
              : 'No ideas yet. Refresh to build the first project profile and suggestion feed.'}
          </div>
        )}
      </div>
    </div>
  )
}

function getFallbackStatusText(phase: string | undefined): string {
  switch (phase) {
    case 'profiling':
      return 'Profiling the current project and reading local context.'
    case 'researching':
      return 'Researching the web for source-backed ideas.'
    case 'synthesizing':
      return 'Synthesizing and ranking the strongest ideas.'
    default:
      return 'Refreshing the project-aware idea feed.'
  }
}
