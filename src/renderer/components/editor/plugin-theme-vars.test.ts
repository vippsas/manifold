import { describe, it, expect } from 'vitest'
import { readThemeVars, PLUGIN_WEBVIEW_THEME_VARS } from './plugin-theme-vars'

describe('readThemeVars', () => {
  it('collects non-empty values for the requested names', () => {
    const values: Record<string, string> = { '--bg-primary': '#282a36', '--text-primary': ' #fff ', '--accent': '' }
    const out = readThemeVars((n) => values[n] ?? '', ['--bg-primary', '--text-primary', '--accent'])
    expect(out).toEqual({ '--bg-primary': '#282a36', '--text-primary': '#fff' })
  })

  it('exposes a non-empty token name list including loop tokens', () => {
    expect(PLUGIN_WEBVIEW_THEME_VARS).toContain('--text-muted')
    expect(PLUGIN_WEBVIEW_THEME_VARS).toContain('--status-running')
    expect(PLUGIN_WEBVIEW_THEME_VARS.length).toBeGreaterThan(20)
  })
})
