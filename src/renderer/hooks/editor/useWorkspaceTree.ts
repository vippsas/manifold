import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileTreeNode } from '../../../shared/types'
import { useIpcListener } from '../app/useIpc'

/** A folder shown in the sidebar: one repo as a workspace holds it (that
 *  workspace's checkout, or the clone itself for a home workspace), or the
 *  folder an agent is working in. */
export type FolderSource =
  | { kind: 'project'; id: string; workspaceId?: string }
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
  // Two workspaces can hold the same repo and show different files for it, so
  // the workspace is part of a folder's identity.
  const workspaceId = source.kind === 'project' ? source.workspaceId ?? '' : ''
  return `${source.kind}:${source.id}:${workspaceId}`
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
 *  this covers every other folder on screen, which that watcher does not follow.
 *  Something else may well be changing these files though — an agent in another
 *  workspace, or the user in a terminal — so a folder reloads when it mounts,
 *  when the user asks, when a watcher reports work in *this* folder, and when the
 *  window regains focus (nothing watches a folder with no agent in it, so
 *  returning to the app is the only moment it can learn; the same trigger the
 *  Source Control view uses). */
export function useWorkspaceTree(source: FolderSource): UseWorkspaceTreeResult {
  const key = cacheKey(source)
  const [entry, setEntry] = useState<CachedFolder>(
    () => cache.get(key) ?? { tree: null, expandedPaths: new Set() },
  )
  const reload = useRef<() => void>(() => {})
  const refresh = useCallback((): void => reload.current(), [])

  useEffect(() => {
    setEntry(cache.get(key) ?? { tree: null, expandedPaths: new Set() })
  }, [key])

  useEffect(() => {
    let cancelled = false
    let pending = false
    let trailing = false
    let scheduled: ReturnType<typeof setTimeout> | null = null

    const load = async (): Promise<void> => {
      pending = true
      try {
        const tree = await (source.kind === 'project'
          ? window.electronAPI.invoke('files:tree-by-project', source.id, source.workspaceId)
          : window.electronAPI.invoke('files:tree', source.id)) as FileTreeNode | null
        if (!cancelled && tree) {
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
        }
      } catch {
        // Keep whatever was cached; a worktree can be mid-delete or unreadable.
      } finally {
        pending = false
        if (!cancelled && trailing) {
          trailing = false
          schedule()
        }
      }
    }

    const schedule = (): void => {
      if (scheduled !== null) return
      if (pending) { trailing = true; return }
      // Batch the per-session fan-out for one root before starting its walk.
      scheduled = setTimeout(() => {
        scheduled = null
        void load()
      }, 0)
    }
    reload.current = schedule
    void load()

    return () => {
      cancelled = true
      if (scheduled !== null) clearTimeout(scheduled)
      reload.current = () => {}
    }
  }, [key, source.kind, source.id])

  const onToggleExpand = useCallback((path: string): void => {
    setEntry((current) => {
      const expandedPaths = new Set(current.expandedPaths)
      if (!expandedPaths.delete(path)) expandedPaths.add(path)
      const next = { ...current, expandedPaths }
      cache.set(key, next)
      return next
    })
  }, [key])

  // Which folder this is, as the main process names it in its events.
  const rootPath = entry.tree?.path ?? null

  // A tree-watched checkout (any session's, not just the selected one) reports
  // the folder it changed; an add-dir folder is git-polled instead and names
  // itself in `source`. Either way, only this folder's events reload it.
  // A restored session can match by id before its first tree reveals the root.
  useIpcListener<{ sessionId: string; rootPath?: string }>('files:tree-changed', useCallback((event) => {
    if ((source.kind === 'session' && event.sessionId === source.id)
      || (rootPath && event.rootPath === rootPath)) refresh()
  }, [source.kind, source.id, rootPath, refresh]))

  useIpcListener<{ source?: string }>('files:changed', useCallback((event) => {
    if (rootPath && event.source === rootPath) refresh()
  }, [rootPath, refresh]))

  useEffect(() => {
    const onFocus = (): void => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { tree: entry.tree, expandedPaths: entry.expandedPaths, onToggleExpand, refresh }
}
