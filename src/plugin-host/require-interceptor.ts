// src/plugin-host/require-interceptor.ts
import { sep } from 'node:path'

export interface PluginApiFrame { manifold?: unknown; vscode?: unknown }

const frames = new Map<string, PluginApiFrame>()

/** Register the API bundle for a plugin, keyed by its root folder. */
export function registerPluginApis(root: string, frame: PluginApiFrame): void {
  frames.set(root, frame)
}
export function unregisterPluginApis(root: string): void {
  frames.delete(root)
}

/** Resolve `manifold`/`vscode` for a module by the requiring file's path. */
export function resolvePluginModule(request: 'manifold' | 'vscode', requesterPath: string | undefined): unknown {
  if (!requesterPath) return undefined
  for (const [root, frame] of frames) {
    if (requesterPath === root || requesterPath.startsWith(root + sep)) {
      return request === 'manifold' ? frame.manifold : frame.vscode
    }
  }
  return undefined
}

/** Patch Node's module loader so plugin files get Manifold-backed `manifold`/`vscode`. */
export function installPluginRequire(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const Module = require('module') as any
  const originalLoad = Module._load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module._load = function (request: string, parent: any, ...rest: any[]): unknown {
    if (request === 'manifold' || request === 'vscode') {
      const api = resolvePluginModule(request, parent?.filename)
      if (api !== undefined) return api
    }
    return originalLoad.call(this, request, parent, ...rest)
  }
}
