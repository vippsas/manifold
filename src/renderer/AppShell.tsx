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
import { StatusBar } from './components/git/StatusBar'
import { CommitPanel } from './components/git/CommitPanel'
import { PRPanel } from './components/git/PRPanel'
import { ConflictPanel } from './components/git/ConflictPanel'
import { WelcomeDialog } from './components/modals/WelcomeDialog'
import { NewWorkspaceModal } from './components/modals/NewWorkspaceModal'
import { DockTab, EmptyWatermark } from './DockTab'
import { TitleBar } from './components/TitleBar'
import { DeleteAgentDialog } from './components/sidebar/DeleteAgentDialog'

export interface AppShellProps {
  themeClass: string
  densityClass: string
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
  createWorkspace: (opts: WorkspaceCreateOptions) => Promise<Workspace>
  // StatusBar dock layout adapter
  dockLayout: unknown
  onRenameActiveProject: (name: string) => void
  onToggleTheme: () => void
  themeFamily: 'manifold' | 'garfield'
  onSelectThemeFamily: (family: 'manifold' | 'garfield') => void
}

export function AppShell(p: AppShellProps): React.JSX.Element {
  const themeType: 'dark' | 'light' = p.themeClass === 'theme-light' ? 'light' : 'dark'
  if (!p.settings.setupCompleted) {
    return (
      <div className={`layout-root ${p.themeClass} ${p.densityClass}`}>
        <TitleBar themeType={themeType} onToggleTheme={p.onToggleTheme} themeFamily={p.themeFamily} onSelectThemeFamily={p.onSelectThemeFamily} />
        <WelcomeDialog onAddProject={() => void p.addProject()} onCloneProject={p.cloneProject} onComplete={p.overlays.handleSetupComplete} />
      </div>
    )
  }

  if (p.projects.length === 0) {
    return (
      <div className={`layout-root ${p.themeClass} ${p.densityClass}`}>
        <TitleBar themeType={themeType} onToggleTheme={p.onToggleTheme} themeFamily={p.themeFamily} onSelectThemeFamily={p.onSelectThemeFamily} />
        <OnboardingView variant="no-project" onAddProject={() => void p.handleAddProjectFromOnboarding()} onCloneProject={p.handleCloneFromOnboarding}
          onCreateNewProject={(desc) => void p.handleCreateNewProject(desc)} creatingProject={p.appEffects.creatingProject}
          cloningProject={p.appEffects.cloningProject} createError={p.projectError} />
      </div>
    )
  }

  const activeProjectName = p.projects.find((proj) => proj.id === p.activeProjectId)?.name

  return (
    <div className={`layout-root ${p.themeClass} ${p.densityClass}`}>
      <TitleBar projectName={activeProjectName} onRename={p.onRenameActiveProject} themeType={themeType} onToggleTheme={p.onToggleTheme} themeFamily={p.themeFamily} onSelectThemeFamily={p.onSelectThemeFamily} />
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
        onAddProject={() => p.addProject(undefined, { activate: false })}
        onCreate={(opts) => { void p.createWorkspace(opts); p.setNewWorkspaceVisible(false) }}
        onClose={() => p.setNewWorkspaceVisible(false)}
      />
      {p.updateNotification.updateReady && (
        <UpdateToast version={p.updateNotification.version} onRestart={p.updateNotification.install}
          onDismiss={p.updateNotification.dismiss}
          onViewReleaseNotes={() => p.updateLog.openReleaseNotes(p.updateNotification.version ?? undefined)} />
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
    </div>
  )
}
