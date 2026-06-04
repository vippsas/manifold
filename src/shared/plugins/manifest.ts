// src/shared/plugins/manifest.ts
/** A plugin's package.json, modeled on VS Code's extension manifest. */

export interface PluginViewContribution {
  /** Stable, globally-unique view id, e.g. "manifold.hello.panel". */
  id: string
  /** Title shown in the "+ Apps" launcher and panel tab. */
  title: string
  /** One-line description for the launcher menu. */
  description?: string
  /** Whether the view appears in the "+ Apps" launcher. */
  launcher?: boolean
}

export interface PluginCommandContribution {
  command: string
  title: string
}

export interface PluginContributions {
  views?: PluginViewContribution[]
  commands?: PluginCommandContribution[]
  configuration?: unknown
}

export interface ManifoldPluginManifest {
  name: string
  publisher: string
  version: string
  displayName?: string
  description?: string
  engines: { manifold: string }
  /** Extension-host entry (relative to the plugin root). Consumed in Phase 1b. */
  main?: string
  activationEvents?: string[]
  contributes?: PluginContributions
  capabilities?: string[]
}

/** A plugin discovered on disk. */
export interface PluginDescriptor {
  /** Unique id: `${publisher}.${name}`. */
  id: string
  manifest: ManifoldPluginManifest
  /** Absolute path to the plugin folder. */
  root: string
  origin: 'builtin' | 'user'
}
