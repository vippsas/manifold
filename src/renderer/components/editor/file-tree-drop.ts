export function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types).includes('Files')
}

export function resolveDropDirectory(
  target: EventTarget | null,
  fallbackDir: string | null
): string | null {
  const element = target instanceof Element ? target : null

  const nodeElement = element?.closest<HTMLElement>('[data-tree-path]')
  const nodePath = nodeElement?.dataset.treePath
  if (nodePath) {
    return nodeElement?.dataset.treeIsDirectory === 'true'
      ? nodePath
      : parentDir(nodePath)
  }

  const rootElement = element?.closest<HTMLElement>('[data-tree-root-path]')
  const rootPath = rootElement?.dataset.treeRootPath
  return rootPath || fallbackDir || null
}

export function resolveDropRootPath(target: EventTarget | null): string | null {
  const element = target instanceof Element ? target : null
  const rootElement = element?.closest<HTMLElement>('[data-tree-root-path]')
  return rootElement?.dataset.treeRootPath ?? null
}

export function collectDroppedPaths(
  files: Iterable<File>,
  getPathForFile: (file: File) => string
): string[] {
  const seen = new Set<string>()
  const paths: string[] = []

  for (const file of files) {
    const externalPath = ((file as File & { path?: string }).path ?? getPathForFile(file)).trim()
    if (!externalPath || seen.has(externalPath)) continue
    seen.add(externalPath)
    paths.push(externalPath)
  }

  return paths
}

export function describeDropTarget(dirPath: string | null): string {
  if (!dirPath) return 'project root'
  const parts = dirPath.split('/').filter(Boolean)
  return parts.at(-1) ?? dirPath
}

export interface MoveValidation {
  ok: boolean
  reason?: string
  newPath?: string
}

export function validateInternalMove(
  sourcePath: string,
  sourceRoot: string,
  targetDir: string,
  targetRoot: string | null,
): MoveValidation {
  if (!targetDir) return { ok: false, reason: 'No drop target.' }
  if (!sourcePath) return { ok: false, reason: 'No source path.' }
  if (targetRoot && targetRoot !== sourceRoot) {
    return { ok: false, reason: 'Cannot move across worktrees.' }
  }
  const sourceParent = parentDir(sourcePath)
  const baseName = sourcePath.slice(sourcePath.lastIndexOf('/') + 1)
  const newPath = targetDir === '/' ? `/${baseName}` : `${targetDir}/${baseName}`
  if (newPath === sourcePath) {
    return { ok: false, reason: 'Already in this folder.' }
  }
  if (sourceParent === targetDir) {
    return { ok: false, reason: 'Already in this folder.' }
  }
  if (targetDir === sourcePath || targetDir.startsWith(`${sourcePath}/`)) {
    return { ok: false, reason: 'Cannot move a folder into itself.' }
  }
  return { ok: true, newPath }
}

function parentDir(filePath: string): string {
  const separatorIndex = filePath.lastIndexOf('/')
  if (separatorIndex < 0) return ''
  if (separatorIndex === 0) return '/'
  return filePath.slice(0, separatorIndex)
}
