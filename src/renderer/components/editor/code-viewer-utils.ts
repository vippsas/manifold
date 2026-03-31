export interface FileDiff {
  filePath: string
  original: string
  modified: string
  lineCount: number
}

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss',
  html: 'html', xml: 'xml', py: 'python', rb: 'ruby',
  rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
  h: 'c', hpp: 'cpp', sh: 'shell', bash: 'shell', zsh: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', sql: 'sql',
  graphql: 'graphql', dockerfile: 'dockerfile',
  makefile: 'plaintext', gitignore: 'plaintext',
}

export function extensionToLanguage(filePath: string | null): string {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_MAP[ext] ?? 'plaintext'
}

export function isMarkdownFile(filePath: string | null): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'md' || ext === 'mdx' || ext === 'markdown'
}

export function isHtmlFile(filePath: string | null): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'html' || ext === 'htm'
}

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/

export function isExternalMarkdownHref(href: string | null | undefined): boolean {
  if (!href) return false
  if (href.startsWith('//')) return true
  if (!URL_SCHEME_PATTERN.test(href)) return false
  return !href.toLowerCase().startsWith('file:')
}

export function resolveMarkdownLinkedFilePath(currentFilePath: string, href: string | null | undefined): string | null {
  if (!href || href.startsWith('#') || isExternalMarkdownHref(href)) {
    return null
  }

  const resolved = resolveMarkdownFileUrl(currentFilePath, href)
  return resolved ? fileUrlToPath(resolved) : null
}

export function resolveMarkdownPreviewSource(currentFilePath: string, source: string | null | undefined): string | undefined {
  if (!source) return undefined
  if (source.startsWith('#') || isExternalMarkdownHref(source)) return source
  return resolveMarkdownFileUrl(currentFilePath, source)?.toString() ?? source
}

export function fileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

export interface FileTabLabel {
  name: string
  description: string
}

export function getFileTabLabels(filePaths: string[]): FileTabLabel[] {
  const labels = filePaths.map((path) => ({ name: fileName(path), description: '' }))
  const duplicateGroups = new Map<string, number[]>()

  for (let index = 0; index < filePaths.length; index++) {
    const name = labels[index].name
    const indices = duplicateGroups.get(name)
    if (indices) indices.push(index)
    else duplicateGroups.set(name, [index])
  }

  for (const indices of duplicateGroups.values()) {
    if (indices.length <= 1) continue

    const descriptions = getUniqueDirectorySuffixes(indices.map((index) => filePaths[index]))
    for (let i = 0; i < indices.length; i++) {
      labels[indices[i]].description = descriptions[i]
    }
  }

  return labels
}

function getUniqueDirectorySuffixes(filePaths: string[]): string[] {
  const directorySegments = filePaths.map((filePath) => splitPathSegments(parentPath(filePath)))
  const commonPrefixLength = getCommonPrefixLength(directorySegments)
  const relativeDirectorySegments = directorySegments.map((segments) => segments.slice(commonPrefixLength))
  const maxSegmentCount = Math.max(...relativeDirectorySegments.map((segments) => segments.length), 0)

  for (let segmentCount = 1; segmentCount <= maxSegmentCount; segmentCount++) {
    const candidates = relativeDirectorySegments.map((segments) => formatPathSuffix(segments, segmentCount))
    if (new Set(candidates).size === candidates.length) {
      return candidates
    }
  }

  return relativeDirectorySegments.map((segments) => segments.join('/'))
}

function parentPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) return ''
  return normalized.slice(0, lastSlash)
}

function splitPathSegments(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
}

function getCommonPrefixLength(allSegments: string[][]): number {
  if (allSegments.length === 0) return 0

  let prefixLength = 0
  while (true) {
    const candidate = allSegments[0][prefixLength]
    if (!candidate) return prefixLength
    if (allSegments.some((segments) => segments[prefixLength] !== candidate)) {
      return prefixLength
    }
    prefixLength++
  }
}

function formatPathSuffix(segments: string[], segmentCount: number): string {
  if (segments.length === 0) return ''
  return segments.slice(-segmentCount).join('/')
}

export function splitDiffByFile(diffText: string): FileDiff[] {
  if (!diffText.trim()) return []
  const fileChunks = diffText.split(/^(?=diff --git )/m).filter((c) => c.trim())
  return fileChunks.map(parseDiffChunk)
}

function parseDiffChunk(chunk: string): FileDiff {
  const headerMatch = chunk.match(/^diff --git a\/(.+?) b\//)
  const filePath = headerMatch?.[1] ?? 'unknown'
  const lines = chunk.split('\n')
  const originalLines: string[] = []
  const modifiedLines: string[] = []

  for (const line of lines) {
    if (isDiffMetaLine(line)) continue
    if (line.startsWith('-')) {
      originalLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      modifiedLines.push(line.slice(1))
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line
      originalLines.push(content)
      modifiedLines.push(content)
    }
  }

  return {
    filePath,
    original: originalLines.join('\n'),
    modified: modifiedLines.join('\n'),
    lineCount: Math.max(originalLines.length, modifiedLines.length),
  }
}

function isDiffMetaLine(line: string): boolean {
  return (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('---') ||
    line.startsWith('+++') ||
    line.startsWith('@@')
  )
}

function filePathToUrl(filePath: string): URL {
  const normalized = filePath.replace(/\\/g, '/')
  const pathname = normalized.startsWith('/') ? normalized : `/${normalized}`
  return new URL(`file://${encodeURI(pathname)}`)
}

function resolveMarkdownFileUrl(currentFilePath: string, href: string): URL | null {
  try {
    const resolved = href.toLowerCase().startsWith('file:')
      ? new URL(href)
      : new URL(href, filePathToUrl(currentFilePath))

    return resolved.protocol === 'file:' ? resolved : null
  } catch {
    return null
  }
}

function fileUrlToPath(url: URL): string {
  const pathname = decodeURIComponent(url.pathname)
  return /^\/[a-zA-Z]:\//.test(pathname) ? pathname.slice(1) : pathname
}

export interface LineRange {
  startLine: number
  endLine: number
}

export interface DiffLineRanges {
  added: LineRange[]
  modified: LineRange[]
  deleted: number[]
}

export function parseDiffToLineRanges(diffText: string): DiffLineRanges {
  if (!diffText.trim()) return { added: [], modified: [], deleted: [] }

  const added: LineRange[] = []
  const modified: LineRange[] = []
  const deleted: number[] = []

  const lines = diffText.split('\n')
  let modifiedLine = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      modifiedLine = parseInt(hunkMatch[1], 10)
      continue
    }

    if (modifiedLine === 0) continue

    if (line.startsWith('-') && !line.startsWith('---')) {
      const removeStart = i
      while (i + 1 < lines.length && lines[i + 1].startsWith('-') && !lines[i + 1].startsWith('---')) {
        i++
      }
      const removeCount = i - removeStart + 1

      const addStart = i + 1
      let addCount = 0
      while (addStart + addCount < lines.length && lines[addStart + addCount].startsWith('+') && !lines[addStart + addCount].startsWith('+++')) {
        addCount++
      }

      if (addCount > 0) {
        const paired = Math.min(removeCount, addCount)
        if (paired > 0) {
          modified.push({ startLine: modifiedLine, endLine: modifiedLine + paired - 1 })
        }
        if (addCount > paired) {
          added.push({ startLine: modifiedLine + paired, endLine: modifiedLine + addCount - 1 })
        }
        if (removeCount > paired) {
          deleted.push(modifiedLine + paired - 1)
        }
        modifiedLine += addCount
        i = addStart + addCount - 1
      } else {
        deleted.push(modifiedLine > 0 ? modifiedLine - 1 : 0)
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      const addStartLine = modifiedLine
      while (i + 1 < lines.length && lines[i + 1].startsWith('+') && !lines[i + 1].startsWith('+++')) {
        i++
        modifiedLine++
      }
      added.push({ startLine: addStartLine, endLine: modifiedLine })
      modifiedLine++
    } else if (!line.startsWith('\\')) {
      modifiedLine++
    }
  }

  return { added, modified, deleted }
}
