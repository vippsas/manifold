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

  return (
    <div style={s.wrapper}>
      <div style={s.toolbar}>
        <div style={s.toolbarMeta}>
          <div style={s.title}>Project Ideas</div>
          <div style={s.subtitle}>
            {snapshot?.status.lastRefreshedAt
              ? `Last refreshed ${new Date(snapshot.status.lastRefreshedAt).toLocaleString()}`
              : 'Refresh to build the first project-aware feed'}
          </div>
        </div>
        <button
          type="button"
          style={s.refreshButton}
          onClick={() => void backgroundAgent.refresh()}
          disabled={backgroundAgent.isRefreshing}
        >
          {backgroundAgent.isRefreshing ? 'Refreshing...' : 'Refresh Ideas'}
        </button>
      </div>

      <div style={s.content}>
        {backgroundAgent.error && <div style={s.error}>{backgroundAgent.error}</div>}

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
