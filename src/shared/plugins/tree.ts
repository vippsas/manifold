// src/shared/plugins/tree.ts
/** Collapsible state on the wire (mirrors vscode.TreeItemCollapsibleState). */
export type TreeCollapsibleState = 'none' | 'collapsed' | 'expanded'

/** A TreeItem serialized for the renderer. The host owns the real element behind `nodeId`. */
export interface SerializedTreeItem {
  nodeId: string
  label: string
  collapsibleState: TreeCollapsibleState
  description?: string
  tooltip?: string
  icon?: string
  command?: { command: string; args?: unknown[] }
}

/** Map a numeric vscode TreeItemCollapsibleState (0 None / 1 Collapsed / 2 Expanded) to the wire enum. */
export function collapsibleStateToWire(n: unknown): TreeCollapsibleState {
  if (n === 2 || n === 'expanded') return 'expanded'
  if (n === 1 || n === 'collapsed') return 'collapsed'
  return 'none'
}
