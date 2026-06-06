import type { FileTreeNode } from '../../../shared/types'
import type { ContextMenuAction } from './ContextMenu'
import type { FileTreeClipboard } from './useFileTreeClipboard'

type MenuItem = ContextMenuAction | 'separator'

export interface FileTreeMenuConfig {
  rootPath: string
  defaultDir: string
  createFile?: (parentPath: string, afterPath?: string) => void
  createFolder?: (parentPath: string, afterPath?: string) => void
  rename?: (path: string, name: string) => void
  requestDelete?: (path: string, name: string, isDirectory: boolean) => void
  copyAbsolutePath?: (path: string) => void
  copyRelativePath?: (path: string, rootPath: string) => void
  revealInFinder?: (path: string) => void
  openInTerminal?: (dir: string) => void
  openFileToSide?: (path: string) => void
  clipboard?: FileTreeClipboard
}

/** Collapse consecutive separators and drop leading/trailing ones, so that
 *  conditionally-omitted items never leave a dangling divider. */
function tidy(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = []
  for (const item of items) {
    if (item === 'separator') {
      if (out.length === 0 || out[out.length - 1] === 'separator') continue
    }
    out.push(item)
  }
  while (out.length && out[out.length - 1] === 'separator') out.pop()
  return out
}

/** Build the file-tree context menu for a target node (or empty space). */
export function buildFileTreeContextMenu(targetNode: FileTreeNode | null, cfg: FileTreeMenuConfig): MenuItem[] {
  const { clipboard } = cfg
  const items: MenuItem[] = []

  if (!targetNode) {
    if (cfg.createFile) items.push({ label: 'New File', action: () => cfg.createFile?.(cfg.defaultDir) })
    if (cfg.createFolder) items.push({ label: 'New Folder', action: () => cfg.createFolder?.(cfg.defaultDir) })
    if (clipboard?.hasClipboard) items.push({ label: 'Paste', action: () => void clipboard.paste(cfg.defaultDir) })
    return tidy(items)
  }

  const isDir = targetNode.isDirectory
  const dirPath = targetNode.path.substring(0, targetNode.path.lastIndexOf('/'))
  const pasteDir = isDir ? targetNode.path : dirPath

  if (cfg.createFile) items.push({ label: 'New File', action: () => cfg.createFile?.(dirPath, targetNode.path) })
  if (cfg.createFolder) items.push({ label: 'New Folder', action: () => cfg.createFolder?.(dirPath, targetNode.path) })

  items.push('separator')
  if (!isDir && cfg.openFileToSide) items.push({ label: 'Open to the Side', action: () => cfg.openFileToSide?.(targetNode.path) })
  if (cfg.rename) items.push({ label: 'Rename', action: () => cfg.rename?.(targetNode.path, targetNode.name) })
  if (cfg.requestDelete) items.push({ label: 'Delete', action: () => cfg.requestDelete?.(targetNode.path, targetNode.name, isDir) })

  if (clipboard) {
    items.push('separator')
    items.push({ label: 'Cut', action: () => clipboard.cut([targetNode]) })
    items.push({ label: 'Copy', action: () => clipboard.copy([targetNode]) })
    if (clipboard.hasClipboard) items.push({ label: 'Paste', action: () => void clipboard.paste(pasteDir) })
  }

  items.push('separator')
  if (cfg.copyAbsolutePath) items.push({ label: 'Copy Absolute Path', action: () => cfg.copyAbsolutePath?.(targetNode.path) })
  if (cfg.copyRelativePath) items.push({ label: 'Copy Relative Path', action: () => cfg.copyRelativePath?.(targetNode.path, cfg.rootPath) })

  items.push('separator')
  if (cfg.revealInFinder) items.push({ label: 'Reveal in Finder', action: () => cfg.revealInFinder?.(targetNode.path) })
  if (cfg.openInTerminal) items.push({ label: 'Open in Terminal', action: () => cfg.openInTerminal?.(isDir ? targetNode.path : dirPath) })

  return tidy(items)
}
