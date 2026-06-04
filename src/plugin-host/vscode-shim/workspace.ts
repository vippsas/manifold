// src/plugin-host/vscode-shim/workspace.ts
import { notImplemented } from './types'

interface HostConfigProxy { $get(pluginId: string, key: string): Promise<unknown> }

export function createShimWorkspace(host: HostConfigProxy, pluginId: string): Record<string, unknown> {
  function getConfiguration(section?: string): Record<string, unknown> {
    const full = (key: string) => (section ? `${section}.${key}` : key)
    return {
      get: <T>(key: string, defaultValue?: T): Promise<T | undefined> =>
        host.$get(pluginId, full(key)).then((v) => (v === undefined ? defaultValue : (v as T))),
      has: (key: string): Promise<boolean> => host.$get(pluginId, full(key)).then((v) => v !== undefined),
      update: notImplemented('workspace.getConfiguration().update'),
      inspect: notImplemented('workspace.getConfiguration().inspect'),
    }
  }
  return {
    getConfiguration,
    workspaceFolders: undefined,
    name: undefined,
    fs: undefined,
    registerFileSystemProvider: notImplemented('workspace.registerFileSystemProvider'),
    onDidChangeConfiguration: notImplemented('workspace.onDidChangeConfiguration'),
  }
}
