import React from 'react'
import { DockviewReact, type DockviewApi, type DockviewTheme } from 'dockview'
import type { Project, AgentSession, ManifoldSettings, FileChange, CreateProjectOptions } from '../shared/types'
import type { Workspace, WorkspaceCreateOptions } from '../shared/workspace-types'
import type { DockAppState } from './components/editor/editor-shell/dock-panel-types'
import type { UseAppOverlaysResult } from './hooks/app/useAppOverlays'
import type { UseGitOperationsResult } from './hooks/editor/useGitOperations'
import type { UseUpdateLogResult } from '../shared/useUpdateLog'
import { PANEL_COMPONENTS, DockStateContext } from './components/editor/editor-shell/dock-panels'
import { ShellHeaderActions } from './components/terminal/ShellHeaderActions'
import { AgentHeaderActions } from './components/editor/editor-shell/AgentHeaderActions'
import { WorkspaceHeaderActions } from './components/editor/editor-shell/WorkspaceHeaderActions'
import { OnboardingView } from './components/modals/OnboardingView'
import { DashboardHomeView } from './components/home/DashboardHomeView'
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
import { AddRepositoryModal } from './components/modals/AddRepositoryModal'
import { NewWorkspaceModal } from './components/modals/NewWorkspaceModal'
import { NewAgentModal } from './components/modals/NewAgentModal'
import { DockTab, EmptyWatermark } from './DockTab'
import { ActivityBar, type ActivityBarProps } from './components/ActivityBar'
import type { SidebarViewId } from './components/sidebar/sidebar-views'
import { TitleBar } from './components/TitleBar'
import { DeleteAgentDialog } from './components/sidebar/DeleteAgentDialog'
import { useLoadPluginContributions } from './plugins/use-contributions'
import { PluginUiHost } from './components/plugin-ui/PluginUiHost'
import { SearchModal } from './components/search/SearchModal'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { ShortcutsCheatSheet } from './components/command-palette/ShortcutsCheatSheet'

/** The dockview theme: our CSS classes plus a small gap between panel groups,
 *  which — with the rounded-card group styling in dockview-theme.css — makes
 *  each panel read as a floating card on a recessed canvas. */
const DOCK_THEME: DockviewTheme = {
  name: 'manifold',
  className: 'dockview-theme-dark dockview-theme-manifold',
  gap: 6,
}

/** An agent belongs to a workspace and to nothing smaller, so that is all the
 *  New Agent dialog needs to be aimed. */
export interface NewAgentTarget {
  workspaceId: string
}

/** Dockview takes one left-header component for every group; each of these
 *  renders null outside its own group (agent tabs vs. shell tabs). */
function LeftHeaderActions(props: React.ComponentProps<typeof ShellHeaderActions>): React.JSX.Element {
  return (
    <>
      <AgentHeaderActions {...props} />
      <ShellHeaderActions {...props} />
    </>
  )
}

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
  gitOps: UseGitOperationsResult
  updateLog: UseUpdateLogResult
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
  newAgentTarget: NewAgentTarget | null
  closeNewAgentModal: () => void
  // Workspace modal wiring
  newWorkspaceVisible: boolean
  setNewWorkspaceVisible: (v: boolean) => void
  defaultRuntime: string
  createWorkspace: (opts: WorkspaceCreateOptions) => Promise<Workspace>
  workspaces: Workspace[]
  // StatusBar dock layout adapter
  dockLayout: unknown
  /** Which view the one sidebar shows — the activity rail switches it. */
  sidebarView: SidebarViewId
  onSelectSidebarView: (id: SidebarViewId) => void
  onRenameActiveProject: (name: string) => void
  runCommand: (id: string) => void
}

export function AppShell(p: AppShellProps): React.JSX.Element {
  useLoadPluginContributions()
  if (!p.settings.setupCompleted) {
    return (
      <div className={`layout-root ${p.themeClass}`}>
        <TitleBar />
        <WelcomeDialog onAddProject={() => void p.addProject()} onCloneProject={p.cloneProject} onComplete={p.overlays.handleSetupComplete} />
      </div>
    )
  }

  if (p.projects.length === 0) {
    return (
      <div className={`layout-root ${p.themeClass}`}>
        <TitleBar />
        <OnboardingView variant="no-project" onAddProject={() => void p.handleAddProjectFromOnboarding()} onCloneProject={p.handleCloneFromOnboarding}
          onCreateNewProject={p.handleCreateNewProject} creatingProject={p.appEffects.creatingProject}
          cloningProject={p.appEffects.cloningProject} createError={p.projectError} />
      </div>
    )
  }

  const activeProjectName = p.projects.find((proj) => proj.id === p.activeProjectId)?.name
  const newAgentWorkspace = p.workspaces.find((workspace) => workspace.id === p.newAgentTarget?.workspaceId) ?? null

  return (
    <div className={`layout-root ${p.themeClass}`}>
      <TitleBar projectName={activeProjectName} />
      <div className="layout-main">
        <div className="layout-workbench">
          <ActivityBar
            dockLayout={p.dockLayout as ActivityBarProps['dockLayout']}
            sidebarView={p.sidebarView}
            onSelectSidebarView={p.onSelectSidebarView}
            hasActiveSession={p.activeSessionId != null}
            onOpenSettings={() => p.overlays.setShowSettings(true)}
          />
          <DockStateContext.Provider value={p.dockState}>
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative', padding: 'var(--space-xs)', background: 'var(--dock-canvas)' }}>
              <DockviewReact
                theme={DOCK_THEME}
                className={!p.activeSessionId ? 'dockview-minimal' : ''}
                components={PANEL_COMPONENTS}
                onReady={(e) => p.onDockReady(e.api)}
                defaultTabComponent={DockTab}
                leftHeaderActionsComponent={LeftHeaderActions}
                rightHeaderActionsComponent={WorkspaceHeaderActions}
                watermarkComponent={EmptyWatermark}
              />
              {p.overlays.showDashboard && (
                <DashboardHomeView
                  onClose={() => p.overlays.setShowDashboard(false)}
                  initialCard={p.overlays.dashboardInitialCard}
                />
              )}
            </div>
          </DockStateContext.Provider>
        </div>
        <StatusBar
          activeSession={p.activeSession}
          changedFiles={p.mergedChanges}
          baseBranch={p.baseBranch}
          projectIsGit={p.activeProjectIsGit}
          conflicts={p.gitOps.conflicts as never}
          aheadBehind={p.gitOps.aheadBehind as never}
          onCommit={() => p.overlays.setActivePanel('commit')}
          onCreatePR={() => p.overlays.setActivePanel('pr')}
          onShowConflicts={() => p.overlays.setActivePanel('conflicts')}
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
        deleting={p.overlays.deletingSessionId === p.overlays.pendingDelete?.session.id}
        onCancel={p.overlays.cancelDeleteAgent}
        onConfirm={p.overlays.confirmDeleteAgent}
      />
      <NewAgentModal
        visible={p.newAgentTarget != null}
        workspace={newAgentWorkspace}
        defaultRuntime={p.defaultRuntime}
        defaultAgentMode={p.settings.defaultAgentMode ?? 'interactive'}
        onLaunch={async (options) => {
          if (!newAgentWorkspace || !p.dockState.onLaunchWorkspaceAgent) return null
          return p.dockState.onLaunchWorkspaceAgent(newAgentWorkspace.id, options)
        }}
        onClose={p.closeNewAgentModal}
      />
      <SettingsModal visible={p.overlays.showSettings} settings={p.settings} onSave={p.overlays.handleSaveSettings}
        onClose={() => p.overlays.setShowSettings(false)} onPreviewTheme={p.setPreviewThemeId} />
      <SearchModal
        visible={p.overlays.showSearch}
        onClose={p.overlays.closeSearch}
        activeProjectId={p.dockState.activeProjectId}
        activeSessionId={p.dockState.sessionId}
        allProjectSessions={p.dockState.allProjectSessions}
        onOpenSearchResult={p.dockState.onOpenSearchResult}
        requestedMode={p.overlays.searchMode}
      />
      <CommandPalette visible={p.overlays.showCommandPalette} onRun={p.runCommand}
        onClose={() => p.overlays.setShowCommandPalette(false)} />
      <ShortcutsCheatSheet visible={p.overlays.showShortcuts} onClose={() => p.overlays.setShowShortcuts(false)} />
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
        onAddProject={() => p.addProject()}
        onCreate={(opts) => { void p.createWorkspace(opts); p.setNewWorkspaceVisible(false) }}
        onClose={() => p.setNewWorkspaceVisible(false)}
      />
      {p.updateNotification.updateReady && (
        <UpdateToast version={p.updateNotification.version} onRestart={p.updateNotification.install}
          onDismiss={p.updateNotification.dismiss}
          onViewReleaseNotes={() => p.updateLog.openReleaseNotes(p.updateNotification.version ?? undefined)} />
      )}
      {p.themeChangeNotice.show && (
        <ThemeChangeToast mode={p.themeChangeNotice.mode} onDismiss={p.themeChangeNotice.dismiss} />
      )}
      <AddRepositoryModal
        visible={p.appEffects.showOnboarding || p.appEffects.creatingProject}
        onAddProject={() => void p.handleAddProjectFromOnboarding()}
        onCloneProject={p.handleCloneFromOnboarding}
        onCreateNewProject={p.handleCreateNewProject}
        creatingProject={p.appEffects.creatingProject}
        cloningProject={p.appEffects.cloningProject}
        createError={p.projectError}
        onClose={() => p.appEffects.setShowOnboarding(false)}
      />
      <PluginUiHost />
    </div>
  )
}
