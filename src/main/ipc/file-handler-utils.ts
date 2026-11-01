import * as fs from 'node:fs'
import { extname, resolve } from 'node:path'
import type { AgentSession } from '../../shared/types'

/** Answers "may this session's request touch this path". */
export type PathGuard = (resolved: string, session: AgentSession) => boolean

export function isUnderDir(filePath: string, dir: string): boolean {
  const prefix = dir.endsWith('/') ? dir : dir + '/'
  return filePath === dir || filePath.startsWith(prefix)
}

export function resolvePasteTargetDir(session: AgentSession, dirPath: string, isAllowed: PathGuard): string {
  const resolvedDir = resolve(session.worktreePath, dirPath || session.worktreePath)
  if (!isAllowed(resolvedDir, session)) {
    throw new Error('Path traversal denied: directory outside allowed directories')
  }
  if (!fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Paste target is not a directory: ${resolvedDir}`)
  }
  return resolvedDir
}

export function decodeImageDataUrl(dataUrl: string): { ext: string; buffer: Buffer } {
  const match = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) throw new Error('Invalid image data URL')
  const mimeSubtype = match[1].toLowerCase()
  const allowed: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp' }
  const ext = allowed[mimeSubtype]
  if (!ext) throw new Error(`Unsupported image type: image/${mimeSubtype}`)
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.byteLength === 0) throw new Error('Empty image data')
  return { ext, buffer }
}

function nextPastedImagePath(dirPath: string, ext: string, session: AgentSession, isAllowed: PathGuard): string {
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const filePath = resolve(dirPath, `pasted-image${suffix}.${ext}`)
    if (!isUnderDir(filePath, dirPath) || !isAllowed(filePath, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    if (!fs.existsSync(filePath)) return filePath
  }
  throw new Error(`Could not choose a unique pasted image name in ${dirPath}`)
}

export function writePastedImage(session: AgentSession, dirPath: string, ext: string, buffer: Buffer, isAllowed: PathGuard): string {
  const filePath = nextPastedImagePath(dirPath, ext, session, isAllowed)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

export function readFileAsDataUrl(filePath: string): string {
  try {
    const data = fs.readFileSync(filePath)
    return `data:${mimeTypeForFile(filePath)};base64,${data.toString('base64')}`
  } catch (err) {
    throw new Error(`Failed to read file ${filePath}: ${(err as Error).message}`)
  }
}

function mimeTypeForFile(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.apng':
      return 'image/apng'
    case '.avif':
      return 'image/avif'
    case '.bmp':
      return 'image/bmp'
    case '.gif':
      return 'image/gif'
    case '.ico':
      return 'image/x-icon'
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

interface SearchMatch {
  line: number
  text: string
}

interface SearchFileResult {
  file: string
  matches: SearchMatch[]
}

export function parseGitGrepOutput(stdout: string, worktreePath: string): SearchFileResult[] {
  const results: SearchFileResult[] = []
  const blocks = stdout.split('\n\n')
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0)
    if (lines.length === 0) continue
    const filePath = lines[0]
    const matches: SearchMatch[] = []
    for (let i = 1; i < lines.length && matches.length < 50; i++) {
      const colonIdx = lines[i].indexOf(':')
      if (colonIdx === -1) continue
      const lineNum = parseInt(lines[i].substring(0, colonIdx), 10)
      if (isNaN(lineNum)) continue
      matches.push({ line: lineNum, text: lines[i].substring(colonIdx + 1) })
    }
    if (matches.length > 0) {
      results.push({ file: `${worktreePath}/${filePath}`, matches })
    }
  }
  return results
}
