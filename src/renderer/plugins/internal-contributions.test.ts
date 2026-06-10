// src/renderer/plugins/internal-contributions.test.ts
import { describe, expect, it } from 'vitest'
import { INTERNAL_PANELS } from './internal-contributions'

describe('INTERNAL_PANELS', () => {
  it('lists the built-in modules in launcher order', () => {
    expect(INTERNAL_PANELS.map((p) => p.id)).toEqual([
      'backgroundAgent', 'verdicts',
    ])
  })

  it('marks every entry as an internal launcher panel with a renderable component', () => {
    for (const p of INTERNAL_PANELS) {
      expect(p.source).toBe('internal')
      expect(p.launcher).toBe(true)
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
      expect(typeof p.component).toBe('function')
    }
  })
})
