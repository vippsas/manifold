import React, { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { NewAppForm } from './components/NewAppForm'
import { useApps } from './hooks/useApps'
import type { SimpleApp } from '../shared/simple-types'

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
    return (
      <div style={{ padding: 40 }}>
        <button
          onClick={() => setView({ kind: 'dashboard' })}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '8px 16px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            marginBottom: 20,
          }}
        >
          Back to Dashboard
        </button>
        <p>App: {view.app.name} (Chat + Preview coming in next task)</p>
      </div>
    )
  }

  return (
    <Dashboard
      apps={apps}
      onNewApp={() => setView({ kind: 'new-app' })}
      onSelectApp={(app) => setView({ kind: 'app', app })}
    />
  )
}
