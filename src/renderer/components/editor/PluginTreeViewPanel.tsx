import React from 'react'
import { usePluginTree } from '../../hooks/usePluginTree'
import { PluginTree } from './plugin-tree'
import type { SerializedTreeItem } from '../../../shared/plugins/tree'

export function PluginTreeViewPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const viewId = api.id
  const { roots, loadChildren, reloadKey } = usePluginTree(viewId)
  const onActivate = (item: SerializedTreeItem): void => {
    if (item.command) void window.electronAPI.invoke('plugins:execute-command', item.command.command, item.command.args ?? [])
  }
  return <PluginTree roots={roots} reloadKey={reloadKey} loadChildren={loadChildren} onActivate={onActivate} />
}
