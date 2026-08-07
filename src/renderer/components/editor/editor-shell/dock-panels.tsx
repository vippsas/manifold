import React, { useMemo } from 'react'
import { useFileDiff } from '../../../hooks/editor/useFileDiff'
import { useWorkspaceFileDiff } from '../../../hooks/editor/useWorkspaceFileDiff'
import { CodeViewer } from '../code-viewer/CodeViewer'
import { SourceControl } from '../../git/SourceControl'
import { SearchView } from '../../search/SearchView'
import { ShellTabs } from '../../terminal/ShellTabs'
import { resolveShellCwd } from '../../terminal/shell-cwd'
import { ProjectSidebar } from '../../sidebar/ProjectSidebar'
import { AgentPanel } from './dock-agent-panel'
import { EditorPaneActions } from './EditorPaneActions'
import { FolderFilesTree } from './FolderFilesTree'
import { PluginViewPanel } from '../plugins/PluginViewPanel'
import { PluginTreeViewPanel } from '../plugins/PluginTreeViewPanel'
import { getPanelComponents } from '../../../plugins/contribution-registry'
import { useDockState } from './dock-panel-types'
export type { DockAppState } from './dock-panel-types'
export { DockStateContext } from './dock-panel-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANEL_COMPONENTS: Record<string, React.FC<any>> = {
  agent: AgentPanel,
  editor: EditorPanel,
  shell: ShellPanel,
  sidebar: SidebarPanel,
  pluginView: PluginViewPanel,
  pluginTreeView: PluginTreeViewPanel,
  // Components for any built-in internal-contribution panels, sourced from the
  // contribution registry (src/renderer/plugins). Currently none — kept so a
  // future internal panel needs no per-id wiring here.
  ...getPanelComponents(),
}

function EditorPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const s = useDockState()
  const paneId = api.id
  const pane = s.getEditorPane(paneId)

  React.useEffect(() => {
    s.onRegisterEditorPane(paneId)
  }, [paneId, s])

  const { activeFileDiffText, originalContent } = useFileDiff(
    s.sessionId,
    s.diffText,
    pane.activeFilePath,
    s.worktreeRoot,
  )

  // A file opened from Source Control diffs against its checkout's HEAD
  // (uncommitted changes — VS Code's SCM click), not the session's base branch.
  const scmTarget =
    s.lastFileOpenRequest.source === 'sourceControl' &&
    s.lastFileOpenRequest.path === pane.activeFilePath
      ? s.lastFileOpenRequest.scm ?? null
      : null
  const workspaceFileDiff = useWorkspaceFileDiff(scmTarget)

  return (
    <CodeViewer
      paneId={paneId}
      sessionId={s.sessionId}
      fileDiffText={scmTarget ? workspaceFileDiff.diff : activeFileDiffText}
      originalContent={scmTarget ? workspaceFileDiff.original : originalContent}
      openFiles={pane.openFiles}
      activeFilePath={pane.activeFilePath}
      fileContent={pane.fileContent}
      lastFileOpenRequest={s.lastFileOpenRequest}
      theme={s.theme}
      editorSettings={s.editorSettings}
      headerActions={<EditorPaneActions paneId={paneId} />}
      onActivatePane={() => s.onActivateEditorPane(paneId)}
      onSelectTab={(filePath) => s.onSelectOpenFile(filePath, paneId)}
      onMoveTabToSplitPane={(filePath, direction) => s.onMoveFileToSplitPane(filePath, paneId, direction)}
      onOpenLinkedFile={(filePath) => s.onSelectFileFromMarkdownPreview(filePath, paneId)}
      onCloseTab={(filePath) => s.onCloseFile(filePath, paneId)}
      onCloseOtherTabs={(filePath) => s.onCloseOtherFiles(filePath, paneId)}
      onCloseAllTabs={() => s.onCloseAllFiles(paneId)}
      onSaveFile={s.onSaveFile}
    />
  )
}

/** The one sidebar column, showing whichever view the rail has selected. The
 *  views are swapped rather than each holding a column of its own, so only one
 *  is mounted at a time and none of them competes for the sidebar's width. */
function SidebarPanel(): React.JSX.Element {
  const s = useDockState()
  switch (s.sidebarView) {
    case 'sourceControl':
      return <SourceControlView />
    case 'search':
      return <SearchSidebarView />
    default:
      return <ExplorerView />
  }
}

function SourceControlView(): React.JSX.Element {
  const s = useDockState()
  const workspace = s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null
  return <SourceControl workspace={workspace} onSelectFile={s.onSelectScmFile} />
}

function SearchSidebarView(): React.JSX.Element {
  const s = useDockState()
  return (
    <SearchView
      activeProjectId={s.activeProjectId}
      activeSessionId={s.sessionId}
      allProjectSessions={s.allProjectSessions}
      onOpenSearchResult={s.onOpenSearchResult}
    />
  )
}

function ShellPanel(): React.JSX.Element {
  const s = useDockState()
  const cwd = resolveShellCwd(s.workspaces, s.activeWorkspaceId, s.activeProjectId, s.projects)
  return (
    <ShellTabs
      cwd={cwd}
      scrollbackLines={s.scrollbackLines}
      terminalFontFamily={s.terminalFontFamily}
      xtermTheme={s.xtermTheme}
      onHide={() => s.onClosePanel('shell')}
    />
  )
}

function ExplorerView(): React.JSX.Element {
  const s = useDockState()
  return (
    <ProjectSidebar
      projects={s.projects}
      activeProjectId={s.activeProjectId}
      outputtingSessionIds={s.outputtingSessionIds}
      onNewProject={s.onNewProject}
      onNewWorkspace={s.onNewWorkspace}
      workspaces={s.workspaces}
      activeWorkspaceId={s.activeWorkspaceId}
      sessionsByWorkspace={s.sessionsByWorkspace}
      onSelectWorkspace={s.onSelectWorkspace}
      onRenameWorkspace={s.onRenameWorkspace}
      onRemoveWorkspace={s.onRemoveWorkspace}
      onCopyWorkspace={s.onCopyWorkspace}
      onSelectWorkspaceRepo={s.onSelectWorkspaceRepo}
      onAddProjectToWorkspace={s.onAddProjectToWorkspace}
      onRemoveProjectFromWorkspace={s.onRemoveProjectFromWorkspace}
      behindCounts={s.behindCounts}
      onProjectFetched={s.onProjectFetched}
      drafts={s.drafts}
      activeDraftId={s.activeDraft?.id ?? null}
      onSelectDraft={(id) => s.onSelectSession(id, s.activeProjectId ?? '')}
      onDiscardDraft={s.discardDraft}
      renderFolderFiles={(source) => <FolderFilesTree source={source} />}
    />
  )
}
