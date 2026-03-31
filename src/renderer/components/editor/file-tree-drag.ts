import { getRelativePath } from '../../../shared/relative-path'

export const AGENT_PATH_DRAG_MIME = 'application/x-manifold-file-tree-path'
export const FILE_TREE_DRAG_MIME = AGENT_PATH_DRAG_MIME

export function getDraggedTreePath(nodePath: string, rootPath: string): string {
  return getRelativePath(nodePath, rootPath)
}

export function writeAgentPathDragData(dataTransfer: DataTransfer, relativePath: string): void {
  dataTransfer.effectAllowed = 'copy'
  dataTransfer.setData(AGENT_PATH_DRAG_MIME, relativePath)
  dataTransfer.setData('text/plain', relativePath)
}

export const writeFileTreeDragData = writeAgentPathDragData

export function hasAgentPathDragData(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes(AGENT_PATH_DRAG_MIME)
}

export const hasFileTreeDragData = hasAgentPathDragData

export function readAgentPathDragData(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) return null
  const relativePath = dataTransfer.getData(AGENT_PATH_DRAG_MIME).trim()
  return relativePath || null
}

export const readFileTreeDragData = readAgentPathDragData
