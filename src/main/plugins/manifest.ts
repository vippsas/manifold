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
  // `name` and `publisher` form the plugin id (`publisher.name`), which is used in
  // filesystem paths (per-plugin storage). Restrict to a safe charset so an id can
  // never contain path separators or `..` (defends the storage path when the
  // first-party trust boundary opens to third-party plugins). See PluginStorageStore.
  const ID_SEGMENT = /^[a-z0-9][a-z0-9-]*$/
  for (const field of ['name', 'publisher'] as const) {
    if (!ID_SEGMENT.test(m[field] as string)) {
      return { ok: false, error: `"${field}" must be lowercase alphanumeric with hyphens (matched against ${ID_SEGMENT})` }
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
