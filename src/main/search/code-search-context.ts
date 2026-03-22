import { readFile } from 'node:fs/promises'
import type { CodeSearchResult } from '../../shared/search-types'

export const DEFAULT_CODE_SEARCH_CONTEXT_LINES = 1

export async function attachContextToCodeResults(
  results: CodeSearchResult[],
  contextLines: number = DEFAULT_CODE_SEARCH_CONTEXT_LINES,
): Promise<CodeSearchResult[]> {
  const normalizedContextLines = Math.max(0, contextLines)
  if (results.length === 0 || normalizedContextLines === 0) {
    return results
  }

  const fileContents = new Map<string, string[] | null>()
  await Promise.all(
    [...new Set(results.map((result) => result.filePath))].map(async (filePath) => {
      try {
        const content = await readFile(filePath, 'utf8')
        fileContents.set(filePath, content.split(/\r?\n/))
      } catch {
        fileContents.set(filePath, null)
      }
    }),
  )

  return results.map((result) => {
    const lines = fileContents.get(result.filePath) ?? null
    return applyContextToCodeResult(result, lines, normalizedContextLines)
  })
}

export function applyContextToCodeResult(
  result: CodeSearchResult,
  lines: string[] | null,
  contextLines: number,
): CodeSearchResult {
  if (!lines || lines.length === 0 || contextLines <= 0) {
    return result
  }

  const lineIndex = result.line - 1
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return result
  }

  const beforeStart = Math.max(0, lineIndex - contextLines)
  const afterEnd = Math.min(lines.length, lineIndex + contextLines + 1)

  return {
    ...result,
    snippet: lines[lineIndex] ?? result.snippet,
    contextBefore: lines.slice(beforeStart, lineIndex),
    contextAfter: lines.slice(lineIndex + 1, afterEnd),
  }
}
