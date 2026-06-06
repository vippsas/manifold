import { describe, expect, it } from 'vitest'
import { LAUNCHER_MODULES, LAUNCHER_MODULE_IDS } from './launcher-modules'
import { PANEL_TITLES } from '../hooks/dock-layout-helpers'

describe('launcher-modules registry', () => {
  it('lists the optional modules in order', () => {
    expect(LAUNCHER_MODULES.map((m) => m.id)).toEqual([
      'backgroundAgent', 'verdicts', 'watch',
    ])
  })

  it('every module id has a known panel title and a non-empty description', () => {
    for (const mod of LAUNCHER_MODULES) {
      expect(PANEL_TITLES[mod.id]).toBeTruthy()
      expect(mod.description.length).toBeGreaterThan(0)
    }
  })

  it('LAUNCHER_MODULE_IDS mirrors the registry', () => {
    expect([...LAUNCHER_MODULE_IDS].sort()).toEqual(
      LAUNCHER_MODULES.map((m) => m.id).sort(),
    )
  })
})
