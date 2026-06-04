// src/main/plugins/scanner.ts
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginDescriptor } from '../../shared/plugins/manifest'
import { parseManifest } from './manifest'

export interface ScanResult {
  plugins: PluginDescriptor[]
  errors: Array<{ path: string; error: string }>
}

export function scanPluginDir(dir: string, origin: 'builtin' | 'user'): ScanResult {
  const plugins: PluginDescriptor[] = []
  const errors: Array<{ path: string; error: string }> = []
  if (!existsSync(dir)) return { plugins, errors }
  for (const entry of readdirSync(dir)) {
    const root = join(dir, entry)
    if (!statSync(root).isDirectory()) continue
    const manifestPath = join(root, 'package.json')
    if (!existsSync(manifestPath)) continue
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (err) {
      errors.push({ path: manifestPath, error: `invalid JSON: ${String(err)}` })
      continue
    }
    const result = parseManifest(raw)
    if (!result.ok) {
      errors.push({ path: manifestPath, error: result.error })
      continue
    }
    plugins.push({
      id: `${result.manifest.publisher}.${result.manifest.name}`,
      manifest: result.manifest,
      root,
      origin,
    })
  }
  return { plugins, errors }
}
