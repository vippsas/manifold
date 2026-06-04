// src/plugin-host/vscode-shim/extension-context.ts
import { Disposable, Uri, enums, notImplemented } from './types'

interface HostStorageProxy {
  $get(pluginId: string, key: string): Promise<unknown>
  $update(pluginId: string, key: string, value: unknown): Promise<void>
}

/** A vscode.Memento backed by HOST_STORAGE. `prefix` separates global vs workspace state. */
function makeMemento(host: HostStorageProxy, pluginId: string, prefix: string): Record<string, unknown> {
  const k = (key: string) => `${prefix}:${key}`
  return {
    get: <T>(key: string, defaultValue?: T): Promise<T | undefined> =>
      host.$get(pluginId, k(key)).then((v) => (v === undefined ? defaultValue : (v as T))),
    update: (key: string, value: unknown): Promise<void> => host.$update(pluginId, k(key), value),
    keys: notImplemented('Memento.keys'),
  }
}

export function createExtensionContext(deps: {
  host: HostStorageProxy
  pluginId: string
  extensionPath: string
}): {
  subscriptions: { dispose(): unknown }[]
  globalState: Record<string, unknown>
  workspaceState: Record<string, unknown>
  secrets: Record<string, unknown>
  extensionPath: string
  extensionUri: Uri
  extensionMode: number
  asAbsolutePath: (p: string) => string
} {
  const { host, pluginId, extensionPath } = deps
  return {
    subscriptions: [],
    globalState: makeMemento(host, pluginId, 'global'),
    workspaceState: makeMemento(host, pluginId, 'workspace'),
    secrets: {
      get: notImplemented('SecretStorage.get'),
      store: notImplemented('SecretStorage.store'),
      delete: notImplemented('SecretStorage.delete'),
      onDidChange: notImplemented('SecretStorage.onDidChange'),
    },
    extensionPath,
    extensionUri: Uri.file(extensionPath),
    extensionMode: enums.ExtensionMode.Production,
    asAbsolutePath: (p: string): string => `${extensionPath}/${p}`,
  }
}

export { Disposable }
