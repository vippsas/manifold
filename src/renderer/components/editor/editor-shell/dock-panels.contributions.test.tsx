// src/renderer/components/editor/dock-panels.contributions.test.tsx
import { describe, expect, it } from 'vitest'
import { PANEL_COMPONENTS } from './dock-panels'

describe('PANEL_COMPONENTS module entries', () => {
  it('still includes the four core panels', () => {
    for (const id of ['agent', 'editor', 'shell', 'sidebar']) {
      expect(typeof PANEL_COMPONENTS[id]).toBe('function')
    }
  })

  // The sidebar swaps its views internally, so they must NOT be dock panels of
  // their own — a stray registration here is how a view would end up able to
  // claim a column again.
  it('registers no panel for the views that live inside the sidebar', () => {
    for (const id of ['projects', 'sourceControl', 'search', 'modifiedFiles']) {
      expect(PANEL_COMPONENTS[id]).toBeUndefined()
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
