// src/main/plugins/manifest.ts
import type { ManifoldPluginManifest } from '../../shared/plugins/manifest'

export type ManifestParseResult =
  | { ok: true; manifest: ManifoldPluginManifest }
  | { ok: false; error: string }

export function parseManifest(raw: unknown): ManifestParseResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'manifest is not an object' }
  const m = raw as Record<string, unknown>
  for (const field of ['name', 'publisher', 'version'] as const) {
    if (typeof m[field] !== 'string' || (m[field] as string).length === 0) {
      return { ok: false, error: `missing or invalid "${field}"` }
    }
  }
  const engines = m.engines as Record<string, unknown> | undefined
  if (!engines || typeof engines.manifold !== 'string') {
    return { ok: false, error: 'missing "engines.manifold"' }
  }
  const contributes = m.contributes as Record<string, unknown> | undefined
  if (contributes && contributes.views !== undefined) {
    if (!Array.isArray(contributes.views)) return { ok: false, error: '"contributes.views" must be an array' }
    for (const v of contributes.views) {
      if (typeof v !== 'object' || v === null) return { ok: false, error: 'invalid view contribution' }
      const view = v as Record<string, unknown>
      if (typeof view.id !== 'string' || view.id.length === 0) return { ok: false, error: 'view contribution missing "id"' }
      if (typeof view.title !== 'string' || view.title.length === 0) return { ok: false, error: `view "${String(view.id)}" missing "title"` }
    }
  }
  return { ok: true, manifest: m as unknown as ManifoldPluginManifest }
}
