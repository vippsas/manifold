import { getRelativePath } from '../../../shared/relative-path'

export const AGENT_PATH_DRAG_MIME = 'application/x-manifold-file-tree-path'
export const FILE_TREE_DRAG_MIME = AGENT_PATH_DRAG_MIME
export const FILE_TREE_MOVE_MIME = 'application/x-manifold-file-tree-move'

export interface InternalMoveDragData {
  sourcePath: string
  rootPath: string
  isDirectory: boolean
}

export function getDraggedTreePath(nodePath: string, rootPath: string): string {
  return getRelativePath(nodePath, rootPath)
}

export function writeAgentPathDragData(
  dataTransfer: DataTransfer,
  relativePath: string,
  move?: InternalMoveDragData,
): void {
  dataTransfer.effectAllowed = move ? 'copyMove' : 'copy'
  dataTransfer.setData(AGENT_PATH_DRAG_MIME, relativePath)
  dataTransfer.setData('text/plain', relativePath)
  if (move) {
    dataTransfer.setData(FILE_TREE_MOVE_MIME, JSON.stringify(move))
  }
}

export const writeFileTreeDragData = writeAgentPathDragData

export function hasAgentPathDragData(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes(AGENT_PATH_DRAG_MIME)
}

export const hasFileTreeDragData = hasAgentPathDragData

export function hasInternalMoveDragData(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes(FILE_TREE_MOVE_MIME)
}

export function readAgentPathDragData(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) return null
  const relativePath = dataTransfer.getData(AGENT_PATH_DRAG_MIME).trim()
  return relativePath || null
}

export const readFileTreeDragData = readAgentPathDragData

export function readInternalMoveDragData(dataTransfer: DataTransfer | null): InternalMoveDragData | null {
  if (!dataTransfer) return null
  const raw = dataTransfer.getData(FILE_TREE_MOVE_MIME).trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<InternalMoveDragData>
    if (typeof parsed.sourcePath !== 'string' || typeof parsed.rootPath !== 'string') return null
    return {
      sourcePath: parsed.sourcePath,
      rootPath: parsed.rootPath,
      isDirectory: Boolean(parsed.isDirectory),
    }
  } catch {
    return null
  }
}
