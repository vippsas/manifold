import { basename, resolve } from 'node:path'
import type { CodeSearchResult, SearchQueryRequest } from '../../shared/search-types'
import type { AgentSession } from '../../shared/types'

export type CodeSearchRootKind = 'worktree' | 'additional-dir'

export interface CodeSearchRoot {
  path: string
  kind: CodeSearchRootKind
  session: AgentSession
}

export interface CodeSearchResponse {
  results: CodeSearchResult[]
  warnings: string[]
}

export function buildCodeSearchRoots(
  sessions: AgentSession[],
  request: SearchQueryRequest,
): CodeSearchRoot[] {
  const includeAdditionalDirs = (
    request.scope.kind === 'visible-roots' ||
    request.scope.includeAdditionalDirs === true
  )

  const roots: CodeSearchRoot[] = []
  const seen = new Set<string>()

  for (const session of sessions) {
    pushRoot(roots, seen, {
      path: session.worktreePath,
      kind: 'worktree',
      session,
    })

    if (!includeAdditionalDirs) continue

    for (const additionalDir of session.additionalDirs) {
      pushRoot(roots, seen, {
        path: additionalDir,
        kind: 'additional-dir',
        session,
      })
    }
  }

  return roots
}

export function createCodeSearchResult(
  root: CodeSearchRoot,
  relativePath: string,
  line: number,
  column: number | undefined,
  snippet: string,
  matchIndex: number,
): CodeSearchResult {
  const cleanRelativePath = relativePath.replace(/^\.\//, '')
  const filePath = resolve(root.path, cleanRelativePath)
  const displayRelativePath = root.kind === 'additional-dir'
    ? `[${basename(root.path)}] ${cleanRelativePath}`
    : cleanRelativePath

  return {
    id: `${root.session.id}:${root.path}:${cleanRelativePath}:${line}:${column ?? 1}:${matchIndex}`,
    source: 'code',
    title: displayRelativePath,
    snippet,
    projectId: root.session.projectId,
    filePath,
    rootPath: root.path,
    relativePath: displayRelativePath,
    line,
    column,
    sessionId: root.session.id,
    branchName: root.session.branchName,
    runtimeId: root.session.runtimeId,
  }
}

export function sortAndLimitCodeResults(results: CodeSearchResult[], limit: number): CodeSearchResult[] {
  const deduped = new Map<string, CodeSearchResult>()
  for (const result of results) {
    const key = `${resolve(result.filePath)}:${result.line}:${result.column ?? 1}`
    if (!deduped.has(key)) {
      deduped.set(key, result)
    }
  }

  return [...deduped.values()]
    .sort((left, right) => {
      const leftBranch = left.branchName ?? ''
      const rightBranch = right.branchName ?? ''
      if (leftBranch !== rightBranch) return leftBranch.localeCompare(rightBranch)
      if (left.relativePath !== right.relativePath) return left.relativePath.localeCompare(right.relativePath)
      if (left.line !== right.line) return left.line - right.line
      return (left.column ?? 1) - (right.column ?? 1)
    })
    .slice(0, limit)
}

function pushRoot(
  roots: CodeSearchRoot[],
  seen: Set<string>,
  root: CodeSearchRoot,
): void {
  const key = resolve(root.path)
  if (seen.has(key)) return
  seen.add(key)
  roots.push(root)
}
