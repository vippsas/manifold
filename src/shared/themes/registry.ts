import type { ThemeMeta, ConvertedTheme } from './types'
import { convertTheme } from './adapter'
import { themeList, themeDataByLabel } from './theme-data'

// ── Cache ──────────────────────────────────────────────────────────

const themeCache = new Map<string, ConvertedTheme>()

// ── Built-in themes (Monaco defaults) ──────────────────────────────

const BUILTIN_THEMES: ThemeMeta[] = [
  { id: 'vs-dark', label: 'Dark (Visual Studio)', type: 'dark' },
  { id: 'vs', label: 'Light (Visual Studio)', type: 'light' },
]

// ── Theme file name mapping ────────────────────────────────────────

const themeFileMap = themeList

// ── Lazy type detection ────────────────────────────────────────────

let cachedList: ThemeMeta[] | null = null

function detectType(themeJson: { base: string }): 'dark' | 'light' {
  return themeJson.base === 'vs' ? 'light' : 'dark'
}

// ── Public API ─────────────────────────────────────────────────────

export function getThemeList(): ThemeMeta[] {
  if (cachedList) return cachedList

  const entries: ThemeMeta[] = [...BUILTIN_THEMES]

  for (const [id, label] of Object.entries(themeFileMap)) {
    const json = themeDataByLabel[label] as { base: string } | undefined
    if (json) {
      entries.push({ id, label, type: detectType(json) })
    }
  }

  cachedList = entries
  return cachedList
}

export function loadTheme(id: string): ConvertedTheme {
  const cached = themeCache.get(id)
  if (cached) return cached

  // Handle built-in Monaco themes
  if (id === 'vs-dark') {
    const builtin: ConvertedTheme = {
      cssVars: getBuiltinCssVars('dark'),
      monacoTheme: { base: 'vs-dark', inherit: true, rules: [], colors: {} },
      xtermTheme: getBuiltinXtermTheme('dark'),
      type: 'dark',
    }
    themeCache.set(id, builtin)
    return builtin
  }

  if (id === 'vs') {
    const builtin: ConvertedTheme = {
      cssVars: getBuiltinCssVars('light'),
      monacoTheme: { base: 'vs', inherit: true, rules: [], colors: {} },
      xtermTheme: getBuiltinXtermTheme('light'),
      type: 'light',
    }
    themeCache.set(id, builtin)
    return builtin
  }

  // Load from eagerly-imported theme data
  const label = themeFileMap[id]
  if (!label) {
    return loadTheme('vs-dark')
  }

  const json = themeDataByLabel[label]
  if (!json) {
    return loadTheme('vs-dark')
  }

  const converted = convertTheme(json as Parameters<typeof convertTheme>[0], id)
  themeCache.set(id, converted)
  return converted
}

// Map legacy settings values to theme IDs
export function migrateLegacyTheme(value: string): string {
  if (value === 'dark') return 'vs-dark'
  if (value === 'light') return 'vs'
  return value
}

// ── Built-in theme data ────────────────────────────────────────────
// These match the original hardcoded values from theme.css

function getBuiltinCssVars(type: 'dark' | 'light'): Record<string, string> {
  if (type === 'dark') {
    return {
      '--bg-primary': '#1a1a2e',
      '--bg-secondary': '#16213e',
      '--bg-sidebar': '#0f1626',
      '--bg-input': '#1e2a45',
      '--text-primary': '#e0e0e0',
      '--text-secondary': '#8899aa',
      '--text-muted': '#556677',
      '--accent': '#4fc3f7',
      '--accent-text': '#000000',
      '--accent-hover': '#29b6f6',
      '--success': '#66bb6a',
      '--warning': '#ffa726',
      '--error': '#ef5350',
      '--border': '#2a3a5c',
      '--divider': '#253352',
      '--status-running': '#42a5f5',
      '--status-waiting': '#ffca28',
      '--status-done': '#66bb6a',
      '--status-error': '#ef5350',
      '--diff-added-bg': 'rgba(102, 187, 106, 0.12)',
      '--diff-deleted-bg': 'rgba(239, 83, 80, 0.12)',
      '--diff-added-gutter': 'rgba(102, 187, 106, 0.3)',
      '--diff-deleted-gutter': 'rgba(239, 83, 80, 0.3)',
      '--scrollbar-thumb': '#3a4a6c',
      '--scrollbar-track': 'transparent',
    }
  }
  return {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f5f7fa',
    '--bg-sidebar': '#ebeef2',
    '--bg-input': '#f0f2f5',
    '--text-primary': '#1a1a2e',
    '--text-secondary': '#5a6a7a',
    '--text-muted': '#9aa5b0',
    '--accent': '#1976d2',
    '--accent-text': '#ffffff',
    '--accent-hover': '#1565c0',
    '--success': '#388e3c',
    '--warning': '#f57c00',
    '--error': '#d32f2f',
    '--border': '#d0d7de',
    '--divider': '#e0e4ea',
    '--status-running': '#1e88e5',
    '--status-waiting': '#f9a825',
    '--status-done': '#388e3c',
    '--status-error': '#d32f2f',
    '--diff-added-bg': 'rgba(56, 142, 60, 0.08)',
    '--diff-deleted-bg': 'rgba(211, 47, 47, 0.08)',
    '--diff-added-gutter': 'rgba(56, 142, 60, 0.25)',
    '--diff-deleted-gutter': 'rgba(211, 47, 47, 0.25)',
    '--scrollbar-thumb': '#c0c8d0',
    '--scrollbar-track': 'transparent',
  }
}

function getBuiltinXtermTheme(type: 'dark' | 'light'): import('@xterm/xterm').ITheme {
  if (type === 'dark') {
    return {
      background: '#1a1a2e',
      foreground: '#e0e0e0',
      cursor: '#ffcc00',
      cursorAccent: '#1a1a2e',
      selectionBackground: '#4fc3f744',
    }
  }
  return {
    background: '#ffffff',
    foreground: '#1a1a2e',
    cursor: '#1976d2',
    cursorAccent: '#ffffff',
    selectionBackground: '#1976d244',
  }
}
