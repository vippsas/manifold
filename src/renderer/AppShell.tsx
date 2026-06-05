import React from 'react'
import { DockviewReact, type DockviewApi } from 'dockview'
import type { Project, AgentSession, ManifoldSettings, FileChange, CreateProjectOptions } from '../shared/types'
import type { Workspace, WorkspaceCreateOptions } from '../shared/workspace-types'
import type { DockAppState } from './components/editor/dock-panel-types'
import type { UseAppOverlaysResult } from './hooks/useAppOverlays'
import { PANEL_COMPONENTS, DockStateContext } from './components/editor/dock-panels'
import { WorkspaceHeaderActions } from './components/editor/WorkspaceHeaderActions'
import { ShellHeaderActions } from './components/terminal/ShellHeaderActions'
import { OnboardingView } from './components/modals/OnboardingView'
import { SettingsModal } from './components/modals/SettingsModal'
import { AboutOverlay } from './components/modals/AboutOverlay'
import { UpdateLogOverlay } from './components/modals/UpdateLogOverlay'
import { UpdateToast } from '../shared/UpdateToast'
import { ThemeChangeToast } from '../shared/ThemeChangeToast'
import { StatusBar } from './components/git/StatusBar'
import { CommitPanel } from './components/git/CommitPanel'
import { PRPanel } from './components/git/PRPanel'
import { ConflictPanel } from './components/git/ConflictPanel'
import { WelcomeDialog } from './components/modals/WelcomeDialog'
import { NewWorkspaceModal } from './components/modals/NewWorkspaceModal'
import { AddWorkspaceProjectModal } from './components/modals/AddWorkspaceProjectModal'
import { DockTab, EmptyWatermark } from './DockTab'
import { TitleBar } from './components/TitleBar'
import { DeleteAgentDialog } from './components/sidebar/DeleteAgentDialog'
import { useLoadPluginContributions } from './plugins/use-contributions'
import { PluginUiHost } from './components/plugin-ui/PluginUiHost'

export interface AppShellProps {
  themeClass: string
  settings: ManifoldSettings
  projects: Project[]
  projectError: string | null
  activeProjectId: string | null
  activeSessionId: string | null
  activeSession: AgentSession | null
  activeProjectIsGit: boolean
  baseBranch: string
  autoGenerateMessages: boolean
  diff: string
  mergedChanges: FileChange[]
  sessionsByProject: Record<string, AgentSession[]>
  dockState: DockAppState
  onDockReady: (api: DockviewApi) => void
  dockLayoutSlot: React.ReactNode // optional override; null in normal render
  overlays: UseAppOverlaysResult
  gitOps: {
    conflicts: unknown
    aheadBehind: unknown
    aiGenerate: (prompt: string) => Promise<string>
    getPRContext: () => Promise<unknown>
    resolveConflict: (...args: unknown[]) => Promise<void>
  }
  updateLog: {
    visible: boolean
    activeTab: string
    currentVersion: string
    releaseNotes: unknown
    log: unknown
    loading: boolean
    error: string | null
    close: () => void
    refresh: () => Promise<void>
    clear: () => Promise<void>
    checkForUpdates: () => Promise<void>
    openReleaseNotesExternal: () => Promise<void>
    setActiveTab: (tab: string) => void
    openReleaseNotes: (version?: string) => void
  }
  updateNotification: { updateReady: boolean; version: string | null; install: () => void; dismiss: () => void }
  themeChangeNotice: { show: boolean; mode: 'light' | 'dark'; dismiss: () => void }
  appEffects: { showOnboarding: boolean; setShowOnboarding: (v: boolean) => void; creatingProject: boolean; cloningProject: boolean }
  showCommitAndPrButtons: boolean
  // Top-level handlers/state
  handleSelectFile: (path: string) => void
  setPreviewThemeId: (id: string | null) => void
  addProject: (path?: string, options?: { activate?: boolean }) => Promise<Project | null>
  cloneProject: (url: string) => Promise<boolean>
  handleAddProjectFromOnboarding: (path?: string) => Promise<void>
  handleCloneFromOnboarding: (url: string) => Promise<boolean>
  handleCreateNewProject: (options: CreateProjectOptions) => Promise<boolean>
  // Workspace modal wiring
  newWorkspaceVisible: boolean
  setNewWorkspaceVisible: (v: boolean) => void
  defaultRuntime: string
  createWorkspace: (opts: WorkspaceCreateOptions) => Promise<Workspace>
  workspaces: Workspace[]
  addProjectWorkspaceId: string | null
  setAddProjectWorkspaceId: (id: string | null) => void
  addProjectToWorkspace: (id: string, projectId: string) => Promise<void>
  // StatusBar dock layout adapter
  dockLayout: unknown
  onRenameActiveProject: (name: string) => void
  onToggleTheme: () => void
  themeFamily: 'manifold' | 'garfield' | 'neon' | 'royal'
  onSelectThemeFamily: (family: 'manifold' | 'garfield' | 'neon' | 'royal') => void
}

export function AppShell(p: AppShellProps): React.JSX.Element {
  useLoadPluginContributions()
  const themeType: 'dark' | 'light' = p.themeClass === 'theme-light' ? 'light' : 'dark'
  if (!p.settings.setupCompleted) {
    return (
      <div className={`layout-root ${p.themeClass}`}>
        <TitleBar themeType={themeType} onToggleTheme={p.onToggleTheme} themeFamily={p.themeFamily} onSelectThemeFamily={p.onSelectThemeFamily} />
        <WelcomeDialog onAddProject={() => void p.addProject()} onCloneProject={p.cloneProject} onComplete={p.overlays.handleSetupComplete} />
      </div>
    )
  }

  if (p.projects.length === 0) {
    return (
      <div className={`layout-root ${p.themeClass}`}>
        <TitleBar themeType={themeType} onToggleTheme={p.onToggleTheme} themeFamily={p.themeFamily} onSelectThemeFamily={p.onSelectThemeFamily} />
        <OnboardingView variant="no-project" onAddProject={() => void p.handleAddProjectFromOnboarding()} onCloneProject={p.handleCloneFromOnboarding}
          onCreateNewProject={(desc) => void p.handleCreateNewProject(desc)} creatingProject={p.appEffects.creatingProject}
          cloningProject={p.appEffects.cloningProject} createError={p.projectError} />
      </div>
    )
  }

  const activeProjectName = p.projects.find((proj) => proj.id === p.activeProjectId)?.name

  return (
    <div className={`layout-root ${p.themeClass}`}>
      <TitleBar
        projectName={activeProjectName}
        themeType={themeType}
        onToggleTheme={p.onToggleTheme}
        themeFamily={p.themeFamily}
        onSelectThemeFamily={p.onSelectThemeFamily}
        search={{
          activeProjectId: p.dockState.activeProjectId,
          activeSessionId: p.dockState.sessionId,
          allProjectSessions: p.dockState.allProjectSessions,
          onOpenSearchResult: p.dockState.onOpenSearchResult,
          focusRequestKey: p.dockState.searchFocusRequestKey,
          requestedMode: p.dockState.requestedSearchMode,
        }}
      />
      <div className="layout-main">
        <DockStateContext.Provider value={p.dockState}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DockviewReact
              className={`dockview-theme-dark dockview-theme-manifold${!p.activeSessionId ? ' dockview-minimal' : ''}`}
              components={PANEL_COMPONENTS}
              onReady={(e) => p.onDockReady(e.api)}
              defaultTabComponent={DockTab}
              leftHeaderActionsComponent={ShellHeaderActions}
              rightHeaderActionsComponent={WorkspaceHeaderActions}
              watermarkComponent={EmptyWatermark}
            />
          </div>
        </DockStateContext.Provider>
        <StatusBar
          activeSession={p.activeSession}
          changedFiles={p.mergedChanges}
          baseBranch={p.baseBranch}
          projectIsGit={p.activeProjectIsGit}
          dockLayout={p.dockLayout as never}
          conflicts={p.gitOps.conflicts as never}
          aheadBehind={p.gitOps.aheadBehind as never}
          onCommit={() => p.overlays.setActivePanel('commit')}
          onCreatePR={() => p.overlays.setActivePanel('pr')}
          onShowConflicts={() => p.overlays.setActivePanel('conflicts')}
          onOpenSettings={() => p.overlays.setShowSettings(true)}
          showCommitAndPrButtons={p.showCommitAndPrButtons}
        />
      </div>
      {p.overlays.activePanel === 'commit' && p.activeSessionId && p.activeProjectIsGit && (
        <CommitPanel changedFiles={p.mergedChanges} diff={p.diff} autoGenerateMessages={p.autoGenerateMessages}
          onCommit={p.overlays.handleCommit} onAiGenerate={p.gitOps.aiGenerate} onClose={p.overlays.handleClosePanel} />
      )}
      {p.overlays.activePanel === 'pr' && p.activeSessionId && p.activeSession && p.activeProjectIsGit && (
        <PRPanel sessionId={p.activeSessionId} branchName={p.activeSession.branchName} baseBranch={p.baseBranch}
          autoGenerateMessages={p.autoGenerateMessages} onAiGenerate={p.gitOps.aiGenerate}
          getPRContext={p.gitOps.getPRContext as never} onClose={p.overlays.handleClosePanel} />
      )}
      {p.overlays.activePanel === 'conflicts' && p.activeSessionId && p.activeProjectIsGit && (
        <ConflictPanel sessionId={p.activeSessionId} conflicts={p.gitOps.conflicts as never} onAiGenerate={p.gitOps.aiGenerate}
          onResolveConflict={p.gitOps.resolveConflict as never} onSelectFile={p.handleSelectFile} onClose={p.overlays.handleClosePanel} />
      )}
      <DeleteAgentDialog
        pendingDelete={p.overlays.pendingDelete}
        siblingCount={p.overlays.pendingDelete
          ? (p.sessionsByProject[p.overlays.pendingDelete.session.projectId] ?? [])
              .filter((s) => s.worktreePath !== '' && s.worktreePath === p.overlays.pendingDelete?.session.worktreePath)
              .length
          : 0}
        deleting={p.overlays.deletingSessionId === p.overlays.pendingDelete?.session.id}
        onCancel={p.overlays.cancelDeleteAgent}
        onConfirm={p.overlays.confirmDeleteAgent}
      />
      <SettingsModal visible={p.overlays.showSettings} settings={p.settings} onSave={p.overlays.handleSaveSettings}
        onClose={() => p.overlays.setShowSettings(false)} onPreviewTheme={p.setPreviewThemeId} />
      <AboutOverlay visible={p.overlays.showAbout} version={p.overlays.appVersion}
        onClose={() => p.overlays.setShowAbout(false)} onViewReleaseNotes={p.updateLog.openReleaseNotes} />
      <UpdateLogOverlay
        visible={p.updateLog.visible}
        activeTab={p.updateLog.activeTab as never}
        currentVersion={p.updateLog.currentVersion}
        releaseNotes={p.updateLog.releaseNotes as never}
        log={p.updateLog.log as never}
        loading={p.updateLog.loading}
        error={p.updateLog.error}
        onClose={p.updateLog.close}
        onRefresh={() => { void p.updateLog.refresh() }}
        onClean={() => { void p.updateLog.clear() }}
        onCheckForUpdates={() => { void p.updateLog.checkForUpdates() }}
        onOpenExternal={() => { void p.updateLog.openReleaseNotesExternal() }}
        onSelectTab={p.updateLog.setActiveTab as never}
      />
      <NewWorkspaceModal
        visible={p.newWorkspaceVisible}
        projects={p.projects}
        projectError={p.projectError}
        defaultRuntime={p.defaultRuntime}
        onAddProject={() => p.addProject(undefined, { activate: false })}
        onCreate={(opts) => { void p.createWorkspace(opts); p.setNewWorkspaceVisible(false) }}
        onClose={() => p.setNewWorkspaceVisible(false)}
      />
      <AddWorkspaceProjectModal
        visible={p.addProjectWorkspaceId != null}
        workspace={p.workspaces.find((w) => w.id === p.addProjectWorkspaceId) ?? null}
        projects={p.projects}
        onAdd={async (workspaceId, projectIds) => {
          for (const pid of projectIds) await p.addProjectToWorkspace(workspaceId, pid)
          p.setAddProjectWorkspaceId(null)
        }}
        onClose={() => p.setAddProjectWorkspaceId(null)}
      />
      {p.updateNotification.updateReady && (
        <UpdateToast version={p.updateNotification.version} onRestart={p.updateNotification.install}
          onDismiss={p.updateNotification.dismiss}
          onViewReleaseNotes={() => p.updateLog.openReleaseNotes(p.updateNotification.version ?? undefined)} />
      )}
      {p.themeChangeNotice.show && (
        <ThemeChangeToast mode={p.themeChangeNotice.mode} onDismiss={p.themeChangeNotice.dismiss} />
      )}
      {(p.appEffects.showOnboarding || p.appEffects.creatingProject) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg-primary)' }}>
          <OnboardingView variant="no-project" onAddProject={() => void p.handleAddProjectFromOnboarding()}
            onCloneProject={p.handleCloneFromOnboarding}
            onCreateNewProject={(desc) => void p.handleCreateNewProject(desc)}
            creatingProject={p.appEffects.creatingProject}
            cloningProject={p.appEffects.cloningProject} createError={p.projectError}
            onBack={() => p.appEffects.setShowOnboarding(false)} />
        </div>
      )}
      <PluginUiHost />
    </div>
  )
}
