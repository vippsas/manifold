import React, { useState, useLayoutEffect } from 'react'
import { Dashboard } from './components/Dashboard'
import { AppView } from './components/AppView'
import { useApps } from './hooks/useApps'
import { useAgentStatus } from './hooks/useAgentStatus'
import { useChat } from './hooks/useChat'
import { usePreview } from './hooks/usePreview'
import { buildSimplePrompt } from '../shared/simple-prompts'
import type { SimpleApp } from '../shared/simple-types'
import { loadTheme, migrateLegacyTheme } from '../shared/themes/registry'
import { applyThemeCssVars } from '../shared/themes/adapter'
import type { ConvertedTheme } from '../shared/themes/types'

/** Apply theme CSS vars + alias the developer-view names to simple-mode names */
function applySimpleThemeVars(theme: ConvertedTheme): void {
  const vars = theme.cssVars
  applyThemeCssVars(vars)
  const root = document.documentElement
  root.style.setProperty('--bg', vars['--bg-primary'])
  root.style.setProperty('--surface', vars['--bg-secondary'])
  root.style.setProperty('--text', vars['--text-primary'])
}

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
        window.electronAPI.invoke('app:switch-mode', 'developer', app.projectId)
      }}
    />
  )
}

type View = { kind: 'dashboard' } | { kind: 'app'; app: SimpleApp }

export function App(): React.JSX.Element {
  const { apps, refreshApps, deleteApp } = useApps()
  const [view, setView] = useState<View>({ kind: 'dashboard' })

  useLayoutEffect(() => {
    let cancelled = false
    void (async () => {
      const settings = (await window.electronAPI.invoke('settings:get')) as { theme?: string }
      if (cancelled) return
      const themeId = migrateLegacyTheme(settings.theme ?? 'dracula')
      const theme = loadTheme(themeId)
      applySimpleThemeVars(theme)
      window.electronAPI.send('theme:changed', {
        type: theme.type,
        background: theme.cssVars['--bg-primary'],
      })
    })()
    return () => { cancelled = true }
  }, [])

  if (view.kind === 'app') {
    return <AppViewWrapper app={view.app} onBack={() => setView({ kind: 'dashboard' })} />
  }

  return (
    <Dashboard
      apps={apps}
      onStart={async (name, description) => {
        const project = (await window.electronAPI.invoke(
          'projects:create-new',
          `${name}: ${description}`,
        )) as { id: string; path: string }

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
          projectPath: project.path,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        setView({ kind: 'app', app: newApp })
        refreshApps()
      }}
      onSelectApp={(app) => setView({ kind: 'app', app })}
      onDeleteApp={(app) => deleteApp(app.sessionId, app.projectId)}
    />
  )
}
