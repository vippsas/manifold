import { describe, it, expect } from 'vitest'
import { filterTerminalResponses } from './terminal-input-filter'

describe('filterTerminalResponses', () => {
  // --- Pass-through: normal user input ---

  it('passes through plain text', () => {
    expect(filterTerminalResponses('hello')).toBe('hello')
  })

  it('passes through arrow keys', () => {
    expect(filterTerminalResponses('\x1b[A')).toBe('\x1b[A') // up
    expect(filterTerminalResponses('\x1b[B')).toBe('\x1b[B') // down
    expect(filterTerminalResponses('\x1b[C')).toBe('\x1b[C') // right
    expect(filterTerminalResponses('\x1b[D')).toBe('\x1b[D') // left
  })

  it('passes through Ctrl sequences', () => {
    expect(filterTerminalResponses('\x03')).toBe('\x03') // Ctrl+C
    expect(filterTerminalResponses('\x15')).toBe('\x15') // Ctrl+U
    expect(filterTerminalResponses('\x04')).toBe('\x04') // Ctrl+D
  })

  it('passes through bare Escape', () => {
    expect(filterTerminalResponses('\x1b')).toBe('\x1b')
  })

  it('passes through Enter and Tab', () => {
    expect(filterTerminalResponses('\r')).toBe('\r')
    expect(filterTerminalResponses('\t')).toBe('\t')
  })

  // --- Strip: OSC 10/11 color responses ---

  it('strips OSC 10 color response with ESC backslash ST', () => {
    expect(filterTerminalResponses('\x1b]10;rgb:0c0c/1010/2121\x1b\\')).toBeNull()
  })

  it('strips OSC 11 color response with ESC backslash ST', () => {
    expect(filterTerminalResponses('\x1b]11;rgb:0c0c/1010/2121\x1b\\')).toBeNull()
  })

  it('strips OSC color response with BEL ST', () => {
    expect(filterTerminalResponses('\x1b]11;rgb:ffff/ffff/ffff\x07')).toBeNull()
  })

  // --- Strip: Cursor Position Reports ---

  it('strips simple CPR', () => {
    expect(filterTerminalResponses('\x1b[1;1R')).toBeNull()
  })

  it('strips multi-digit CPR', () => {
    expect(filterTerminalResponses('\x1b[24;80R')).toBeNull()
  })

  it('strips CPR like the one seen in the bug', () => {
    expect(filterTerminalResponses('\x1b[2;1R')).toBeNull()
  })

  // --- Strip: Focus events ---

  it('strips focus-in event', () => {
    expect(filterTerminalResponses('\x1b[I')).toBeNull()
  })

  it('strips focus-out event', () => {
    expect(filterTerminalResponses('\x1b[O')).toBeNull()
  })

  // --- Mixed data ---

  it('strips responses but keeps user input', () => {
    const data = '\x1b[I' + 'ls -la' + '\x1b[2;1R'
    expect(filterTerminalResponses(data)).toBe('ls -la')
  })

  it('strips multiple response types in one string', () => {
    const data = '\x1b]11;rgb:0c0c/1010/2121\x1b\\\x1b[2;1R\x1b[I'
    expect(filterTerminalResponses(data)).toBeNull()
  })

  it('returns null when all data is responses', () => {
    const data = '\x1b[I\x1b[O\x1b[1;1R'
    expect(filterTerminalResponses(data)).toBeNull()
  })

  it('preserves user text surrounded by responses', () => {
    const data = '\x1b[I' + 'cd /tmp' + '\x1b[O'
    expect(filterTerminalResponses(data)).toBe('cd /tmp')
  })

  // --- Non-matching similar sequences ---

  it('does not strip OSC sequences with non-color IDs', () => {
    // OSC 0 (set window title) — should pass through
    expect(filterTerminalResponses('\x1b]0;my title\x07')).toBe('\x1b]0;my title\x07')
  })

  it('does not strip \x1b[H (cursor home) — not a focus event', () => {
    expect(filterTerminalResponses('\x1b[H')).toBe('\x1b[H')
  })

  it('does not strip \x1b[J (erase display) — looks similar but is not a response', () => {
    expect(filterTerminalResponses('\x1b[J')).toBe('\x1b[J')
  })

  it('does not strip partial CPR-like sequence without R suffix', () => {
    expect(filterTerminalResponses('\x1b[2;1H')).toBe('\x1b[2;1H') // cursor position set, not report
  })
})
