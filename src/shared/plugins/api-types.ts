// src/shared/plugins/api-types.ts
import type { QuickPickItem, QuickPickOptions, InputBoxOptions } from './ui'

export interface Disposable { dispose(): void }

export interface ProjectInfo { id: string; name: string; path: string }
export interface SessionInfo { id: string; status: string; branchName?: string }

export interface ManifoldContext {
  subscriptions: Disposable[]
  /** Absolute path to the plugin's folder. */
  pluginUri: string
}

export interface TreeItem {
  label: string
  collapsibleState?: 0 | 1 | 2  // None | Collapsed | Expanded (matches vscode.TreeItemCollapsibleState)
  id?: string
  description?: string
  tooltip?: string
  iconPath?: string             // codicon-ish name (subset)
  command?: { command: string; arguments?: unknown[] }
}
export interface TreeDataProvider<T = unknown> {
  getChildren(element?: T): T[] | undefined | Promise<T[] | undefined>
  getTreeItem(element: T): TreeItem | Promise<TreeItem>
  onDidChangeTreeData?: (listener: () => void) => Disposable
}
export interface TreeView extends Disposable { /* C2: opaque handle; reveal/selection deferred */ }

export interface WebviewView {
  webview: {
    html: string
    postMessage(message: unknown): void
    onDidReceiveMessage(listener: (message: unknown) => void): Disposable
  }
}
export interface WebviewViewProvider {
  resolveWebviewView(view: WebviewView): void | Promise<void>
}

/** The `manifold` module surface (Phase 1b: commands only). */
export interface ManifoldApi {
  commands: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCommand(id: string, handler: (...args: any[]) => unknown): Disposable
    executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>
  }
  window: {
    registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable
    registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable
    createTreeView(viewId: string, options: { treeDataProvider: TreeDataProvider }): TreeView
    showInformationMessage?(message: string, ...actions: string[]): Promise<string | undefined>
    showWarningMessage?(message: string, ...actions: string[]): Promise<string | undefined>
    showErrorMessage?(message: string, ...actions: string[]): Promise<string | undefined>
    showQuickPick?(items: ReadonlyArray<string | QuickPickItem>, options?: QuickPickOptions): Promise<QuickPickItem | string | undefined>
    showInputBox?(options?: InputBoxOptions): Promise<string | undefined>
  }
  storage: {
    global: {
      get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
      update(key: string, value: unknown): Promise<void>
    }
  }
  workspace: {
    readonly activeProject: ProjectInfo | undefined
    readonly activeSession: SessionInfo | undefined
    onDidChangeActiveProject(listener: (project: ProjectInfo | undefined) => void): Disposable
    onDidChangeActiveSession(listener: (session: SessionInfo | undefined) => void): Disposable
  }
  configuration: {
    get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
    onDidChange(listener: () => void): Disposable
  }
}

/** Shape a plugin's entry module must export. */
export interface PluginModule {
  activate?: (context: ManifoldContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}
