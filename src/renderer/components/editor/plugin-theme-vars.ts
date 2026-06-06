// src/renderer/components/editor/plugin-theme-vars.ts
// The set of theme CSS variables the host injects into plugin webviews (which cannot read
// the parent's computed styles across the sandbox). Read live from the document and posted
// to each iframe so plugin UIs match the active Manifold theme.
export const PLUGIN_WEBVIEW_THEME_VARS: readonly string[] = [
  '--font-sans', '--font-mono',
  '--radius-xs', '--radius-sm', '--radius-md',
  '--space-xs', '--space-sm', '--space-md', '--space-lg',
  '--type-ui', '--type-ui-small', '--type-ui-caption',
  '--control-height',
  '--bg-primary', '--bg-secondary', '--bg-input', '--bg-elevated', '--bg-chrome',
  '--text-primary', '--text-secondary', '--text-muted',
  '--accent', '--accent-text', '--accent-subtle',
  '--border', '--divider',
  '--btn-bg', '--btn-hover', '--btn-text',
  '--control-bg', '--control-border',
  '--status-done', '--status-error', '--status-running', '--status-waiting',
]

/** Collect trimmed, non-empty values for `names` using `read` (e.g. getPropertyValue). */
export function readThemeVars(read: (name: string) => string, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of names) {
    const value = read(name).trim()
    if (value) out[name] = value
  }
  return out
}
