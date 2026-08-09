// src/renderer/plugins/contribution-registry.test.ts
import { describe, expect, it, afterEach } from 'vitest'
import {
  getLauncherContributions,
  getPanelComponents,
  getPanelContributions,
  getPluginContributions,
  registerPanelContribution,
  resetToInternal,
} from './contribution-registry'

afterEach(() => resetToInternal())

describe('contribution-registry', () => {
  it('is seeded empty — built-in launcher modules now ship as plugins', () => {
    expect(getLauncherContributions()).toEqual([])
  })

  it('returns a component for a registered contribution that carries one', () => {
    const Internal = (): null => null
    registerPanelContribution({
      id: 'internal.example', title: 'Example', description: 'x', launcher: true, source: 'internal', component: Internal,
    })
    expect(getPanelComponents()['internal.example']).toBe(Internal)
  })

  it('lets a plugin register a launcher contribution without a component', () => {
    registerPanelContribution({
      id: 'example.hello',
      title: 'Hello',
      description: 'An example plugin panel.',
      launcher: true,
      source: 'plugin',
    })
    expect(getLauncherContributions().map((p) => p.id)).toContain('example.hello')
    expect(getPanelComponents()['example.hello']).toBeUndefined()
    expect(getPanelContributions().some((p) => p.id === 'example.hello')).toBe(true)
  })

  // The activity rail shows every enabled plugin, so its selector must ignore
  // `launcher` — which governs the agent's Apps list only — and must not pick
  // up internal contributions, which the rail's built-in groups already cover.
  it('collects plugin views for the rail regardless of the launcher flag', () => {
    registerPanelContribution({
      id: 'example.stats', title: 'Statistics', description: 'x', launcher: false, source: 'plugin',
    })
    registerPanelContribution({
      id: 'internal.example', title: 'Example', description: 'x', launcher: true, source: 'internal',
    })

    expect(getPluginContributions().map((p) => p.id)).toEqual(['example.stats'])
    expect(getLauncherContributions().map((p) => p.id)).toEqual(['internal.example'])
  })

  it('resets back to just the internal contributions', () => {
    registerPanelContribution({
      id: 'example.hello', title: 'Hello', description: 'x', launcher: true, source: 'plugin',
    })
    resetToInternal()
    expect(getLauncherContributions()).toEqual([])
  })
})
