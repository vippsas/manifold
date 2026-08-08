import React, { useMemo } from 'react'
import type { Project } from '../../../../shared/types'
import type { Workspace } from '../../../../shared/workspace-types'
import { FileTree } from '../file-tree/FileTree'
import { useWorkspaceTree, type FolderSource } from '../../../hooks/editor/useWorkspaceTree'
import { useDockState } from './dock-panel-types'

/** Runs `op`, then reloads the folder it just changed.
 *
 *  The file IPC answers with the *selected* session's tree, which is not this
 *  folder's — so a create or delete here would otherwise stay on screen until
 *  something else refreshed it. */
function withRefresh<A extends unknown[], R>(
  op: ((...args: A) => R) | undefined,
  refresh: () => void,
): ((...args: A) => R) | undefined {
  if (!op) return undefined
  return (...args: A): R => {
    const result = op(...args)
    void Promise.resolve(result).finally(refresh)
    return result
  }
}

/** Where a sidebar folder's files live on disk: the workspace's own checkout of
 *  the repo, or the clone itself on a home workspace — the same chain the folder
 *  row itself uses for its tooltip (`WorkspaceRepoRow.tsx:47`). */
function folderPath(source: FolderSource, workspaces: Workspace[], projects: Project[]): string | null {
  if (source.kind === 'session') return null
  const workspace = workspaces.find((w) => w.id === source.workspaceId)
  const path = workspace?.worktreePaths?.[source.id] ?? projects.find((p) => p.id === source.id)?.path
  return path ? path.replace(/\/$/, '') : null
}

/** The files of one sidebar folder: a repo's checkout, or an agent's worktree. */
export function FolderFilesTree({ source }: { source: FolderSource }): React.JSX.Element {
  const s = useDockState()
  // Only one folder has a watcher behind it: the one the selected agent works
  // in. Which folder that is, is a question about paths — a workspace owns the
  // checkout its agents share, so the agent's folder appears in the sidebar as
  // an ordinary repo row, with no session id of its own to match on.
  const watchedPath = s.worktreeRootPath?.replace(/\/$/, '') ?? null
  const path = folderPath(source, s.workspaces, s.projects)
  const isLive = source.kind === 'session'
    ? source.id === s.sessionId
    : path !== null && path === watchedPath

  return isLive ? <LiveFolderTree /> : <StaticFolderTree source={source} />
}

/** The folder the selected agent works in — watched, so it carries change
 *  badges and updates itself as the agent works.
 *
 *  Its tree alone: the agent's other folders (the workspace's other repos,
 *  reaching it as add-dirs) each have a sidebar row of their own, and passing
 *  them here would repeat them under this row. */
function LiveFolderTree(): React.JSX.Element {
  const s = useDockState()
  const openFilePaths = useMemo(() => new Set(s.openFiles.map((file) => file.path)), [s.openFiles])

  return (
    <FileTree
      showToolbar={false}
      flattenRoots
      tree={s.tree}
      changes={s.changes}
      activeFilePath={s.activeFilePath}
      openFilePaths={openFilePaths}
      expandedPaths={s.expandedPaths}
      onToggleExpand={s.onToggleExpand}
      onSelectFile={s.onSelectFileFromFileTree}
      onDeleteFile={s.onDeleteFile}
      onRenameFile={s.onRenameFile}
      onCreateFile={s.onCreateFile}
      onCreateDir={s.onCreateDir}
      onRefresh={s.onRefreshFileTree}
      onImportPaths={s.onImportPaths}
      onPasteImage={s.onPasteImage}
      onPasteClipboardImage={s.onPasteClipboardImage}
      onMovePath={s.onMovePath}
      onRevealInFinder={s.onRevealInFinder}
      onOpenInTerminal={s.onOpenInTerminal}
      onCopyAbsolutePath={s.onCopyAbsolutePath}
      onCopyRelativePath={s.onCopyRelativePath}
      onOpenFileToSide={(path) => s.onOpenSearchResultInSplit({ path, sessionId: s.sessionId })}
      worktreeRootPath={s.worktreeRootPath}
    />
  )
}

/** Every other folder on screen. Its files open and edit like any other — the
 *  main process authorizes them against the folders the user has open — but no
 *  watcher follows it, so it has no change badges and reloads on demand. */
function StaticFolderTree({ source }: { source: FolderSource }): React.JSX.Element {
  const s = useDockState()
  const folder = useWorkspaceTree(source)
  const openFilePaths = useMemo(() => new Set(s.openFiles.map((file) => file.path)), [s.openFiles])

  return (
    <FileTree
      showToolbar={false}
      flattenRoots
      tree={folder.tree}
      changes={[]}
      activeFilePath={s.activeFilePath}
      openFilePaths={openFilePaths}
      expandedPaths={folder.expandedPaths}
      onToggleExpand={folder.onToggleExpand}
      onSelectFile={s.onSelectFileFromFileTree}
      onDeleteFile={withRefresh(s.onDeleteFile, folder.refresh)}
      onRenameFile={withRefresh(s.onRenameFile, folder.refresh)}
      onCreateFile={withRefresh(s.onCreateFile, folder.refresh)}
      onCreateDir={withRefresh(s.onCreateDir, folder.refresh)}
      onRefresh={folder.refresh}
      onImportPaths={withRefresh(s.onImportPaths, folder.refresh)}
      onPasteImage={withRefresh(s.onPasteImage, folder.refresh)}
      onPasteClipboardImage={withRefresh(s.onPasteClipboardImage, folder.refresh)}
      onMovePath={withRefresh(s.onMovePath, folder.refresh)}
      onRevealInFinder={s.onRevealInFinder}
      onOpenInTerminal={s.onOpenInTerminal}
      onCopyAbsolutePath={s.onCopyAbsolutePath}
      onCopyRelativePath={s.onCopyRelativePath}
      onOpenFileToSide={(path) => s.onOpenSearchResultInSplit({ path, sessionId: s.sessionId })}
      worktreeRootPath={folder.tree?.path}
    />
  )
}
