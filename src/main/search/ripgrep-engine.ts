import { spawn } from 'node:child_process'
import type { CodeSearchResult, SearchQueryRequest } from '../../shared/search-types'
import { createCodeSearchResult, type CodeSearchRoot } from './search-engine'

const RIPGREP_TIMEOUT_MS = 10_000
const RIPGREP_STDERR_LIMIT = 2 * 1024

export async function searchWithRipgrep(
  roots: CodeSearchRoot[],
  request: SearchQueryRequest,
  limit: number,
): Promise<CodeSearchResult[]> {
  const rootLimit = Math.max(1, limit)
  const settled = await Promise.all(
    roots.map(async (root) => searchRootWithRipgrep(root, request, rootLimit))
  )
  return settled.flat()
}

export function isRipgrepUnavailable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}

async function searchRootWithRipgrep(
  root: CodeSearchRoot,
  request: SearchQueryRequest,
  limit: number,
): Promise<CodeSearchResult[]> {
  if (!request.query.trim()) return []

  const args = buildRipgrepArgs(request, limit)
  return new Promise((resolve, reject) => {
    const child = spawn('rg', args, {
      cwd: root.path,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const results: CodeSearchResult[] = []
    const stderrChunks: string[] = []
    let stdoutBuffer = ''
    let settled = false
    let killedForLimit = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, RIPGREP_TIMEOUT_MS)

    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }

    const flushStdout = (final: boolean): void => {
      const parts = stdoutBuffer.split('\n')
      if (!final) {
        stdoutBuffer = parts.pop() ?? ''
      } else {
        stdoutBuffer = ''
      }

      for (const line of parts) {
        const result = parseRipgrepLine(line, root, results.length)
        if (!result) continue

        results.push(result)
        if (results.length >= limit && !killedForLimit) {
          killedForLimit = true
          child.kill('SIGTERM')
          break
        }
      }
    }

    child.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString('utf8')
      flushStdout(false)
    })

    child.stderr?.on('data', (data: Buffer) => {
      const next = data.toString('utf8')
      const currentLength = stderrChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      if (currentLength >= RIPGREP_STDERR_LIMIT) return
      stderrChunks.push(next.slice(0, RIPGREP_STDERR_LIMIT - currentLength))
    })

    child.on('error', (error) => {
      settle(() => reject(error))
    })

    child.on('close', (code) => {
      flushStdout(true)

      settle(() => {
        if (killedForLimit || code === 0) {
          resolve(results.slice(0, limit))
          return
        }

        if (code === 1) {
          resolve([])
          return
        }

        const stderr = stderrChunks.join('').trim()
        const failure = timedOut
          ? `ripgrep timed out after ${RIPGREP_TIMEOUT_MS / 1000} seconds`
          : stderr || `ripgrep failed with exit code ${code ?? 'unknown'}`
        const error = Object.assign(new Error(failure), {
          code: timedOut ? 'ETIMEDOUT' : code,
          stderr,
        })
        reject(error)
      })
    })
  })
}

export function buildRipgrepArgs(request: SearchQueryRequest, limit: number): string[] {
  const args = [
    '--vimgrep',
    '--no-heading',
    '--color',
    'never',
    '--max-count',
    String(Math.max(1, limit)),
  ]

  if (!request.caseSensitive) args.push('-i')
  if (request.wholeWord) args.push('-w')
  if (request.matchMode === 'literal') args.push('-F')

  for (const glob of request.includeGlobs ?? []) {
    args.push('-g', glob)
  }
  for (const glob of request.excludeGlobs ?? []) {
    args.push('-g', `!${glob}`)
  }

  args.push(request.query.trim(), '.')
  return args
}

function parseRipgrepLine(
  line: string,
  root: CodeSearchRoot,
  matchIndex: number,
): CodeSearchResult | null {
  if (!line) return null

  const match = /^(.*?):(\d+):(\d+):(.*)$/.exec(line)
  if (!match) return null

  const [, relativePath, lineText, columnText, snippet] = match
  const lineNumber = Number.parseInt(lineText, 10)
  const column = Number.parseInt(columnText, 10)
  if (!Number.isFinite(lineNumber) || !Number.isFinite(column)) return null

  return createCodeSearchResult(
    root,
    relativePath,
    lineNumber,
    column,
    snippet,
    matchIndex,
  )
}
