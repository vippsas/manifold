import React, { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { NewAppForm } from './components/NewAppForm'
import { AppView } from './components/AppView'
import { useApps } from './hooks/useApps'
import { useAgentStatus } from './hooks/useAgentStatus'
import { useChat } from './hooks/useChat'
import { usePreview } from './hooks/usePreview'
import { buildSimplePrompt } from '../shared/simple-types'
import type { SimpleApp } from '../shared/simple-types'

function AppViewWrapper({ app, onBack }: { app: SimpleApp; onBack: () => void }): React.JSX.Element {
  const { status: agentStatus, durationMs } = useAgentStatus(app.sessionId)
  const { messages, sendMessage } = useChat(app.sessionId)
  const { previewUrl } = usePreview(app.sessionId)

  return (
    <AppView
      status={app.status}
      messages={messages}
      previewUrl={previewUrl}
      isAgentWorking={agentStatus === 'running'}
      agentDurationMs={durationMs}
      onSendMessage={sendMessage}
      onBack={onBack}
      onDeploy={() => {
        /* TODO: deployment in later task */
      }}
      onDevMode={() => {
        window.electronAPI.invoke('app:switch-mode', 'developer')
      }}
    />
  )
}

type View = { kind: 'dashboard' } | { kind: 'new-app' } | { kind: 'app'; app: SimpleApp }

export function App(): React.JSX.Element {
  const { apps, refreshApps } = useApps()
  const [view, setView] = useState<View>({ kind: 'dashboard' })

  if (view.kind === 'new-app') {
    return (
      <NewAppForm
        onCancel={() => setView({ kind: 'dashboard' })}
        onStart={async (name, description) => {
          // Create a fresh project (git repo) for each new app
          const project = (await window.electronAPI.invoke(
            'projects:create-new',
            `${name}: ${description}`,
          )) as { id: string }

          const session = (await window.electronAPI.invoke('agent:spawn', {
            projectId: project.id,
            runtimeId: 'claude',
            prompt: buildSimplePrompt(description),
            userMessage: description,
            noWorktree: true,
            nonInteractive: true,
          })) as { id: string; branchName: string; worktreePath: string; status: string }

          await window.electronAPI.invoke('simple:subscribe-chat', session.id)

          const newApp: SimpleApp = {
            sessionId: session.id,
            projectId: project.id,
            name,
            description,
            status: 'building',
            previewUrl: null,
            liveUrl: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }

          setView({ kind: 'app', app: newApp })
          refreshApps()
        }}
      />
    )
  }

  if (view.kind === 'app') {
    return <AppViewWrapper app={view.app} onBack={() => setView({ kind: 'dashboard' })} />
  }

  return (
    <Dashboard
      apps={apps}
      onNewApp={() => setView({ kind: 'new-app' })}
      onSelectApp={(app) => setView({ kind: 'app', app })}
    />
  )
}
