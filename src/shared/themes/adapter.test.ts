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
})
