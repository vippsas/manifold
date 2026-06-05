// src/plugin-host/tree-api.ts
import { collapsibleStateToWire, type SerializedTreeItem } from '../shared/plugins/tree'
import type { Disposable, TreeDataProvider, TreeItem } from '../shared/plugins/api-types'

interface ViewState {
  provider: TreeDataProvider
  elements: Map<string, unknown> // nodeId -> opaque element handle
  seq: number
  sub?: Disposable
}

/** Owns tree providers and the renderer-facing element-handle protocol. */
export class TreeRegistry {
  private readonly views = new Map<string, ViewState>()
  private refreshCb: ((viewId: string) => void) | null = null

  onRefresh(cb: (viewId: string) => void): void { this.refreshCb = cb }

  register(viewId: string, provider: TreeDataProvider): Disposable {
    const state: ViewState = { provider, elements: new Map(), seq: 0 }
    this.views.get(viewId)?.sub?.dispose()
    state.sub = provider.onDidChangeTreeData?.(() => { state.elements.clear(); this.refreshCb?.(viewId) })
    this.views.set(viewId, state)
    return { dispose: () => { state.sub?.dispose(); this.views.delete(viewId) } }
  }

  hasView(viewId: string): boolean { return this.views.has(viewId) }

  /** Children of `parentNodeId` (undefined = roots), serialized; registers each child's handle. */
  async getChildren(viewId: string, parentNodeId: string | undefined): Promise<SerializedTreeItem[]> {
    const state = this.views.get(viewId)
    if (!state) throw new Error(`no tree provider for view: ${viewId}`)
    const parentEl = parentNodeId === undefined ? undefined : state.elements.get(parentNodeId)
    const children = (await state.provider.getChildren(parentEl as never)) ?? []
    const out: SerializedTreeItem[] = []
    for (const el of children) {
      const item: TreeItem = await state.provider.getTreeItem(el as never)
      const nodeId = item.id ?? `n${++state.seq}`
      state.elements.set(nodeId, el)
      out.push({
        nodeId,
        label: item.label,
        collapsibleState: collapsibleStateToWire(item.collapsibleState),
        description: item.description,
        tooltip: item.tooltip,
        icon: item.iconPath,
        command: item.command ? { command: item.command.command, args: item.command.arguments } : undefined,
      })
    }
    return out
  }
}
