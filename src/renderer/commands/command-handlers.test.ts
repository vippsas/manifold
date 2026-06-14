import { describe, it, expect, vi } from 'vitest'
import { createCommandHandlers, type CommandContext } from './command-handlers'
import { COMMANDS } from '../../shared/commands/catalog'

function mockContext(): CommandContext {
  return {
    openSettings: vi.fn(),
    openCommandPalette: vi.fn(),
    openShortcuts: vi.fn(),
    openAbout: vi.fn(),
    openQuickOpen: vi.fn(),
    findInFiles: vi.fn(),
    jumpToFavorite: vi.fn(),
    newAgent: vi.fn(),
    nextAgent: vi.fn(),
    previousAgent: vi.fn(),
    deleteActiveAgent: vi.fn(),
    commit: vi.fn(),
    createPR: vi.fn(),
    togglePanel: vi.fn(),
    openModule: vi.fn(),
    toggleTheme: vi.fn(),
    openWorktrees: vi.fn(),
  }
}

describe('createCommandHandlers', () => {
  it('provides a handler for every catalog command', () => {
    const handlers = createCommandHandlers(mockContext())
    for (const command of COMMANDS) {
      expect(typeof handlers[command.id]).toBe('function')
    }
  })

  it('routes simple commands to their context method', () => {
    const ctx = mockContext()
    const handlers = createCommandHandlers(ctx)
    handlers['general.settings']()
    handlers['general.commandPalette']()
    handlers['agents.next']()
    handlers['scm.commit']()
    expect(ctx.openSettings).toHaveBeenCalledOnce()
    expect(ctx.openCommandPalette).toHaveBeenCalledOnce()
    expect(ctx.nextAgent).toHaveBeenCalledOnce()
    expect(ctx.commit).toHaveBeenCalledOnce()
  })

  it('maps favorites to a zero-based index', () => {
    const ctx = mockContext()
    const handlers = createCommandHandlers(ctx)
    handlers['navigation.favorite.3']()
    expect(ctx.jumpToFavorite).toHaveBeenCalledWith(2)
  })

  it('maps panel-toggle commands to their dock panel id', () => {
    const ctx = mockContext()
    const handlers = createCommandHandlers(ctx)
    handlers['view.toggle.shell']()
    expect(ctx.togglePanel).toHaveBeenCalledWith('shell')
  })

  it('maps focus commands to openModule for the right panel', () => {
    const ctx = mockContext()
    const handlers = createCommandHandlers(ctx)
    handlers['view.focusTerminal']()
    handlers['view.focusFiles']()
    expect(ctx.openModule).toHaveBeenCalledWith('shell')
    expect(ctx.openModule).toHaveBeenCalledWith('fileTree')
  })
})
