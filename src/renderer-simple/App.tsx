import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { Dashboard } from './components/Dashboard'
import type { StartAppRequest } from './components/Dashboard'
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
import { useUpdateNotification } from '../shared/useUpdateNotification'
import { UpdateToast } from '../shared/UpdateToast'
import type { ProvisioningCreateResult } from '../shared/provisioning-types'

const SIMPLE_RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
}

function getSimpleRuntimeLabel(runtimeId?: string): string {
  if (!runtimeId) return 'AI Assistant'
  return SIMPLE_RUNTIME_LABELS[runtimeId] ?? runtimeId
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#f88', fontFamily: 'monospace' }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, opacity: 0.7 }}>{this.state.error.stack}</pre>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onReset() }}
            style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
          >
            Back to Dashboard
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

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

  // Derive live display status instead of using the stale snapshot.
  // The snapshot's initial value distinguishes new apps ('scaffolding')
  // from reopened apps ('building') while the agent is running pre-URL.
  const status: SimpleApp['status'] =
    agentStatus === 'done' ? 'live'
    : agentStatus === 'error' ? 'error'
    : agentStatus === 'waiting' ? 'previewing'
    : previewUrl ? 'building'
    : app.status

  const interruptAgent = useCallback(() => {
    window.electronAPI.invoke('agent:interrupt', app.sessionId)
  }, [app.sessionId])

  return (
    <AppView
      status={status}
      messages={messages}
      previewUrl={previewUrl}
      isAgentWorking={agentStatus === 'running'}
      agentDurationMs={durationMs}
      onSendMessage={sendMessage}
      onInterrupt={interruptAgent}
      onBack={onBack}
      onDeploy={() => {
        /* TODO: deployment in later task */
      }}
      runtimeLabel={getSimpleRuntimeLabel(app.runtimeId)}
      onDevMode={() => {
        window.electronAPI.invoke('app:switch-mode', 'developer', app.projectId)
      }}
    />
  )
}

type View = { kind: 'dashboard' } | { kind: 'app'; app: SimpleApp }

export function App(): React.JSX.Element {
  const { apps, refreshApps, deleteApp } = useApps()
  const updateNotification = useUpdateNotification()
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

  useEffect(() => {
    const unsub = window.electronAPI.on('app:auto-open-app', (...args: unknown[]) => {
      const app = args[0] as SimpleApp
      if (app?.sessionId && app?.projectId) {
        void window.electronAPI.invoke('simple:subscribe-chat', app.sessionId)
        setView({ kind: 'app', app })
      }
    })
    return unsub
  }, [])

  const updateToast = updateNotification.updateReady ? (
    <UpdateToast
      version={updateNotification.version}
      onRestart={updateNotification.install}
      onDismiss={updateNotification.dismiss}
    />
  ) : null

  if (view.kind === 'app') {
    return (
      <ErrorBoundary onReset={() => setView({ kind: 'dashboard' })}>
        <AppViewWrapper app={view.app} onBack={() => setView({ kind: 'dashboard' })} />
        {updateToast}
      </ErrorBoundary>
    )
  }

  return (
    <>
    <Dashboard
      apps={apps}
      onStart={async ({ name, description, templateQualifiedId, templateTitle, inputs }: StartAppRequest) => {
        const settings = (await window.electronAPI.invoke('settings:get')) as { defaultRuntime?: string }
        const provisioning = (await window.electronAPI.invoke(
          'provisioning:create',
          { templateQualifiedId, inputs },
        )) as ProvisioningCreateResult

        const session = (await window.electronAPI.invoke('agent:spawn', {
          projectId: provisioning.project.id,
          runtimeId: settings.defaultRuntime ?? 'claude',
          prompt: buildSimplePrompt(description, templateTitle),
          userMessage: description,
          noWorktree: true,
          nonInteractive: true,
        })) as { id: string; branchName: string; worktreePath: string; status: string }

        await window.electronAPI.invoke('simple:subscribe-chat', session.id)

        const newApp: SimpleApp = {
          sessionId: session.id,
          projectId: provisioning.project.id,
          runtimeId: settings.defaultRuntime ?? 'claude',
          branchName: session.branchName ?? '',
          name,
          description,
          status: 'scaffolding',
          previewUrl: null,
          liveUrl: null,
          projectPath: provisioning.project.path,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        setView({ kind: 'app', app: newApp })
        refreshApps()
      }}
      onSelectApp={async (app) => {
        try {
          const needsDevServer = app.status === 'idle' || app.status === 'live' || app.status === 'error'
          if (needsDevServer) {
            const settings = (await window.electronAPI.invoke('settings:get')) as { defaultRuntime?: string }
            const result = (await window.electronAPI.invoke(
              'agent:start-dev-server',
              app.projectId,
              app.branchName,
              app.description,
              settings.defaultRuntime ?? 'claude',
            )) as { sessionId: string }
            await window.electronAPI.invoke('simple:subscribe-chat', result.sessionId)
            setView({
              kind: 'app',
              app: {
                ...app,
                sessionId: result.sessionId,
                runtimeId: settings.defaultRuntime ?? app.runtimeId ?? 'claude',
                status: 'building',
              },
            })
            refreshApps()
          } else {
            await window.electronAPI.invoke('simple:subscribe-chat', app.sessionId)
            setView({ kind: 'app', app })
          }
        } catch (err) {
          console.error('[onSelectApp] failed:', err)
        }
      }}
      onDeleteApp={(app) => deleteApp(app.sessionId, app.projectId)}
      onDevMode={() => {
        window.electronAPI.invoke('app:switch-mode', 'developer')
      }}
    />
    {updateToast}
    </>
  )
}
