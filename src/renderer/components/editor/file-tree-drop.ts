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

function parentDir(filePath: string): string {
  const separatorIndex = filePath.lastIndexOf('/')
  if (separatorIndex < 0) return ''
  if (separatorIndex === 0) return '/'
  return filePath.slice(0, separatorIndex)
}
