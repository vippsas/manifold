import React from 'react'
import { useBackgroundAgent } from '../../hooks/useBackgroundAgent'
import { useDockState } from '../editor/dock-panel-types'
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
  const status = snapshot?.status
  const summaryText = status?.summary ?? getFallbackStatusText(status?.phase)
  const activityItems = (status?.recentActivity ?? [])
    .filter((item) => item !== summaryText)
    .slice()
    .reverse()
  const subtitle = backgroundAgent.isRefreshing
    ? summaryText
    : snapshot?.status.lastRefreshedAt
      ? `Last refreshed ${new Date(snapshot.status.lastRefreshedAt).toLocaleString()}`
      : 'Refresh to build the first project-aware feed'

  return (
    <div style={s.wrapper}>
      <div style={s.toolbar}>
        <div style={s.toolbarMeta}>
          <div style={s.title}>Project Ideas</div>
          <div style={s.subtitle}>{subtitle}</div>
        </div>
        <button
          type="button"
          style={{
            ...s.refreshButton,
            ...(backgroundAgent.isRefreshing ? s.refreshButtonDisabled : {}),
          }}
          onClick={() => void backgroundAgent.refresh()}
          disabled={backgroundAgent.isRefreshing}
        >
          {backgroundAgent.isRefreshing && (
            <span className="spinner" aria-hidden="true" style={s.buttonSpinner} />
          )}
          <span>{backgroundAgent.isRefreshing ? 'Refreshing Ideas...' : 'Refresh Ideas'}</span>
        </button>
      </div>

      <div style={s.content}>
        {backgroundAgent.error && <div style={s.error}>{backgroundAgent.error}</div>}

        {backgroundAgent.isRefreshing && (
          <div style={s.statusCard}>
            <span className="spinner" aria-hidden="true" />
            <div style={s.statusBody}>
              <div style={s.statusHeader}>
                <div style={s.statusHeadline}>{summaryText}</div>
                {status?.stepLabel && <div style={s.statusStep}>{status.stepLabel}</div>}
              </div>
              {status?.detail && <div style={s.statusText}>{status.detail}</div>}
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
