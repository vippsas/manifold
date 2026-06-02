import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { FileSearchResult, SearchQueryRequest } from '../../shared/search-types'
import type { AgentSession } from '../../shared/types'
import { fuzzyScore } from './fuzzy-match'
import { isRipgrepUnavailable } from './ripgrep-engine'
import { buildCodeSearchRoots, createFileSearchResult, type CodeSearchRoot } from './search-engine'

const execFileAsync = promisify(execFile)
const RIPGREP_TIMEOUT_MS = 10_000
const FILE_SCAN_CAP = 20_000
const DEFAULT_LIMIT = 100

interface FileListing {
  paths: string[]
  truncated: boolean
}

export interface FileSearchResponse {
  results: FileSearchResult[]
  warnings: string[]
}

export async function searchFilesInSessions(
  sessions: AgentSession[],
  request: SearchQueryRequest,
): Promise<FileSearchResponse> {
  const limit = request.limit ?? DEFAULT_LIMIT
  const roots = buildCodeSearchRoots(sessions, request)
  const query = request.query.trim()
  if (roots.length === 0 || !query) {
    return { results: [], warnings: [] }
  }

  const warnings: string[] = []
  const results: FileSearchResult[] = []
  let usedGitFallback = false

  for (const root of roots) {
    let listing: FileListing
    try {
      listing = await listFilesWithRipgrep(root, request)
    } catch (error: unknown) {
      if (!isRipgrepUnavailable(error)) throw error
      usedGitFallback = true
      listing = await listFilesWithGit(root, warnings)
    }

    if (listing.truncated) {
      warnings.push(`Filename search scanned the first ${FILE_SCAN_CAP} files in ${root.path}.`)
    }

    let matchIndex = 0
    for (const relativePath of listing.paths) {
      const match = fuzzyScore(query, relativePath)
      if (!match) continue
      results.push(createFileSearchResult(root, relativePath, match.score, match.indices, matchIndex))
      matchIndex += 1
    }
  }

  if (usedGitFallback) {
    warnings.unshift('Ripgrep is unavailable. Falling back to git ls-files for filename search.')
  }

  results.sort((left, right) => (
    (right.score ?? 0) - (left.score ?? 0) || left.relativePath.localeCompare(right.relativePath)
  ))
  return { results: results.slice(0, limit), warnings }
}

export function buildRipgrepFilesArgs(request: SearchQueryRequest): string[] {
  const args = ['--files', '--color', 'never']
  for (const glob of request.includeGlobs ?? []) args.push('-g', glob)
  for (const glob of request.excludeGlobs ?? []) args.push('-g', `!${glob}`)
  return args
}

function listFilesWithRipgrep(root: CodeSearchRoot, request: SearchQueryRequest): Promise<FileListing> {
  return new Promise((resolve, reject) => {
    const child = spawn('rg', buildRipgrepFilesArgs(request), {
      cwd: root.path,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const paths: string[] = []
    const stderrChunks: string[] = []
    let buffer = ''
    let truncated = false
    let settled = false

    const timer = setTimeout(() => child.kill('SIGTERM'), RIPGREP_TIMEOUT_MS)
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }

    const flush = (final: boolean): void => {
      const parts = buffer.split('\n')
      buffer = final ? '' : (parts.pop() ?? '')
      for (const line of parts) {
        if (!line) continue
        paths.push(line)
        if (paths.length >= FILE_SCAN_CAP && !truncated) {
          truncated = true
          child.kill('SIGTERM')
          break
        }
      }
    }

    child.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString('utf8')
      flush(false)
    })
    child.stderr?.on('data', (data: Buffer) => {
      if (stderrChunks.join('').length < 2048) stderrChunks.push(data.toString('utf8'))
    })
    child.on('error', (error) => settle(() => reject(error)))
    child.on('close', (code) => {
      flush(true)
      settle(() => {
        // code null = killed (limit/timeout); 0 = ok; 1 = no files matched globs.
        if (truncated || code === 0 || code === 1 || code === null) {
          resolve({ paths, truncated })
          return
        }
        const stderr = stderrChunks.join('').trim()
        reject(Object.assign(new Error(stderr || `ripgrep --files failed with exit code ${code}`), { code }))
      })
    })
  })
}

async function listFilesWithGit(root: CodeSearchRoot, warnings: string[]): Promise<FileListing> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files'], {
      cwd: root.path,
      timeout: RIPGREP_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    })
    const all = stdout.split('\n').filter(Boolean)
    return { paths: all.slice(0, FILE_SCAN_CAP), truncated: all.length > FILE_SCAN_CAP }
  } catch {
    warnings.push(`Skipped ${root.path}: filename search needs ripgrep or a Git repository.`)
    return { paths: [], truncated: false }
  }
}
