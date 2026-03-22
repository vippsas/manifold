import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CodeSearchResult, SearchQueryRequest } from '../../shared/search-types'
import { createCodeSearchResult, type CodeSearchRoot } from './search-engine'
const execFileAsync = promisify(execFile)

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
  try {
    const { stdout } = await execFileAsync('rg', args, {
      cwd: root.path,
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return parseRipgrepOutput(stdout, root)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 1) {
      return []
    }
    throw error
  }
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

function parseRipgrepOutput(stdout: string, root: CodeSearchRoot): CodeSearchResult[] {
  const results: CodeSearchResult[] = []
  const lines = stdout.split('\n').filter((line) => line.length > 0)

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(.*?):(\d+):(\d+):(.*)$/.exec(lines[index])
    if (!match) continue

    const [, relativePath, lineText, columnText, snippet] = match
    const line = Number.parseInt(lineText, 10)
    const column = Number.parseInt(columnText, 10)
    if (!Number.isFinite(line) || !Number.isFinite(column)) continue

    results.push(
      createCodeSearchResult(
        root,
        relativePath,
        line,
        column,
        snippet,
        index,
      ),
    )
  }

  return results
}
