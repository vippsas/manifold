// src/shared/plugins/manifest.ts
/** A plugin's package.json, modeled on VS Code's extension manifest. */

/** Capabilities gate access to the privileged `manifold` API namespaces. This is the
 *  single source of truth: the manifest field, the parser, and the gated-api checks all
 *  key off it (see gated-api.ts), so a typo can't silently grant nothing or escape gating. */
export const CAPABILITIES = ['storage', 'workspace:read', 'configuration', 'agent:control', 'agent:spawn', 'lm', 'transcription:read'] as const
export type Capability = typeof CAPABILITIES[number]
export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)
}

/** Capabilities granted only to built-in (origin === 'builtin') plugins, even when declared. */
export const BUILTIN_ONLY_CAPABILITIES = ['agent:control', 'agent:spawn', 'lm', 'transcription:read'] as const satisfies readonly Capability[]
export function isBuiltinOnlyCapability(cap: Capability): boolean {
  return (BUILTIN_ONLY_CAPABILITIES as readonly string[]).includes(cap)
}

export interface PluginViewContribution {
  /** Stable, globally-unique view id, e.g. "manifold.hello.panel". */
  id: string
  /** Title shown in the "+ Apps" launcher and panel tab. */
  title: string
  /** One-line description for the launcher menu. */
  description?: string
  /** Whether the view appears in the "+ Apps" launcher. */
  launcher?: boolean
  /** 'webview' (iframe, default) or 'tree' (native TreeDataProvider). */
  type?: 'webview' | 'tree'
}

export interface PluginCommandContribution {
  command: string
  title: string
}

export interface PluginConfigurationProperty {
  type: 'string' | 'number' | 'boolean'
  default?: unknown
  description?: string
  enum?: string[]
}
export interface PluginConfiguration {
  title?: string
  properties?: Record<string, PluginConfigurationProperty>
}

export interface PluginContributions {
  views?: PluginViewContribution[]
  commands?: PluginCommandContribution[]
  configuration?: PluginConfiguration
}

export interface ManifoldPluginManifest {
  name: string
  publisher: string
  version: string
  displayName?: string
  description?: string
  /** Exactly one key is present in practice: manifold-native plugins set `manifold`, VS Code extensions set `vscode` (enforced by the parsers). */
  engines: { manifold?: string; vscode?: string }
  /** Extension-host entry (relative to the plugin root). */
  main?: string
  activationEvents?: string[]
  contributes?: PluginContributions
  capabilities?: Capability[]
}

/** A plugin discovered on disk. */
export interface PluginDescriptor {
  /** Unique id: `${publisher}.${name}`. */
  id: string
  manifest: ManifoldPluginManifest
  /** Absolute path to the plugin folder. */
  root: string
  origin: 'builtin' | 'user'
  /** Which API surface the entry module is authored against. */
  kind: 'manifold' | 'vscode'
}
