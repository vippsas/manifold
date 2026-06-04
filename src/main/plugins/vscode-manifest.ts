// src/main/plugins/vscode-manifest.ts
import type { ManifoldPluginManifest, PluginCommandContribution } from '../../shared/plugins/manifest'

export type VscodeManifestParseResult =
  | { ok: true; manifest: ManifoldPluginManifest }
  | { ok: false; error: string }

// VS Code permits mixed case + hyphens in name/publisher. We keep the id path-safe
// (no separators, no `..`); PluginStorageStore is the backstop. Phase A maps only
// the subset a command-only extension needs (main, activationEvents, commands).
const ID_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/

export function parseVscodeManifest(raw: unknown): VscodeManifestParseResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'manifest is not an object' }
  const m = raw as Record<string, unknown>
  for (const field of ['name', 'publisher', 'version'] as const) {
    if (typeof m[field] !== 'string' || (m[field] as string).length === 0) {
      return { ok: false, error: `missing or invalid "${field}"` }
    }
  }
  for (const field of ['name', 'publisher'] as const) {
    if (!ID_SEGMENT.test(m[field] as string)) {
      return { ok: false, error: `"${field}" must match ${ID_SEGMENT} (path-safe id segment)` }
    }
  }
  const engines = m.engines as Record<string, unknown> | undefined
  if (!engines || typeof engines.vscode !== 'string') {
    return { ok: false, error: 'missing "engines.vscode"' }
  }

  const rawCommands = (m.contributes as Record<string, unknown> | undefined)?.commands
  const commands: PluginCommandContribution[] = []
  if (Array.isArray(rawCommands)) {
    for (const c of rawCommands) {
      if (typeof c === 'object' && c !== null) {
        const cmd = c as Record<string, unknown>
        if (typeof cmd.command === 'string' && typeof cmd.title === 'string') {
          commands.push({ command: cmd.command, title: cmd.title })
        }
      }
    }
  }

  const manifest: ManifoldPluginManifest = {
    name: m.name as string,
    publisher: m.publisher as string,
    version: m.version as string,
    displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
    description: typeof m.description === 'string' ? m.description : undefined,
    engines: { vscode: engines.vscode },
    main: typeof m.main === 'string' ? m.main : undefined,
    activationEvents: Array.isArray(m.activationEvents)
      ? (m.activationEvents.filter((e) => typeof e === 'string') as string[])
      : undefined,
    contributes: commands.length > 0 ? { commands } : undefined,
  }
  return { ok: true, manifest }
}
