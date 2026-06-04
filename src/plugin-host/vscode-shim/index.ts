// src/plugin-host/vscode-shim/index.ts
import { Disposable, EventEmitter, Uri, enums, VscodeShimError } from './types'
import { createShimWindow } from './window'
import { createShimWorkspace } from './workspace'
import { createExtensionContext } from './extension-context'

/** A subset of ManifoldApi['commands'] — the shared local command layer. */
interface CommandsLayer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerCommand(id: string, handler: (...args: any[]) => unknown): { dispose(): void }
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>
}

export interface VscodeShimDeps {
  commands: CommandsLayer
  messagesProxy: { $showMessage(level: 'info' | 'warning' | 'error', message: string, items: string[]): Promise<string | undefined> }
  configProxy: { $get(pluginId: string, key: string): Promise<unknown> }
  storageProxy: { $get(pluginId: string, key: string): Promise<unknown>; $update(pluginId: string, key: string, value: unknown): Promise<void> }
  windowApi: { registerWebviewViewProvider(viewId: string, provider: unknown): { dispose(): void } }
  pluginId: string
  extensionPath: string
}

export function createVscodeShim(deps: VscodeShimDeps): {
  vscode: Record<string, unknown>
  createContext: () => ReturnType<typeof createExtensionContext>
} {
  const vscode: Record<string, unknown> = {
    commands: {
      registerCommand: deps.commands.registerCommand,
      executeCommand: deps.commands.executeCommand,
      // VS Code's registerTextEditorCommand etc. are not supported yet.
      // Returns [] rather than throwing: extensions commonly gate on command existence at startup; full enumeration is deferred.
      getCommands: () => Promise.resolve([] as string[]),
    },
    window: createShimWindow(deps.messagesProxy, deps.windowApi),
    workspace: createShimWorkspace(deps.configProxy, deps.pluginId),
    // Intentional soft stubs (not notImplemented): these are common no-arg probes
    // at activation; failing loud would break startup. openExternal resolves false
    // (honest "didn't open"), clipboard reads empty. Revisit when these are wired.
    env: {
      openExternal: (_uri: unknown) => Promise.resolve(false),
      clipboard: { readText: () => Promise.resolve(''), writeText: (_v: string) => Promise.resolve() },
      appName: 'Manifold',
      uriScheme: 'manifold',
    },
    // Value types + constructors.
    Disposable,
    EventEmitter,
    Uri,
    VscodeShimError,
    // Enums spread at the top level (vscode.ViewColumn.One, etc.).
    ...enums,
  }

  const createContext = (): ReturnType<typeof createExtensionContext> =>
    createExtensionContext({ host: deps.storageProxy, pluginId: deps.pluginId, extensionPath: deps.extensionPath })

  return { vscode, createContext }
}
