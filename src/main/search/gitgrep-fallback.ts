import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { SearchQueryRequest } from '../../shared/search-types'
import {
  createCodeSearchResult,
  type CodeSearchResponse,
  type CodeSearchRoot,
} from './search-engine'
import { getSearchRootLimit } from './search-root-limit'

const execFileAsync = promisify(execFile)

export async function searchWithGitGrepFallback(
  roots: CodeSearchRoot[],
  request: SearchQueryRequest,
  limit: number,
): Promise<CodeSearchResponse> {
  const warnings: string[] = []
  const rootLimit = getSearchRootLimit(limit, roots.length)

  const settled = await Promise.all(
    roots.map(async (root) => {
      try {
        return await searchRootWithGitGrep(root, request, rootLimit)
      } catch (error: unknown) {
        if (isGitGrepNoMatch(error)) {
          return []
        }
        if (isGitRepoError(error)) {
          warnings.push(`Skipped ${root.path}: git grep fallback only supports Git repositories.`)
          return []
        }
        throw error
      }
    }),
  )

  return {
    results: settled.flat(),
    warnings,
  }
}

async function searchRootWithGitGrep(
  root: CodeSearchRoot,
  request: SearchQueryRequest,
  limit: number,
) {
  const { stdout } = await execFileAsync('git', buildGitGrepArgs(request, limit), {
    cwd: root.path,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  })
  return parseGitGrepOutput(stdout, root, limit)
}

export function buildGitGrepArgs(request: SearchQueryRequest, limit: number): string[] {
  const args = [
    'grep',
    '-n',
    '-I',
    '--heading',
    '--break',
    '--max-count',
    String(Math.max(1, limit)),
  ]

  if (!request.caseSensitive) args.push('-i')
  if (request.wholeWord) args.push('-w')
  if (request.matchMode === 'literal') args.push('-F')
  else args.push('-G')

  args.push('--', request.query.trim())
  return args
}

function parseGitGrepOutput(stdout: string, root: CodeSearchRoot, limit: number) {
  const results = []
  const blocks = stdout.split('\n\n')

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.length > 0)
    if (lines.length === 0) continue

    const relativePath = lines[0]
    for (let index = 1; index < lines.length && index <= limit; index += 1) {
      const firstColon = lines[index].indexOf(':')
      if (firstColon === -1) continue

      const lineText = lines[index].slice(0, firstColon)
      const line = Number.parseInt(lineText, 10)
      if (!Number.isFinite(line)) continue

      const snippet = lines[index].slice(firstColon + 1)
      results.push(
        createCodeSearchResult(root, relativePath, line, undefined, snippet, index),
      )
    }
  }

  return results
}

function isGitGrepNoMatch(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: number }).code === 1
  )
}

function isGitRepoError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const stderr = 'stderr' in error ? (error as { stderr?: string }).stderr ?? '' : ''
  const code = 'code' in error ? (error as { code?: number }).code : undefined
  return code === 128 && stderr.toLowerCase().includes('not a git repository')
}
