import type { ITheme } from '@xterm/xterm'
import type { ConvertedTheme } from './types'

// ── Color helpers ──────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = amount / 100
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f)
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = amount / 100
  return rgbToHex(r * (1 - f), g * (1 - f), b * (1 - f))
}

function withOpacity(hex: string, opacity: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function normalizeHex(color: string | undefined): string | undefined {
  if (!color) return undefined
  const c = color.replace('#', '')
  // Strip alpha channel if present (8-char or 4-char hex)
  if (c.length === 8) return '#' + c.slice(0, 6)
  if (c.length === 4) return '#' + c.slice(0, 3)
  return '#' + c
}

// ── ANSI fallback defaults ─────────────────────────────────────────

const DARK_ANSI = {
  black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
  blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
}

const LIGHT_ANSI = {
  black: '#000000', red: '#cd3131', green: '#00bc00', yellow: '#949800',
  blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555',
}

const DARK_BRIGHT_ANSI = {
  brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
  brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#ffffff',
}

const LIGHT_BRIGHT_ANSI = {
  brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#14ce14', brightYellow: '#b5ba00',
  brightBlue: '#0066cc', brightMagenta: '#d670d6', brightCyan: '#07b3c8', brightWhite: '#000000',
}

// ── Theme Converter ────────────────────────────────────────────────

interface MonacoThemeJson {
  base: 'vs' | 'vs-dark' | 'hc-black'
  inherit: boolean
  rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>
  colors: Record<string, string>
}

export function convertTheme(themeJson: MonacoThemeJson, _themeId: string): ConvertedTheme {
  const colors = themeJson.colors ?? {}
  const c = (key: string): string | undefined => normalizeHex(colors[key])

  // Determine theme type from background luminance
  const editorBg = c('editor.background') ?? (themeJson.base === 'vs' ? '#ffffff' : '#1e1e1e')
  const isDark = luminance(editorBg) <= 0.5
  const type = isDark ? 'dark' : 'light'
  const adjust = isDark ? lighten : darken

  const editorFg = c('editor.foreground') ?? (isDark ? '#d4d4d4' : '#1e1e1e')
  const accent = c('focusBorder') ?? c('button.background') ?? '#007acc'

  // ── CSS variable mapping ───────────────────────────────────────
  // Surface hierarchy: sidebar (deepest) → primary (editor) → secondary (headers)

  const cssVars: Record<string, string> = {
    '--bg-primary': editorBg,
    '--bg-secondary': c('editorGroupHeader.tabsBackground')
      ?? (isDark ? lighten(editorBg, 8) : darken(editorBg, 5)),
    '--bg-sidebar': c('sideBar.background')
      ?? (isDark ? darken(editorBg, 15) : darken(editorBg, 8)),
    '--bg-input': c('input.background')
      ?? (isDark ? lighten(editorBg, 5) : darken(editorBg, 3)),

    '--text-primary': editorFg,
    '--text-secondary': c('descriptionForeground') ?? withOpacity(editorFg, 0.65),
    '--text-muted': c('disabledForeground') ?? withOpacity(editorFg, 0.4),

    '--accent': accent,
    '--accent-hover': lighten(accent, 15),

    '--border': c('panel.border') ?? c('editorGroup.border')
      ?? (isDark ? lighten(editorBg, 18) : darken(editorBg, 18)),
    '--divider': c('editorGroup.border')
      ?? (isDark ? lighten(editorBg, 12) : darken(editorBg, 12)),

    '--scrollbar-thumb': c('scrollbarSlider.background')
      ?? (isDark ? lighten(editorBg, 22) : darken(editorBg, 22)),
    '--scrollbar-track': c('scrollbarSlider.activeBackground') ?? 'transparent',

    // Status colors — keep consistent per theme type
    '--success': isDark ? '#66bb6a' : '#388e3c',
    '--warning': isDark ? '#ffa726' : '#f57c00',
    '--error': isDark ? '#ef5350' : '#d32f2f',

    '--status-running': isDark ? '#42a5f5' : '#1e88e5',
    '--status-waiting': isDark ? '#ffca28' : '#f9a825',
    '--status-done': isDark ? '#66bb6a' : '#388e3c',
    '--status-error': isDark ? '#ef5350' : '#d32f2f',

    '--diff-added-bg': c('diffEditor.insertedTextBackground')
      ?? (isDark ? 'rgba(102, 187, 106, 0.12)' : 'rgba(56, 142, 60, 0.08)'),
    '--diff-deleted-bg': c('diffEditor.removedTextBackground')
      ?? (isDark ? 'rgba(239, 83, 80, 0.12)' : 'rgba(211, 47, 47, 0.08)'),
    '--diff-added-gutter': isDark ? 'rgba(102, 187, 106, 0.3)' : 'rgba(56, 142, 60, 0.25)',
    '--diff-deleted-gutter': isDark ? 'rgba(239, 83, 80, 0.3)' : 'rgba(211, 47, 47, 0.25)',
  }

  // ── xterm.js ITheme mapping ────────────────────────────────────

  const ansiDefaults = isDark ? DARK_ANSI : LIGHT_ANSI
  const brightDefaults = isDark ? DARK_BRIGHT_ANSI : LIGHT_BRIGHT_ANSI

  const xtermTheme: ITheme = {
    background: c('terminal.background') ?? editorBg,
    foreground: c('terminal.foreground') ?? editorFg,
    cursor: c('terminalCursor.foreground') ?? accent,
    cursorAccent: c('terminalCursor.background') ?? editorBg,
    selectionBackground: c('terminal.selectionBackground') ?? c('editor.selectionBackground') ?? withOpacity(accent, 0.3),

    black: c('terminal.ansiBlack') ?? ansiDefaults.black,
    red: c('terminal.ansiRed') ?? ansiDefaults.red,
    green: c('terminal.ansiGreen') ?? ansiDefaults.green,
    yellow: c('terminal.ansiYellow') ?? ansiDefaults.yellow,
    blue: c('terminal.ansiBlue') ?? ansiDefaults.blue,
    magenta: c('terminal.ansiMagenta') ?? ansiDefaults.magenta,
    cyan: c('terminal.ansiCyan') ?? ansiDefaults.cyan,
    white: c('terminal.ansiWhite') ?? ansiDefaults.white,

    brightBlack: c('terminal.ansiBrightBlack') ?? brightDefaults.brightBlack,
    brightRed: c('terminal.ansiBrightRed') ?? brightDefaults.brightRed,
    brightGreen: c('terminal.ansiBrightGreen') ?? brightDefaults.brightGreen,
    brightYellow: c('terminal.ansiBrightYellow') ?? brightDefaults.brightYellow,
    brightBlue: c('terminal.ansiBrightBlue') ?? brightDefaults.brightBlue,
    brightMagenta: c('terminal.ansiBrightMagenta') ?? brightDefaults.brightMagenta,
    brightCyan: c('terminal.ansiBrightCyan') ?? brightDefaults.brightCyan,
    brightWhite: c('terminal.ansiBrightWhite') ?? brightDefaults.brightWhite,
  }

  // ── Monaco theme (pass-through with normalized colors) ─────────

  const monacoTheme = {
    base: themeJson.base,
    inherit: themeJson.inherit,
    rules: themeJson.rules,
    colors: themeJson.colors,
  }

  return { cssVars, monacoTheme, xtermTheme, type }
}

// ── CSS Variable Application ───────────────────────────────────────

export function applyThemeCssVars(vars: Record<string, string>): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}
