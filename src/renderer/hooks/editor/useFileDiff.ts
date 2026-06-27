import { useState, useMemo, useEffect } from 'react'
import type { FileChange } from '../../../shared/types'

export function mergeFileChanges(
  changedFiles: FileChange[],
  watcherChanges: FileChange[],
): FileChange[] {
  // Base-branch diffs describe what this branch changed vs its base; watcher
  // entries describe live `git status` changes. Tag each by source so the file
  // tree can show a faint dot for branch-only changes and a letter for direct
  // working-tree changes. Watcher entries are added last, so a committed-then-
  // edited path correctly reads as worktree-dirty.
  const map = new Map<string, FileChange>()
  for (const change of changedFiles) map.set(change.path, { ...change, worktreeDirty: false })
  for (const change of watcherChanges) map.set(change.path, { ...change, worktreeDirty: true })
  return Array.from(map.values())
}

export interface UseFileDiffResult {
  activeFileDiffText: string | null
  originalContent: string | null
}

export function useFileDiff(
  activeSessionId: string | null,
  diff: string,
  activeFilePath: string | null,
  treePath: string | null,
): UseFileDiffResult {
  const activeFileDiffText = useMemo(() => {
    if (!activeFilePath || !diff) return null
    const worktreeRoot = treePath ?? ''
    const relativePath = worktreeRoot
      ? activeFilePath.replace(worktreeRoot.replace(/\/$/, '') + '/', '')
      : activeFilePath
    const chunks = diff.split(/^(?=diff --git )/m)
    return chunks.find((chunk) => chunk.includes(`a/${relativePath} b/`)) ?? null
  }, [diff, activeFilePath, treePath])

  const [originalContent, setOriginalContent] = useState<string | null>(null)
  const activeFileRelativePath = useMemo(() => {
    if (!activeFilePath) return null
    const worktreeRoot = treePath ?? ''
    return worktreeRoot
      ? activeFilePath.replace(worktreeRoot.replace(/\/$/, '') + '/', '')
      : activeFilePath
  }, [activeFilePath, treePath])

  useEffect(() => {
    if (!activeFileDiffText || !activeSessionId || !activeFileRelativePath) {
      setOriginalContent(null)
      return
    }
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const content = (await window.electronAPI.invoke(
          'diff:file-original',
          activeSessionId,
          activeFileRelativePath,
        )) as string | null
        if (!cancelled) setOriginalContent(content)
      } catch {
        if (!cancelled) setOriginalContent(null)
      }
    })()
    return () => { cancelled = true }
  }, [activeFileDiffText, activeSessionId, activeFileRelativePath])

  return {
    activeFileDiffText,
    originalContent,
  }
}
