import React from 'react'
import { useFileDiff } from '../../../hooks/editor/useFileDiff'
import { CodeViewer } from '../code-viewer/CodeViewer'
import { ShellTabs } from '../../terminal/ShellTabs'
import { ProjectSidebar } from '../../sidebar/ProjectSidebar'
import { AgentPanel } from './dock-agent-panel'
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
  projects: ProjectsPanel,
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

  return (
    <CodeViewer
      paneId={paneId}
      sessionId={s.sessionId}
      fileDiffText={activeFileDiffText}
      originalContent={originalContent}
      openFiles={pane.openFiles}
      activeFilePath={pane.activeFilePath}
      fileContent={pane.fileContent}
      lastFileOpenRequest={s.lastFileOpenRequest}
      theme={s.theme}
      editorSettings={s.editorSettings}
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

function ShellPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <ShellTabs
      worktreeSessionId={s.worktreeShellSessionId}
      projectSessionId={s.projectShellSessionId}
      worktreeCwd={s.worktreeCwd}
      scrollbackLines={s.scrollbackLines}
      terminalFontFamily={s.terminalFontFamily}
      xtermTheme={s.xtermTheme}
    />
  )
}

function ProjectsPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <ProjectSidebar
      onOpenFolder={s.onOpenFolder}
      workspaces={s.workspaces}
      activeWorkspaceId={s.activeWorkspaceId}
    />
  )
}
