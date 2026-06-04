// src/shared/plugins/api-types.ts
export interface Disposable { dispose(): void }

export interface ProjectInfo { id: string; name: string; path: string }
export interface SessionInfo { id: string; status: string; branchName?: string }

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
}

/** Shape a plugin's entry module must export. */
export interface PluginModule {
  activate?: (context: ManifoldContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}
