import React from 'react'
import { usePluginTree } from '../../../hooks/usePluginTree'
import { PluginTree } from './plugin-tree'
import type { SerializedTreeItem } from '../../../../shared/plugins/tree'

export function PluginTreeViewPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const viewId = api.id
  const { roots, loadChildren, reloadKey } = usePluginTree(viewId)
  const onActivate = (item: SerializedTreeItem): void => {
    if (!item.command) return
    const commandId = item.command.command
    void window.electronAPI
      .invoke('plugins:execute-command', commandId, item.command.args ?? [])
      .catch((err: unknown) => {
        // A tree item whose command throws (or whose plugin failed to activate)
        // would otherwise surface as an unhandled rejection. No renderer toast
        // API exists for arbitrary errors, so log it.
        // eslint-disable-next-line no-console
        console.error(`[PluginTreeViewPanel] command "${commandId}" failed:`, err)
      })
  }
  return <PluginTree roots={roots} reloadKey={reloadKey} loadChildren={loadChildren} onActivate={onActivate} />
}
