import { useCallback, useEffect, useState } from 'react'
import type { SerializedTreeItem } from '../../../shared/plugins/tree'

/** Drives a plugin tree view: opens it (activates the plugin), loads roots, lazy-loads children, reloads on refresh. */
export function usePluginTree(viewId: string): {
  roots: SerializedTreeItem[]
  loadChildren: (parentNodeId: string) => Promise<SerializedTreeItem[]>
  reloadKey: number
} {
  const [roots, setRoots] = useState<SerializedTreeItem[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  // `isRefresh` controls whether we bump reloadKey. The initial mount load must
  // NOT bump it (that would make PluginTree reset its just-initialized state);
  // only an explicit refresh should reset the tree's expansion + cache.
  const loadRoots = useCallback(async (isRefresh: boolean): Promise<void> => {
    const items = (await window.electronAPI.invoke('plugins:tree-get-children', viewId, undefined)) as SerializedTreeItem[]
    setRoots(items ?? [])
    if (isRefresh) setReloadKey((k) => k + 1)
  }, [viewId])

  const loadChildren = useCallback(
    (parentNodeId: string): Promise<SerializedTreeItem[]> =>
      window.electronAPI.invoke('plugins:tree-get-children', viewId, parentNodeId) as Promise<SerializedTreeItem[]>,
    [viewId],
  )

  useEffect(() => {
    void window.electronAPI
      .invoke('plugins:open-tree-view', viewId)
      .then(() => loadRoots(false))
      .catch((err: unknown) => {
        // Activation failure (or a failed initial root load) would otherwise be
        // an unhandled rejection. No renderer toast API exists for arbitrary
        // errors, so log it; the tree simply stays empty.
        // eslint-disable-next-line no-console
        console.error(`[usePluginTree] failed to open tree view "${viewId}":`, err)
      })
    const off = window.electronAPI.on('plugins:tree-refresh', (...args: unknown[]) => {
      if (args[0] === viewId) {
        void loadRoots(true).catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error(`[usePluginTree] failed to refresh tree view "${viewId}":`, err)
        })
      }
    })
    return () => { off() }
  }, [viewId, loadRoots])

  return { roots, loadChildren, reloadKey }
}
