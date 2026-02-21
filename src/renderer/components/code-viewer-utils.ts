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

export function fileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
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
