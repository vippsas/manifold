import { useCallback, useEffect, useState } from 'react'
import type { FileTreeNode } from '../../../shared/types'

/** A folder shown in the sidebar: a repo's own checkout, or an agent's worktree. */
export type FolderSource =
  | { kind: 'project'; id: string }
  | { kind: 'session'; id: string }

interface CachedFolder {
  tree: FileTreeNode | null
  expandedPaths: Set<string>
}

/** Trees survive collapsing a folder, switching agents, and unmounting the
 *  sidebar, so reopening a folder paints its files in the same frame instead of
 *  flashing empty while an IPC round-trip completes. */
const cache = new Map<string, CachedFolder>()

function cacheKey(source: FolderSource): string {
  return `${source.kind}:${source.id}`
}

export function clearWorkspaceTreeCache(): void {
  cache.clear()
}

interface UseWorkspaceTreeResult {
  tree: FileTreeNode | null
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  refresh: () => void
}

/** The file tree of one sidebar folder, fetched on demand and remembered.
 *
 *  The live, watched tree of the *selected* agent comes from `useFileWatcher`;
 *  this covers every other folder on screen, which no watcher follows. A folder
 *  refreshes when it mounts and whenever the user asks — nothing else is running
 *  in it that would change files behind their back. */
export function useWorkspaceTree(source: FolderSource): UseWorkspaceTreeResult {
  const key = cacheKey(source)
  const [entry, setEntry] = useState<CachedFolder>(
    () => cache.get(key) ?? { tree: null, expandedPaths: new Set() },
  )
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    setEntry(cache.get(key) ?? { tree: null, expandedPaths: new Set() })
  }, [key])

  useEffect(() => {
    let cancelled = false
    const request = source.kind === 'project'
      ? window.electronAPI.invoke('files:tree-by-project', source.id)
      : window.electronAPI.invoke('files:tree', source.id)

    void request
      .then((result) => {
        if (cancelled) return
        const tree = result as FileTreeNode
        setEntry((current) => {
          // Open the root on the first load — a folder that expands to a single
          // collapsed row looks broken.
          const expandedPaths = current.expandedPaths.size > 0
            ? current.expandedPaths
            : new Set([tree.path])
          const next = { tree, expandedPaths }
          cache.set(key, next)
          return next
        })
      })
      .catch(() => {
        // Keep whatever was cached; a worktree can be mid-delete or unreadable.
      })

    return () => { cancelled = true }
  }, [key, source.kind, source.id, reloadCount])

  const onToggleExpand = useCallback((path: string): void => {
    setEntry((current) => {
      const expandedPaths = new Set(current.expandedPaths)
      if (!expandedPaths.delete(path)) expandedPaths.add(path)
      const next = { ...current, expandedPaths }
      cache.set(key, next)
      return next
    })
  }, [key])

  const refresh = useCallback((): void => setReloadCount((count) => count + 1), [])

  return { tree: entry.tree, expandedPaths: entry.expandedPaths, onToggleExpand, refresh }
}
