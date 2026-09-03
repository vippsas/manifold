import { describe, expect, it } from 'vitest'
import { blockingDialog, composerVisible } from './worker-ready'

describe('blockingDialog', () => {
  it('names codex\'s update menu, where Enter runs a package upgrade', () => {
    expect(blockingDialog('› 1. Update now (runs `brew upgrade --cask codex`)\n  2. Skip'))
      .toMatch(/update/i)
  })

  it('names a folder-trust dialog', () => {
    expect(blockingDialog('Do you trust the files in this folder?\n❯ 1. Yes, proceed')).toMatch(/trust/i)
  })

  it('names a permission prompt the worker cannot answer itself', () => {
    const prompt = 'Do you want to proceed?\n❯ 1. Yes\n  2. No\n\nEsc to cancel · Tab to amend'
    expect(blockingDialog(prompt)).toMatch(/approval|proceed/i)
  })

  it('is silent for an ordinary terminal, however prompt-like', () => {
    expect(blockingDialog('› Ask Codex to do anything')).toBeNull()
    expect(blockingDialog('Welcome back\n❯ ')).toBeNull()
    // A worker discussing an update in its own output must not look like a menu.
    expect(blockingDialog('I will update now the README section on OpenAI.')).toBeNull()
    // A worker merely discussing approval must not read as a prompt.
    expect(blockingDialog('The reviewer will decide whether to proceed with the fix.')).toBeNull()
  })
})

describe('composerVisible', () => {
  it('accepts a drawn composer even while MCP servers are still starting', () => {
    // codex accepts typing during startup, and its slowest configured server allows 120s —
    // treating startup as not-ready failed a healthy worker before it was ever prompted.
    const starting = '› Ask Codex to do anything\nTip: use ! for shell • Starting MCP servers (0/4): node_repl'
    expect(composerVisible('codex', starting)).toBe(true)
  })

  it('accepts claude at its prompt', () => {
    expect(composerVisible('claude', 'Welcome back\n❯ ')).toBe(true)
  })

  it('reports nothing drawn yet for an empty or pre-banner screen', () => {
    expect(composerVisible('codex', '')).toBe(false)
    expect(composerVisible('claude', 'Loading…')).toBe(false)
  })

  it('does not require a quiet screen, since a TUI animates while idle', () => {
    // The previous gate also demanded 1.5s of output silence; a spinner never allows that.
    expect(composerVisible('codex', '⠋ ⠙ ⠹ › Ask Codex to do anything')).toBe(true)
  })
})
