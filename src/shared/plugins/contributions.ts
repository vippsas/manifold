// src/shared/plugins/contributions.ts
/**
 * Declarative descriptions of what a plugin (or a built-in module) contributes
 * to Manifold's UI. Modeled on VS Code's `contributes`, renamed for Manifold.
 *
 * Shared across the main process, the (future) extension host, and the renderer
 * so all three agree on the shape. Phase 0 uses only `PanelContribution`.
 */

/** Where a contribution originates. */
export type ContributionSource = 'internal' | 'plugin'

/**
 * A panel/view a module contributes. Internal (built-in) modules map to an
 * existing dock panel; plugins (Phase 1) map to a webview panel.
 */
export interface PanelContribution {
  /** Stable view id. Internal modules reuse their existing dock panel id. */
  id: string
  /** Title shown in the "+ Apps" launcher and the panel tab. */
  title: string
  /** One-line description shown in the "+ Apps" launcher menu. */
  description: string
  /** Whether the panel appears in the "+ Apps" launcher menu. */
  launcher: boolean
  /** Origin of the contribution. */
  source: ContributionSource
  /** 'webview' (default) or 'tree'. */
  kind?: 'webview' | 'tree'
}
