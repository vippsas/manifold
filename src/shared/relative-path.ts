function normalizePath(path: string): string {
  if (!path) return ''
  const normalized = path.replace(/\/+/g, '/')
  if (normalized === '/') return '/'
  return normalized.replace(/\/$/, '')
}

function toSegments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean)
}

export function getRelativePath(filePath: string, rootPath: string): string {
  const normalizedFilePath = normalizePath(filePath)
  const normalizedRootPath = normalizePath(rootPath)

  if (!normalizedFilePath || !normalizedRootPath) {
    return normalizedFilePath || filePath
  }

  if (normalizedFilePath === normalizedRootPath) {
    return '.'
  }

  const fileSegments = toSegments(normalizedFilePath)
  const rootSegments = toSegments(normalizedRootPath)

  let sharedSegmentCount = 0
  while (
    sharedSegmentCount < fileSegments.length &&
    sharedSegmentCount < rootSegments.length &&
    fileSegments[sharedSegmentCount] === rootSegments[sharedSegmentCount]
  ) {
    sharedSegmentCount += 1
  }

  const parentSegments = new Array(rootSegments.length - sharedSegmentCount).fill('..')
  const childSegments = fileSegments.slice(sharedSegmentCount)
  const relativePath = [...parentSegments, ...childSegments].join('/')

  return relativePath || '.'
}
