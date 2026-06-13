import { describe, it, expect } from 'vitest'
import { formatAccelerator } from './accelerator-label'

describe('formatAccelerator', () => {
  it('renders Cmd as the ⌘ glyph', () => {
    expect(formatAccelerator('CmdOrCtrl+,')).toBe('⌘,')
  })

  it('orders modifiers in macOS canonical order ⌃⌥⇧⌘', () => {
    // Input order is Cmd, Shift but display must be ⇧⌘ (Command last).
    expect(formatAccelerator('CmdOrCtrl+Shift+P')).toBe('⇧⌘P')
    expect(formatAccelerator('CmdOrCtrl+Alt+3')).toBe('⌥⌘3')
  })

  it('renders a bare Ctrl as ⌃', () => {
    expect(formatAccelerator('Ctrl+`')).toBe('⌃`')
  })

  it('keeps punctuation keys verbatim', () => {
    expect(formatAccelerator('CmdOrCtrl+Shift+/')).toBe('⇧⌘/')
    expect(formatAccelerator('CmdOrCtrl+Shift+]')).toBe('⇧⌘]')
    expect(formatAccelerator('CmdOrCtrl+Shift+E')).toBe('⇧⌘E')
  })

  it('maps named keys to their glyphs', () => {
    expect(formatAccelerator('CmdOrCtrl+Enter')).toBe('⌘↩')
    expect(formatAccelerator('CmdOrCtrl+Shift+Left')).toBe('⇧⌘←')
  })
})
