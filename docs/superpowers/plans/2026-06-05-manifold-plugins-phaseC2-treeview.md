# Phase C2 — TreeView (TreeDataProvider) for Manifold plugins

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A functional, lazily-loaded **tree view** for plugins — `registerTreeDataProvider`/`createTreeView` on both the `manifold` API and the `vscode` shim — rendered as a native dock panel (not an iframe), with click-to-run-command and `onDidChangeTreeData` refresh. This is the gating capability for the explorer/Azure class of VS Code extensions.

**Architecture:** A `TreeDataProvider<T>` deals in opaque element objects `T`; `getChildren(element?)` returns child elements, `getTreeItem(element)` maps one to a `TreeItem`. The renderer can't hold `T`, so the **plugin-host** keeps a per-view `nodeId → element` map: when the renderer asks for the children of a node (by id), the host looks up the element, calls `getChildren`, then for each child calls `getTreeItem`, assigns a fresh `nodeId`, stores `nodeId → child`, and returns **serialized** TreeItems (label, collapsibleState, id, description, tooltip, icon, command). `onDidChangeTreeData` fires a refresh signal to the renderer, which re-fetches from the root (or the changed node). Rendering is a **native React tree** in a `pluginTreeView` dock panel — distinct from the iframe `pluginView`. Click on a node runs its `TreeItem.command` via `commands.executeCommand`.

**Tech Stack:** the existing `RpcEndpoint` + IPC + preload whitelist pattern (6 touch-points, mapped in recon); React (clone the `FileTree`/`TreeNode` recursion into a generic async `PluginTree`); the `useDockState()` native-panel pattern; Devicon SVGs for a small icon subset; Vitest.

**Scope (C2):** native + vscode tree views that open from the launcher; lazy children; `getTreeItem` fields label/collapsibleState/id/description/tooltip/iconPath(codicon-name subset)/command; `onDidChangeTreeData` refresh; a sample native tree plugin. **Out of scope (C2b):** `contributes.viewsContainers` activity-bar grouping (C2 flattens views to launcher entries), context menus (`contextValue` + `view/item/context`), inline action buttons, drag-and-drop, checkboxes, multi-select, `TreeView.reveal`/selection API, `resourceUri`/file-themed icons, `vscode.window.createWebviewPanel` (that's C1b).

---

## Context (verified file:line from recon)

- **No reusable generic tree** — `FileTree.tsx`/`tree-node.tsx`/`tree-node-row.tsx` are file-specific (drag/rename/git). Clone the recursive `TreeNode`+`NodeRow` *pattern* into a new generic `PluginTree`.
- **Native panel template:** internal panels (e.g. `LoopPanel`) are `React.FC` using `useDockState()`, registered in `dock-panels.tsx` `PANEL_COMPONENTS` by id, and listed via `internal-contributions.ts`. The iframe `PluginViewPanel` instead takes `api:{id}` and is the `pluginView` component. The tree panel is a NEW native component `pluginTreeView`.
- **Open-panel flow:** launcher item → `state.onOpenPluginView(id, title)` → `useDockLayout.ts openPluginView` → `api.addPanel({ id, component: 'pluginView', title, ... })`. We add a parallel path for tree views opening `component: 'pluginTreeView'`.
- **Contributions:** `contributes.views[]` → `viewContributionsOf` (`plugin-manager.ts`) → `plugins:list-contributions` IPC → `use-contributions.ts registerPanelContribution` → `ModuleLauncher`. `PluginViewContribution` (`manifest.ts`) = `{id,title,description?,launcher?}`; `PanelContribution` (`contributions.ts`) = `{id,title,description,launcher,source}`.
- **Icons:** `src/renderer/components/editor/file-icons.ts` `getFileIconSvg(name) → svg|null`; chevron is an inline SVG in `tree-node-row.tsx`.
- **RPC/IPC touch-points (6):** `rpc.ts` (constants) · `extension-host.ts` (main service) · `plugin-host/index.ts` (host service) · `preload/index.ts` (channel whitelists) · `plugin-handlers.ts` (ipcMain.handle) · renderer hook. `plugin-manager.ts` adds delegating methods; `ExtensionHost` adds proxy methods.

**Verification gate:** runtime tests green; typecheck node ≤16 / web ≤37 / plugins 0, no new errors in touched files. The native-render + lazy-expand behavior is Electron-only → dev smoke.

---

## Task C2-T1: Shared tree types + RPC constants + view `type`

**Files:**
- Modify: `src/shared/plugins/api-types.ts` (tree provider/item types + `window` API additions)
- Modify: `src/shared/plugins/rpc.ts` (HOST_TREE, PLUGIN_TREE)
- Modify: `src/shared/plugins/manifest.ts` (`type?: 'webview' | 'tree'` on `PluginViewContribution`)
- Modify: `src/shared/plugins/contributions.ts` (`kind?: 'webview' | 'tree'` on `PanelContribution`)
- Create: `src/shared/plugins/tree.ts` (the serialized wire shape)
- Test: `src/shared/plugins/tree.test.ts`

- [ ] **Step 1: Serialized wire shape + failing test**

Create `src/shared/plugins/tree.ts`:

```typescript
// src/shared/plugins/tree.ts
/** Collapsible state on the wire (mirrors vscode.TreeItemCollapsibleState). */
export type TreeCollapsibleState = 'none' | 'collapsed' | 'expanded'

/** A TreeItem serialized for the renderer. The host owns the real element behind `nodeId`. */
export interface SerializedTreeItem {
  /** Host-assigned stable-within-session handle for this node. */
  nodeId: string
  label: string
  collapsibleState: TreeCollapsibleState
  description?: string
  tooltip?: string
  /** A codicon-ish icon name (subset), e.g. 'folder', 'file', 'cloud', 'database'. Renderer maps to an svg/glyph. */
  icon?: string
  /** Command to run on click: a command id + args. */
  command?: { command: string; args?: unknown[] }
}

/** Map a numeric vscode TreeItemCollapsibleState (0 None / 1 Collapsed / 2 Expanded) to the wire enum. */
export function collapsibleStateToWire(n: unknown): TreeCollapsibleState {
  if (n === 2 || n === 'expanded') return 'expanded'
  if (n === 1 || n === 'collapsed') return 'collapsed'
  return 'none'
}
```

Create `src/shared/plugins/tree.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { collapsibleStateToWire } from './tree'

describe('collapsibleStateToWire', () => {
  it('maps vscode numeric states', () => {
    expect(collapsibleStateToWire(0)).toBe('none')
    expect(collapsibleStateToWire(1)).toBe('collapsed')
    expect(collapsibleStateToWire(2)).toBe('expanded')
    expect(collapsibleStateToWire(undefined)).toBe('none')
  })
})
```

- [ ] **Step 2: Run → fail**, then implement (above), then `npx vitest run src/shared/plugins/tree.test.ts` → PASS.

- [ ] **Step 3: RPC constants**

In `src/shared/plugins/rpc.ts`, add:
```typescript
export const HOST_TREE = 'HostTree'      // main, called by host (refresh notifications)
export const PLUGIN_TREE = 'PluginTree'  // host, called by main (get children)
```

- [ ] **Step 4: Manifold tree API types**

In `src/shared/plugins/api-types.ts`, add the tree provider types and extend `window`:

```typescript
export interface TreeItem {
  label: string
  // 0 None | 1 Collapsed | 2 Expanded  (numbers match vscode.TreeItemCollapsibleState)
  collapsibleState?: 0 | 1 | 2
  id?: string
  description?: string
  tooltip?: string
  iconPath?: string            // codicon-ish name (subset)
  command?: { command: string; arguments?: unknown[] }
}
export interface TreeDataProvider<T = unknown> {
  getChildren(element?: T): T[] | undefined | Promise<T[] | undefined>
  getTreeItem(element: T): TreeItem | Promise<TreeItem>
  onDidChangeTreeData?: (listener: () => void) => Disposable
}
export interface TreeView extends Disposable { /* C2: opaque handle; reveal/selection deferred */ }
```
And in `ManifoldApi['window']` add:
```typescript
  registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable
  createTreeView(viewId: string, options: { treeDataProvider: TreeDataProvider }): TreeView
```

- [ ] **Step 5: View kind in manifest + contribution**

In `src/shared/plugins/manifest.ts`, add to `PluginViewContribution`: `type?: 'webview' | 'tree'` (default treated as `'webview'`). In `src/shared/plugins/contributions.ts`, add to `PanelContribution`: `kind?: 'webview' | 'tree'`.

- [ ] **Step 6: typecheck + commit**

`npm run typecheck:node` (≤16) `typecheck:web` (≤37) — note these new optional fields/types shouldn't break existing code. Then:
```bash
git add src/shared/plugins/tree.ts src/shared/plugins/tree.test.ts src/shared/plugins/rpc.ts src/shared/plugins/api-types.ts src/shared/plugins/manifest.ts src/shared/plugins/contributions.ts && \
git commit -m "feat(plugins): shared TreeView types, RPC constants, view kind"
```

---

## Task C2-T2: Host tree session — element-handle map, serialization, providers

**Files:**
- Create: `src/plugin-host/tree-api.ts`
- Test: `src/plugin-host/tree-api.test.ts`
- Modify: `src/plugin-host/window-api.ts` (expose `registerTreeDataProvider`/`createTreeView` + a `getChildren`/`refresh` surface for the host runtime)
- Modify: `src/plugin-host/vscode-shim/window.ts` (delegate `registerTreeDataProvider`/`createTreeView`)

This is the core. Implement an element-handle session.

- [ ] **Step 1: Failing test (the element-handle protocol)**

Create `src/plugin-host/tree-api.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { TreeRegistry } from './tree-api'

// A tiny provider over a static nested structure.
function provider() {
  const data: Record<string, string[]> = { root: ['a', 'b'], a: ['a1'], b: [], a1: [] }
  return {
    getChildren: (el?: string) => data[el ?? 'root'],
    getTreeItem: (el: string) => ({ label: el.toUpperCase(), collapsibleState: (data[el]?.length ? 1 : 0) as 0|1, command: { command: 'open', arguments: [el] } }),
  }
}

describe('TreeRegistry', () => {
  it('serializes root children with fresh nodeIds and resolves grandchildren by nodeId', async () => {
    const reg = new TreeRegistry()
    reg.register('view.x', provider())
    const roots = await reg.getChildren('view.x', undefined)
    expect(roots.map((r) => r.label)).toEqual(['A', 'B'])
    expect(roots[0].collapsibleState).toBe('collapsed') // a has children
    expect(roots[1].collapsibleState).toBe('none')       // b empty
    expect(roots[0].command).toEqual({ command: 'open', args: ['a'] })
    // expand 'a' by its host-assigned nodeId
    const kids = await reg.getChildren('view.x', roots[0].nodeId)
    expect(kids.map((k) => k.label)).toEqual(['A1'])
  })

  it('fires the refresh callback when the provider signals onDidChangeTreeData', () => {
    const reg = new TreeRegistry()
    let fire = () => {}
    reg.register('view.y', { getChildren: () => [], getTreeItem: () => ({ label: 'x' }), onDidChangeTreeData: (l: () => void) => { fire = l; return { dispose() {} } } })
    const onRefresh = vi.fn()
    reg.onRefresh(onRefresh)
    fire()
    expect(onRefresh).toHaveBeenCalledWith('view.y')
  })

  it('throws for an unknown view', async () => {
    const reg = new TreeRegistry()
    await expect(reg.getChildren('nope', undefined)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run → fail.** Then implement `src/plugin-host/tree-api.ts`:

```typescript
// src/plugin-host/tree-api.ts
import { collapsibleStateToWire, type SerializedTreeItem } from '../shared/plugins/tree'
import type { Disposable, TreeDataProvider, TreeItem } from '../shared/plugins/api-types'

interface ViewState {
  provider: TreeDataProvider
  /** nodeId -> element handle (the opaque T the provider returned). */
  elements: Map<string, unknown>
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
    const prev = this.views.get(viewId)
    prev?.sub?.dispose()
    state.sub = provider.onDidChangeTreeData?.(() => { state.elements.clear(); this.refreshCb?.(viewId) })
    this.views.set(viewId, state)
    return { dispose: () => { state.sub?.dispose(); this.views.delete(viewId) } }
  }

  hasView(viewId: string): boolean { return this.views.has(viewId) }

  /** Children of `parentNodeId` (undefined = roots), as serialized items. Registers each child's handle. */
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
```

- [ ] **Step 3:** `npx vitest run src/plugin-host/tree-api.test.ts` → PASS.

- [ ] **Step 4: Expose via window-api**

In `src/plugin-host/window-api.ts`, instantiate a `TreeRegistry`, add `registerTreeDataProvider(viewId, provider)` and `createTreeView(viewId, { treeDataProvider })` to the returned `windowApi` (both call `treeRegistry.register`; `createTreeView` returns `{ dispose }`), and export from the factory: `treeGetChildren(viewId, parentNodeId)` and a way to wire the refresh callback (so `plugin-host/index.ts` can forward refreshes to main). Keep it consistent with how `resolveView`/`deliverMessage` are already returned.

- [ ] **Step 5: vscode-shim delegation**

In `src/plugin-host/vscode-shim/window.ts`, replace the `createTreeView`/`registerTreeDataProvider` `notImplemented` stubs with delegation to the real `windowApi` (the same one threaded in C1-T4). Note vscode's `TreeItem.collapsibleState` is a numeric enum (0/1/2) and `command.arguments` — our types already accept those. Update `RealWindowApi` in window.ts to include the two methods; thread through `createVscodeShim` deps (already passes `windowApi`).

- [ ] **Step 6: tests + typecheck + commit**

`npx vitest run src/plugin-host` green; `typecheck:node` ≤16. Commit:
```bash
git add src/plugin-host/tree-api.ts src/plugin-host/tree-api.test.ts src/plugin-host/window-api.ts src/plugin-host/vscode-shim/ && \
git commit -m "feat(plugins): host TreeRegistry (element-handle protocol) + tree provider API"
```

---

## Task C2-T3: Main relay + IPC + preload + plugin-manager

**Files:** `src/shared/plugins/rpc.ts` (done T1), `src/plugin-host/index.ts`, `src/main/plugins/extension-host.ts`, `src/main/plugins/plugin-manager.ts`, `src/main/ipc/plugin-handlers.ts`, `src/preload/index.ts`.

- [ ] **Step 1: Host service (plugin-host/index.ts)** — register `PLUGIN_TREE` with `$getChildren(viewId, parentNodeId)` → `windowApi.treeGetChildren(...)`. Wire the TreeRegistry refresh callback to call the main-side `HOST_TREE.$refresh(viewId)` proxy. (Activation must have run so the provider is registered — reuse the same `resolveView`/activation path: opening a tree view triggers `$activate` then provider registration; ensure the open-tree path activates the plugin like `resolveView` does.)

- [ ] **Step 2: Main service + proxy (extension-host.ts)** — register `HOST_TREE` with `$refresh: (viewId) => this.send?.('plugins:tree-refresh', viewId)`. Add a method `treeGetChildren(target, viewId, parentNodeId)` that ensures activation (like `resolveView`) then calls `PLUGIN_TREE.$getChildren(viewId, parentNodeId)` and returns the serialized items.

- [ ] **Step 3: plugin-manager.ts** — add `openTreeView(viewId)` (mirror `openView` but it's the same activation; the renderer opens the native panel) and `treeGetChildren(viewId, parentNodeId)` → finds owning plugin, calls `host.treeGetChildren(target, viewId, parentNodeId)`.

- [ ] **Step 4: IPC (plugin-handlers.ts)** — `ipcMain.handle('plugins:tree-get-children', (_e, viewId, parentNodeId) => deps.pluginManager.treeGetChildren(viewId, parentNodeId))` and `ipcMain.handle('plugins:open-tree-view', (_e, viewId) => deps.pluginManager.openTreeView(viewId))`.

- [ ] **Step 5: preload** — add `'plugins:tree-get-children'`, `'plugins:open-tree-view'` to `ALLOWED_INVOKE_CHANNELS`; add `'plugins:tree-refresh'` to `ALLOWED_LISTEN_CHANNELS`.

- [ ] **Step 6:** typecheck ≤16; `npx vitest run src/main/plugins src/plugin-host` green (the in-memory integration test may need a HOST_TREE/PLUGIN_TREE stub if it enumerates services — update if needed). Commit `feat(plugins): tree RPC/IPC wiring (get-children + refresh)`.

---

## Task C2-T4: Renderer — generic `PluginTree` + panel + hook + open wiring

**Files:**
- Create: `src/renderer/components/editor/PluginTreeViewPanel.tsx`
- Create: `src/renderer/components/editor/plugin-tree.tsx` (the generic async tree)
- Create: `src/renderer/hooks/usePluginTree.ts`
- Modify: `src/renderer/components/editor/dock-panels.tsx` (register `pluginTreeView`)
- Modify: the open-panel path (`useDockLayout.ts` add an `openPluginTreeView`; `ModuleLauncher.tsx` route tree-kind contributions to it)
- Test: `src/renderer/components/editor/plugin-tree.test.tsx`

- [ ] **Step 1: `usePluginTree` hook** — given a `viewId`: on mount `invoke('plugins:open-tree-view', viewId)` then load roots via `invoke('plugins:tree-get-children', viewId, undefined)`; expose `getChildren(parentNodeId)` (memoized/cached) and subscribe `on('plugins:tree-refresh', vid => { if (vid===viewId) reloadRoots() })`. Children fetched lazily on expand.

- [ ] **Step 2: `PluginTree` component** — clone the recursive `TreeNode`/`NodeRow` *pattern* (chevron for expandable, label, optional icon via a small codicon-name→svg/emoji map, indentation by depth). Props: `viewId`, `loadChildren(parentNodeId?) => Promise<SerializedTreeItem[]>`, `onActivate(item)` (runs `item.command` via `invoke('plugins:execute-command', cmd.command, cmd.args ?? [])`). Expand/collapse state local; on first expand of a node, fetch+cache its children. Empty/loading states. Write a jsdom test that, given a stub `loadChildren`, renders roots, expands a collapsible node to load+show its children, and fires `onActivate` (→ executeCommand) on a leaf click.

- [ ] **Step 3: `PluginTreeViewPanel`** — native panel (`useDockState()` pattern). It must know its `viewId` — pass it the same way `pluginView` gets `api:{id}` (the panel id IS the view id). Render `<PluginTree viewId={id} loadChildren={...usePluginTree...} onActivate={...} />`.

- [ ] **Step 4: dock-panels** — add `pluginTreeView: PluginTreeViewPanel` to `PANEL_COMPONENTS`.

- [ ] **Step 5: open wiring** — in `useDockLayout.ts` add `openPluginTreeView(viewId, title)` (mirror `openPluginView` but `component: 'pluginTreeView'`); expose it on the dock state. In `ModuleLauncher.tsx`, route a contribution whose `kind === 'tree'` to `state.onOpenPluginTreeView(id, title)` instead of `onOpenPluginView`.

- [ ] **Step 6:** `npx vitest run src/renderer` green; `typecheck:web` ≤37. Commit `feat(plugins): native PluginTree panel + lazy tree rendering + open wiring`.

---

## Task C2-T5: Contribution kind mapping + sample tree plugin + dev smoke

**Files:** `src/main/plugins/plugin-manager.ts` (carry `kind` from manifest into the contribution), `src/main/plugins/vscode-manifest.ts` (map vscode `contributes.views` → kind tree), `resources/plugins/hello-tree/` (new sample), build/dev-smoke.

- [ ] **Step 1: kind in contributions** — in `viewContributionsOf`, set `kind: v.type === 'tree' ? 'tree' : 'webview'`. In `parseVscodeManifest`, map `contributes.views` (vscode views are trees by default) into manifold view contributions with `type: 'tree'` (and carry their `id`/`name`→title). (Recon: vscode `contributes.views` is keyed by container → array of `{id,name}`; flatten to view contributions with `type:'tree'`, `launcher:true`.)

- [ ] **Step 2: sample native tree plugin** — `resources/plugins/hello-tree/` (TS, via the C-pipeline): manifest contributes a `tree` view (`type:'tree'`, launcher) + a command; `src/plugin.ts` registers a `TreeDataProvider` over a small static nested structure (e.g. Folders → Items), each item's `command` runs a manifold command that shows a message. Build via `npm run build:plugins`.

- [ ] **Step 3: build + dev smoke** — `npm run build`; `npm run dev`; open **+ Apps → (the tree view)**; confirm: the tree renders roots, expanding a node lazily loads children, clicking a leaf runs its command (observe the effect / debug.log), and a refresh (if the sample exposes one) re-renders. Record in the followups doc. Note remaining C2b (view-containers, context menus, icons, vscode azureresourcegroups still needs auth+resources-API).

- [ ] **Step 4: commit** the sample + followups note.

---

## Self-Review

**Spec coverage:** wire types + RPC constants + view kind (T1); the element-handle host protocol + provider API + shim delegation (T2); main relay/IPC/preload/manager (T3); native tree render + lazy expand + click→command + refresh (T4); kind mapping + sample + smoke (T5). The element-handle map (host holds `T`, renderer holds `nodeId`) is the crux and is unit-tested in T2.

**Risks/notes:** (a) Activation timing — opening a tree view must activate the owning plugin so its provider is registered before `$getChildren`; reuse the `resolveView` activation path. (b) Refresh invalidates the element map (`elements.clear()`), so stale nodeIds after refresh return empty/regenerate — the renderer reloads roots on refresh. (c) vscode `collapsibleState` is numeric (0/1/2) and `command.arguments` — handled by `collapsibleStateToWire` + the mapping. (d) Icons: C2 uses a small codicon-name→glyph/emoji subset; rich/file/theme icons are C2b. (e) Deferred: view-containers, context menus, reveal/selection, drag-drop — clearly out of scope. (f) `vscode-azurestorage`/`azureresourcegroups` still need Phase D (auth + the resources API) even once trees work — C2 unblocks the *rendering*, not the Azure data.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-05-manifold-plugins-phaseC2-treeview.md`.**
