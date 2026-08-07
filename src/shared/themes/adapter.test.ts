import { describe, expect, it } from 'vitest'
import { convertTheme } from './adapter'

describe('convertTheme', () => {
  it('defines status semantic tokens for plugin webviews', () => {
    const theme = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        'terminal.ansiCyan': '#7FC8E8',
      },
    }, 'test')

    expect(theme.cssVars['--status-done']).toBe('#66bb6a')
    expect(theme.cssVars['--status-waiting']).toBe('#ffa726')
    expect(theme.cssVars['--status-error']).toBe('#ef5350')
    expect(theme.cssVars['--status-running']).toBe('#7FC8E8')
  })

  it('maps the terminal accent into extended ANSI palette slot 16', () => {
    const withCursor = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        focusBorder: '#5B8DEF',
        'terminalCursor.foreground': '#E2C275',
      },
    }, 'test')

    expect(withCursor.xtermTheme.extendedAnsi).toEqual(['#E2C275'])
    expect(withCursor.xtermTheme.cursor).toBe('#E2C275')

    const withoutCursor = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        focusBorder: '#5B8DEF',
      },
    }, 'test')

    expect(withoutCursor.xtermTheme.extendedAnsi).toEqual(['#5B8DEF'])
  })

  it('derives instrumentation effect tints per theme type', () => {
    const dark = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        focusBorder: '#E2C275',
      },
    }, 'test')

    expect(dark.cssVars['--effect-glow']).toBe('rgba(226, 194, 117, 0.16)')
    expect(dark.cssVars['--star-tint']).toBe('rgba(230, 236, 247, 0.5)')
    expect(dark.cssVars['--grid-tint']).toBe('rgba(226, 194, 117, 0.1)')

    const light = convertTheme({
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#1E1E1E',
        focusBorder: '#007acc',
      },
    }, 'test')

    expect(light.cssVars['--effect-glow']).toBe('rgba(0, 122, 204, 0.1)')
    expect(light.cssVars['--star-tint']).toBe('rgba(30, 30, 30, 0.38)')
    expect(light.cssVars['--grid-tint']).toBe('rgba(0, 122, 204, 0.07)')
  })
})
