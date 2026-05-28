export function fileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

export function parentPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) return ''
  return normalized.slice(0, lastSlash)
}

export function splitPathSegments(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
}
