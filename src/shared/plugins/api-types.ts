// src/shared/plugins/api-types.ts
export interface Disposable { dispose(): void }

export interface ManifoldContext {
  subscriptions: Disposable[]
  /** Absolute path to the plugin's folder. */
  pluginUri: string
}

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
  }
}

/** Shape a plugin's entry module must export. */
export interface PluginModule {
  activate?: (context: ManifoldContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}
