import { useCallback, useEffect, useState } from 'react'
import type { SerializedTreeItem } from '../../shared/plugins/tree'

/** Drives a plugin tree view: opens it (activates the plugin), loads roots, lazy-loads children, reloads on refresh. */
export function usePluginTree(viewId: string): {
  roots: SerializedTreeItem[]
  loadChildren: (parentNodeId: string) => Promise<SerializedTreeItem[]>
  reloadKey: number
} {
  const [roots, setRoots] = useState<SerializedTreeItem[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const loadRoots = useCallback(async (): Promise<void> => {
    const items = (await window.electronAPI.invoke('plugins:tree-get-children', viewId, undefined)) as SerializedTreeItem[]
    setRoots(items ?? [])
    setReloadKey((k) => k + 1)
  }, [viewId])

  const loadChildren = useCallback(
    (parentNodeId: string): Promise<SerializedTreeItem[]> =>
      window.electronAPI.invoke('plugins:tree-get-children', viewId, parentNodeId) as Promise<SerializedTreeItem[]>,
    [viewId],
  )

  useEffect(() => {
    void window.electronAPI.invoke('plugins:open-tree-view', viewId).then(() => loadRoots())
    const off = window.electronAPI.on('plugins:tree-refresh', (...args: unknown[]) => { if (args[0] === viewId) void loadRoots() })
    return () => { off?.() }
  }, [viewId, loadRoots])

  return { roots, loadChildren, reloadKey }
}
