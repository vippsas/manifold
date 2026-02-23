import { useState, useMemo, useEffect } from 'react'
import type { FileChange } from '../../shared/types'

export interface UseFileDiffResult {
  mergedChanges: FileChange[]
  activeFileDiffText: string | null
  originalContent: string | null
}

export function useFileDiff(
  activeSessionId: string | null,
  diff: string,
  changedFiles: FileChange[],
  watcherChanges: FileChange[],
  activeFilePath: string | null,
  treePath: string | null
): UseFileDiffResult {
  // Merge both change sources: useDiff (committed changes vs base branch) and
  // useFileWatcher (uncommitted changes from git status polling). The watcher
  // changes update every 2s via polling while diff changes require an async IPC
  // round-trip, so merging ensures the file tree shows indicators immediately.
  const mergedChanges = useMemo(() => {
    const map = new Map<string, FileChange>()
    for (const c of changedFiles) map.set(c.path, c)
    for (const c of watcherChanges) map.set(c.path, c)
    return Array.from(map.values())
  }, [changedFiles, watcherChanges])

  const activeFileDiffText = useMemo(() => {
    if (!activeFilePath || !diff) return null
    const worktreeRoot = treePath ?? ''
    const relativePath = worktreeRoot
      ? activeFilePath.replace(worktreeRoot.replace(/\/$/, '') + '/', '')
      : activeFilePath
    const chunks = diff.split(/^(?=diff --git )/m)
    return chunks.find((chunk) => chunk.includes(`a/${relativePath} b/`)) ?? null
  }, [diff, activeFilePath, treePath])

  // Fetch original file content from base branch for diff view
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
          activeFileRelativePath
        )) as string | null
        if (!cancelled) setOriginalContent(content)
      } catch {
        if (!cancelled) setOriginalContent(null)
      }
    })()
    return () => { cancelled = true }
  }, [activeFileDiffText, activeSessionId, activeFileRelativePath])

  return {
    mergedChanges,
    activeFileDiffText,
    originalContent,
  }
}
