// src/main/plugins/manifest.ts
import {
  CAPABILITIES,
  isCapability,
  type Capability,
  type ManifoldPluginManifest,
  type PluginCommandContribution,
  type PluginConfiguration,
  type PluginContributions,
  type PluginViewContribution,
} from '../../shared/plugins/manifest'

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
  const manifoldEngine: string = engines.manifold

  // Capabilities gate the privileged API namespaces, so they are validated strictly:
  // an unknown capability is rejected (a typo must not silently grant nothing / escape gating).
  let capabilities: Capability[] | undefined
  if (m.capabilities !== undefined) {
    if (!Array.isArray(m.capabilities)) return { ok: false, error: '"capabilities" must be an array' }
    const caps: Capability[] = []
    for (const c of m.capabilities) {
      if (!isCapability(c)) return { ok: false, error: `unknown capability ${JSON.stringify(c)} (allowed: ${CAPABILITIES.join(', ')})` }
      caps.push(c)
    }
    capabilities = caps
  }

  const contributes = m.contributes as Record<string, unknown> | undefined
  const views: PluginViewContribution[] = []
  if (contributes && contributes.views !== undefined) {
    if (!Array.isArray(contributes.views)) return { ok: false, error: '"contributes.views" must be an array' }
    for (const v of contributes.views) {
      if (typeof v !== 'object' || v === null) return { ok: false, error: 'invalid view contribution' }
      const view = v as Record<string, unknown>
      if (typeof view.id !== 'string' || view.id.length === 0) return { ok: false, error: 'view contribution missing "id"' }
      if (typeof view.title !== 'string' || view.title.length === 0) return { ok: false, error: `view "${String(view.id)}" missing "title"` }
      views.push({
        id: view.id,
        title: view.title,
        description: typeof view.description === 'string' ? view.description : undefined,
        launcher: typeof view.launcher === 'boolean' ? view.launcher : undefined,
        type: view.type === 'tree' || view.type === 'webview' ? view.type : undefined,
      })
    }
  }

  const commands: PluginCommandContribution[] = []
  if (Array.isArray(contributes?.commands)) {
    for (const c of contributes.commands) {
      if (typeof c === 'object' && c !== null) {
        const cmd = c as Record<string, unknown>
        if (typeof cmd.command === 'string' && typeof cmd.title === 'string') commands.push({ command: cmd.command, title: cmd.title })
      }
    }
  }

  // Configuration is shaped data read by the Settings UI (tolerant of missing fields);
  // carry it through when it is an object rather than re-validating its nested schema here.
  const rawConfiguration = contributes?.configuration
  const configuration = typeof rawConfiguration === 'object' && rawConfiguration !== null ? (rawConfiguration as PluginConfiguration) : undefined

  const contributesOut: PluginContributions | undefined =
    views.length > 0 || commands.length > 0 || configuration !== undefined
      ? {
          ...(views.length > 0 ? { views } : {}),
          ...(commands.length > 0 ? { commands } : {}),
          ...(configuration !== undefined ? { configuration } : {}),
        }
      : undefined

  // Build the result explicitly from validated/coerced fields — no blanket `as unknown as`,
  // so the returned type matches the runtime shape (raw extras are dropped, not passed through).
  const manifest: ManifoldPluginManifest = {
    name: m.name as string,
    publisher: m.publisher as string,
    version: m.version as string,
    displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
    description: typeof m.description === 'string' ? m.description : undefined,
    engines: { manifold: manifoldEngine },
    main: typeof m.main === 'string' ? m.main : undefined,
    activationEvents: Array.isArray(m.activationEvents) ? (m.activationEvents.filter((e) => typeof e === 'string') as string[]) : undefined,
    contributes: contributesOut,
    capabilities,
  }
  return { ok: true, manifest }
}
