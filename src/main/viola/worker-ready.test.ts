import { describe, expect, it } from 'vitest'
import { workerComposerReady } from './worker-ready'

describe('workerComposerReady', () => {
  it('is not fooled by codex\'s startup banner, which carries prompt-like characters', () => {
    // The shared status detector calls this "waiting"; Viola then typed a prompt into a TUI with
    // no composer yet, and the text was lost.
    const banner = '╭──╮│ >_ OpenAI Codex (v0.153.0) │╰──╯\nTip: use ! for shell • Starting MCP servers (0/2): codex_apps, nod'
    expect(workerComposerReady('codex', banner)).toBe(false)
  })

  it('accepts codex once its composer is on screen and MCP startup has finished', () => {
    const ready = '│ model: gpt-5.6 │\n╰──╯\n› Ask Codex to do anything\n  gpt-5.6 xhigh · /model to change'
    expect(workerComposerReady('codex', ready)).toBe(true)
  })

  it('refuses codex while its update menu is showing, whatever else is on screen', () => {
    const menu = '› 1. Update now (runs `brew upgrade --cask codex`)\n  2. Skip this version'
    expect(workerComposerReady('codex', menu)).toBe(false)
  })

  it('accepts claude at an idle prompt and refuses it mid-turn or at a dialog', () => {
    expect(workerComposerReady('claude', 'Welcome back\n❯ ')).toBe(true)
    expect(workerComposerReady('claude', '❯ \n⠋ Thinking… (esc to interrupt)')).toBe(false)
    expect(workerComposerReady('claude', 'Do you trust the files in this folder?\n❯ 1. Yes, proceed')).toBe(false)
  })

  it('falls back to a bare prompt glyph for runtimes without a specific rule', () => {
    expect(workerComposerReady('gemini', 'Gemini CLI\n❯ ')).toBe(true)
    expect(workerComposerReady('gemini', 'Loading…')).toBe(false)
  })
})
