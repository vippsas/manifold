// src/renderer/plugins/contribution-registry.test.ts
import { describe, expect, it, afterEach } from 'vitest'
import {
  getLauncherContributions,
  getPanelComponents,
  getPanelContributions,
  registerPanelContribution,
  resetToInternal,
} from './contribution-registry'

afterEach(() => resetToInternal())

describe('contribution-registry', () => {
  it('is seeded with the internal launcher modules in order', () => {
    expect(getLauncherContributions().map((p) => p.id)).toEqual([
      'backgroundAgent', 'verdicts', 'watch',
    ])
  })

  it('returns a component for each internal panel', () => {
    const components = getPanelComponents()
    for (const id of ['backgroundAgent', 'verdicts', 'watch']) {
      expect(typeof components[id]).toBe('function')
    }
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

  it('resets back to just the internal contributions', () => {
    registerPanelContribution({
      id: 'example.hello', title: 'Hello', description: 'x', launcher: true, source: 'plugin',
    })
    resetToInternal()
    expect(getLauncherContributions().map((p) => p.id)).toEqual([
      'backgroundAgent', 'verdicts', 'watch',
    ])
  })
})
