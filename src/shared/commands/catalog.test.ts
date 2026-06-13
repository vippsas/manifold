import { describe, it, expect } from 'vitest'
import { COMMANDS, COMMAND_CATEGORIES, MENU_SECTIONS } from './catalog'

describe('command catalog', () => {
  it('has unique command ids', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never binds the same accelerator to two commands', () => {
    const accels = COMMANDS.map((c) => c.accelerator).filter((a): a is string => !!a)
    const dupes = accels.filter((a, i) => accels.indexOf(a) !== i)
    expect(dupes).toEqual([])
  })

  it('gives every command a non-empty title and a known category', () => {
    for (const c of COMMANDS) {
      expect(c.title.trim().length).toBeGreaterThan(0)
      expect(COMMAND_CATEGORIES).toContain(c.category)
    }
  })

  it('places menu commands in a known section with an order', () => {
    for (const c of COMMANDS) {
      if (!c.menu) continue
      expect(MENU_SECTIONS).toContain(c.menu.section)
      expect(typeof c.menu.order).toBe('number')
    }
  })

  it('exposes the command palette and the shortcuts cheat-sheet', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(ids).toContain('general.commandPalette')
    expect(ids).toContain('help.shortcuts')
  })
})
