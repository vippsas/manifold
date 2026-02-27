import React, { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { NewAppForm } from './components/NewAppForm'
import { AppView } from './components/AppView'
import { useApps } from './hooks/useApps'
import { useChat } from './hooks/useChat'
import { usePreview } from './hooks/usePreview'
import type { SimpleApp } from '../shared/simple-types'

function AppViewWrapper({ app, onBack }: { app: SimpleApp; onBack: () => void }): React.JSX.Element {
  const { messages, sendMessage } = useChat(app.sessionId)
  const { previewUrl } = usePreview(app.sessionId)

  return (
    <AppView
      status={app.status}
      messages={messages}
      previewUrl={previewUrl}
      onSendMessage={sendMessage}
      onBack={onBack}
      onDeploy={() => {
        /* TODO: deployment in later task */
      }}
      onDevMode={() => {
        /* TODO: mode switch in later task */
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
          const projects = (await window.electronAPI.invoke('projects:list')) as Array<{
            id: string
          }>
          if (projects.length === 0) return
          const projectId = projects[0].id

          const session = (await window.electronAPI.invoke('agent:spawn', {
            projectId,
            runtimeId: 'claude',
            prompt: description,
            branchName: name,
          })) as { id: string; branchName: string; worktreePath: string; status: string }

          await window.electronAPI.invoke('simple:subscribe-chat', session.id)

          const newApp: SimpleApp = {
            sessionId: session.id,
            projectId,
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
