// src/plugin-host/window-api.ts
import { HOST_WINDOW, HOST_UI, type RpcEndpoint } from '../shared/plugins/rpc'
import type { Disposable, TreeDataProvider, TreeView, WebviewView, WebviewViewProvider } from '../shared/plugins/api-types'
import { TreeRegistry } from './tree-api'
import type { SerializedTreeItem } from '../shared/plugins/tree'
import { normalizeQuickPickItems } from '../shared/plugins/ui'
import type { QuickPickItem, QuickPickOptions, InputBoxOptions } from '../shared/plugins/ui'

interface HostWindowProxy {
  $setHtml(viewId: string, html: string): Promise<void>
  $postToWebview(viewId: string, message: unknown): Promise<void>
}

interface HostUiProxy {
  $showMessage(level: string, message: string, actions: string[]): Promise<string | undefined>
  $showQuickPick(items: QuickPickItem[], options: QuickPickOptions): Promise<QuickPickItem | undefined>
  $showInputBox(options: InputBoxOptions): Promise<string | undefined>
}

/** Builds the `manifold.window` API and the host-side view-resolution logic. */
export function createWindowApi(endpoint: RpcEndpoint): {
  windowApi: {
    registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable
    registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable
    createTreeView(viewId: string, options: { treeDataProvider: TreeDataProvider }): TreeView
    showInformationMessage(message: string, ...actions: string[]): Promise<string | undefined>
    showWarningMessage(message: string, ...actions: string[]): Promise<string | undefined>
    showErrorMessage(message: string, ...actions: string[]): Promise<string | undefined>
    showQuickPick(items: ReadonlyArray<string | QuickPickItem>, options?: QuickPickOptions): Promise<QuickPickItem | string | undefined>
    showInputBox(options?: InputBoxOptions): Promise<string | undefined>
  }
  resolveView(viewId: string): Promise<void>
  deliverMessage(viewId: string, message: unknown): void
  treeGetChildren(viewId: string, parentNodeId: string | undefined): Promise<SerializedTreeItem[]>
  onTreeRefresh(cb: (viewId: string) => void): void
} {
  const host = endpoint.getProxy<HostWindowProxy>(HOST_WINDOW)
  const hostUi = endpoint.getProxy<HostUiProxy>(HOST_UI)
  const providers = new Map<string, WebviewViewProvider>()
  const listeners = new Map<string, Set<(m: unknown) => void>>()
  const treeRegistry = new TreeRegistry()

  const windowApi = {
    registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable {
      providers.set(viewId, provider)
      return { dispose: () => { providers.delete(viewId); listeners.delete(viewId) } }
    },
    registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable {
      return treeRegistry.register(viewId, provider)
    },
    createTreeView(viewId: string, options: { treeDataProvider: TreeDataProvider }): TreeView {
      const d = treeRegistry.register(viewId, options.treeDataProvider)
      return { dispose: d.dispose }
    },
    showInformationMessage: (message: string, ...actions: string[]) => hostUi.$showMessage('info', message, actions),
    showWarningMessage: (message: string, ...actions: string[]) => hostUi.$showMessage('warning', message, actions),
    showErrorMessage: (message: string, ...actions: string[]) => hostUi.$showMessage('error', message, actions),
    showQuickPick: async (items: ReadonlyArray<string | QuickPickItem>, options: QuickPickOptions = {}) => {
      const wasStrings = items.every((i) => typeof i === 'string')
      const picked = await hostUi.$showQuickPick(normalizeQuickPickItems(items), options)
      return wasStrings && picked ? picked.label : picked
    },
    showInputBox: (options: InputBoxOptions = {}) => hostUi.$showInputBox(options),
  }

  async function resolveView(viewId: string): Promise<void> {
    const provider = providers.get(viewId)
    if (!provider) { console.error(`[plugin-host] resolveView: no WebviewViewProvider registered for "${viewId}"`); return }
    // Each resolve corresponds to a fresh webview document (panel remount).
    // Start from an empty listener set: handlers registered during earlier
    // resolutions would otherwise accumulate and handle every message once
    // per remount (e.g. one Run click starting N pipeline runs).
    const viewListeners = new Set<(m: unknown) => void>()
    listeners.set(viewId, viewListeners)
    let html = ''
    const view: WebviewView = {
      webview: {
        get html() { return html },
        set html(value: string) { html = value; void host.$setHtml(viewId, value) },
        postMessage(message: unknown) { void host.$postToWebview(viewId, message) },
        onDidReceiveMessage(listener) { viewListeners.add(listener); return { dispose: () => viewListeners.delete(listener) } },
      },
    }
    await provider.resolveWebviewView(view)
  }

  function deliverMessage(viewId: string, message: unknown): void {
    const set = listeners.get(viewId)
    if (!set) { console.warn(`[plugin-host] deliverMessage: no listener for "${viewId}" (message dropped)`); return }
    for (const listener of set) { try { listener(message) } catch (e) { console.error('[plugin-host] deliverMessage: listener threw', e) } }
  }

  function treeGetChildren(viewId: string, parentNodeId: string | undefined): Promise<SerializedTreeItem[]> {
    return treeRegistry.getChildren(viewId, parentNodeId)
  }

  function onTreeRefresh(cb: (viewId: string) => void): void {
    treeRegistry.onRefresh(cb)
  }

  return { windowApi, resolveView, deliverMessage, treeGetChildren, onTreeRefresh }
}
