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

  it('derives the active tree icon tint filter from the accent', () => {
    const blue = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        focusBorder: '#007acc',
      },
    }, 'test')

    expect(blue.cssVars['--tree-icon-active-filter']).toBe(
      'grayscale(1) sepia(1) hue-rotate(164deg) saturate(2.22) brightness(1.08) opacity(1)'
    )

    const gold = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        focusBorder: '#d4b46a',
      },
    }, 'test')

    expect(gold.cssVars['--tree-icon-active-filter']).toBe(
      'grayscale(1) sepia(1) hue-rotate(2deg) saturate(1.23) brightness(1.08) opacity(1)'
    )
  })
})
