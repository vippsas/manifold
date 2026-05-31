import React, { useState, useEffect, useLayoutEffect } from 'react'
import { Dashboard } from './components/Dashboard'
import type { StartAppRequest } from './components/Dashboard'
import { SimpleTitleBar } from './components/SimpleTitleBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppViewWrapper } from './components/AppViewWrapper'
import { useApps } from './hooks/useApps'
import { useAgentStatus } from '../renderer-shared/chat'
import { buildSimplePrompt } from '../shared/simple-prompts'
import type { SimpleApp } from '../shared/simple-types'
import { loadTheme, migrateLegacyTheme } from '../shared/themes/registry'
import { applySimpleThemeVars } from './simple-theme'
import { useUpdateNotification } from '../shared/useUpdateNotification'
import { useUpdateLog } from '../shared/useUpdateLog'
import { UpdateToast } from '../shared/UpdateToast'
import { UpdateLogOverlay } from '../renderer/components/modals/UpdateLogOverlay'
import type { PendingLaunchAction } from '../shared/mode-switch-types'
import type {
  ProvisioningCreateResult,
  ProvisioningOperationResult,
} from '../shared/provisioning-types'

type View = { kind: 'dashboard' } | { kind: 'app'; app: SimpleApp }

export function App(): React.JSX.Element {
  const { apps, refreshApps, deleteApp } = useApps()
  const updateNotification = useUpdateNotification()
  const updateLog = useUpdateLog()
  const [view, setView] = useState<View>({ kind: 'dashboard' })
  const activeApp = view.kind === 'app' ? view.app : null
  const { status: agentStatus } = useAgentStatus(activeApp?.sessionId ?? null)
  const isAgentBusy = agentStatus === 'running'

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
    let cancelled = false
    void (async () => {
      const pending = (await window.electronAPI.invoke('app:consume-pending-launch')) as PendingLaunchAction | null
      if (cancelled || !pending || pending.kind !== 'simple') return
      await window.electronAPI.invoke('simple:subscribe-chat', pending.app.sessionId)
      if (!cancelled) setView({ kind: 'app', app: pending.app })
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
      onViewReleaseNotes={() => updateLog.openReleaseNotes(updateNotification.version ?? undefined)}
    />
  ) : null

  if (view.kind === 'app') {
    return (
      <ErrorBoundary onReset={() => setView({ kind: 'dashboard' })}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <SimpleTitleBar
            projectId={view.app.projectId}
            sessionId={view.app.sessionId}
            runtimeId={view.app.runtimeId}
            disabled={isAgentBusy}
            onBack={() => setView({ kind: 'dashboard' })}
          />
          <AppViewWrapper app={view.app} onBack={() => setView({ kind: 'dashboard' })} />
        </div>
        {updateToast}
        <UpdateLogOverlay
          visible={updateLog.visible}
          activeTab={updateLog.activeTab}
          currentVersion={updateLog.currentVersion}
          releaseNotes={updateLog.releaseNotes}
          log={updateLog.log}
          loading={updateLog.loading}
          error={updateLog.error}
          onClose={updateLog.close}
          onRefresh={() => { void updateLog.refresh() }}
          onClean={() => { void updateLog.clear() }}
          onCheckForUpdates={() => { void updateLog.checkForUpdates() }}
          onOpenExternal={() => { void updateLog.openReleaseNotesExternal() }}
          onSelectTab={updateLog.setActiveTab}
        />
      </ErrorBoundary>
    )
  }

  const hasActiveApp = apps.some((app) => app.status === 'scaffolding' || app.status === 'building')

  return (
    <>
    <SimpleTitleBar disabled={hasActiveApp} />
    <Dashboard
      apps={apps}
      onStart={async ({ name, description, templateQualifiedId, templateTitle, promptInstructions, inputs }: StartAppRequest) => {
        const settings = (await window.electronAPI.invoke('settings:get')) as { defaultRuntime?: string }
        const provisioning = (await window.electronAPI.invoke(
          'provisioning:create',
          { templateQualifiedId, inputs },
        )) as ProvisioningOperationResult<ProvisioningCreateResult>

        if (!provisioning.ok) {
          throw new Error(provisioning.error.message)
        }

        await window.electronAPI.invoke('projects:update', provisioning.value.project.id, {
          simpleTemplateTitle: templateTitle,
          simplePromptInstructions: promptInstructions,
        })

        const session = (await window.electronAPI.invoke('agent:spawn', {
          projectId: provisioning.value.project.id,
          runtimeId: settings.defaultRuntime ?? 'claude',
          prompt: buildSimplePrompt(description, templateTitle, promptInstructions),
          userMessage: description,
          simpleTemplateTitle: templateTitle,
          simplePromptInstructions: promptInstructions,
          noWorktree: true,
          nonInteractive: true,
        })) as { id: string; branchName: string; worktreePath: string; status: string }

        await window.electronAPI.invoke('simple:subscribe-chat', session.id)

        const newApp: SimpleApp = {
          sessionId: session.id,
          projectId: provisioning.value.project.id,
          runtimeId: settings.defaultRuntime ?? 'claude',
          branchName: session.branchName ?? '',
          name,
          description,
          simpleTemplateTitle: templateTitle,
          simplePromptInstructions: promptInstructions,
          status: 'scaffolding',
          previewUrl: null,
          liveUrl: null,
          projectPath: provisioning.value.project.path,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        setView({ kind: 'app', app: newApp })
        refreshApps()
      }}
      onSelectApp={async (app) => {
        try {
          const previewUrl = (await window.electronAPI.invoke(
            'simple:get-preview-url',
            app.sessionId,
          )) as string | null
          const needsDevServer = !previewUrl && app.status !== 'scaffolding' && app.status !== 'building'
          if (needsDevServer) {
            const settings = (await window.electronAPI.invoke('settings:get')) as { defaultRuntime?: string }
            const result = (await window.electronAPI.invoke(
              'agent:start-dev-server',
              app.projectId,
              app.branchName,
              app.description,
              app.simpleTemplateTitle,
              app.simplePromptInstructions,
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
            setView({
              kind: 'app',
              app: {
                ...app,
                previewUrl,
              },
            })
          }
        } catch (err) {
          console.error('[onSelectApp] failed:', err)
        }
      }}
      onDeleteApp={(app) => deleteApp(app.sessionId, app.projectId)}
    />
    {updateToast}
    <UpdateLogOverlay
      visible={updateLog.visible}
      activeTab={updateLog.activeTab}
      currentVersion={updateLog.currentVersion}
      releaseNotes={updateLog.releaseNotes}
      log={updateLog.log}
      loading={updateLog.loading}
      error={updateLog.error}
      onClose={updateLog.close}
      onRefresh={() => { void updateLog.refresh() }}
      onClean={() => { void updateLog.clear() }}
      onCheckForUpdates={() => { void updateLog.checkForUpdates() }}
      onOpenExternal={() => { void updateLog.openReleaseNotesExternal() }}
      onSelectTab={updateLog.setActiveTab}
    />
    </>
  )
}
