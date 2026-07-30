// src/renderer/components/editor/dock-panels.contributions.test.tsx
import { describe, expect, it } from 'vitest'
import { PANEL_COMPONENTS } from './dock-panels'

describe('PANEL_COMPONENTS module entries', () => {
  it('still includes the six core panels', () => {
    for (const id of ['agent', 'editor', 'modifiedFiles', 'shell', 'projects']) {
      expect(typeof PANEL_COMPONENTS[id]).toBe('function')
    }
  })

  it('includes the plugin webview host components', () => {
    // Internal-contribution components are spread in from the registry (currently
    // none — Verdicts moved to the manifold.statistics plugin in #750); the plugin
    // view hosts render every plugin-contributed panel.
    expect(typeof PANEL_COMPONENTS.pluginView).toBe('function')
    expect(typeof PANEL_COMPONENTS.pluginTreeView).toBe('function')
  })
})
