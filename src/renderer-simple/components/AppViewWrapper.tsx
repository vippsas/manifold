import React, { useCallback } from 'react'
import { AppView } from './AppView'
import { useAgentStatus, useChat } from '../../renderer-shared/chat'
import { usePreview } from '../hooks/usePreview'
import type { SimpleApp } from '../../shared/simple-types'
import { getSimpleRuntimeLabel } from '../simple-theme'

export function AppViewWrapper({ app, onBack }: { app: SimpleApp; onBack: () => void }): React.JSX.Element {
  const { status: agentStatus, durationMs } = useAgentStatus(app.sessionId)
  const { messages, sendMessage } = useChat(app.sessionId)
  const { previewUrl } = usePreview(app.sessionId)
  const devServerStartedRef = React.useRef(false)

  // When agent finishes and no preview URL was detected, auto-start the dev
  // server so the preview pane picks up the URL without requiring navigation.
  React.useEffect(() => {
    if (agentStatus === 'done' && !previewUrl && !devServerStartedRef.current) {
      devServerStartedRef.current = true
      void window.electronAPI.invoke(
        'agent:start-dev-server',
        app.projectId,
        app.branchName,
        app.description,
        app.simpleTemplateTitle,
        app.simplePromptInstructions,
        app.runtimeId ?? 'claude',
      ).catch((error) => {
        console.error('[AppViewWrapper] failed to start dev server:', error)
      })
    }
  }, [
    agentStatus,
    previewUrl,
    app.branchName,
    app.description,
    app.projectId,
    app.runtimeId,
    app.simplePromptInstructions,
    app.simpleTemplateTitle,
  ])

  // Derive live display status instead of using the stale snapshot.
  // The snapshot's initial value distinguishes new apps ('scaffolding')
  // from reopened apps ('building') while the agent is running pre-URL.
  const status: SimpleApp['status'] =
    agentStatus === 'done' ? (previewUrl ? 'previewing' : 'live')
    : agentStatus === 'error' ? 'error'
    : agentStatus === 'waiting' ? (previewUrl ? 'previewing' : 'idle')
    : previewUrl ? 'building'
    : app.status

  const interruptAgent = useCallback(() => {
    window.electronAPI.invoke('agent:interrupt', app.sessionId)
  }, [app.sessionId])

  return (
    <AppView
      status={status}
      messages={messages}
      isAgentWorking={agentStatus === 'running'}
      agentDurationMs={durationMs}
      onSendMessage={sendMessage}
      onInterrupt={interruptAgent}
      onBack={onBack}
      runtimeLabel={getSimpleRuntimeLabel(app.runtimeId)}
    />
  )
}
