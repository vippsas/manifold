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
