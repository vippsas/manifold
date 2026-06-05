// src/main/plugins/plugin-paths.ts
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Built-in plugins shipped with the app (resources/plugins). */
export function getBundledPluginsDir(): string {
  if (app?.isPackaged) return join(process.resourcesPath, 'plugins')
  const candidates = [
    join(__dirname, '..', '..', 'resources', 'plugins'),
    join(__dirname, '..', '..', '..', 'resources', 'plugins'),
    join(process.cwd(), 'resources', 'plugins'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return candidates[candidates.length - 1]
}

/** User-installed plugins (under the configurable storage root). */
export function getUserPluginsDir(storagePath: string): string {
  return join(storagePath, 'plugins')
}
