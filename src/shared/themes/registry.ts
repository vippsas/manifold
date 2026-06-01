import type { ThemeMeta, ConvertedTheme } from './types'
import { convertTheme } from './adapter'
import { themeList, themeDataByLabel } from './theme-data'

// ── Cache ──────────────────────────────────────────────────────────

const themeCache = new Map<string, ConvertedTheme>()

const DEFAULT_THEME = 'manifold-dark'

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

  const entries: ThemeMeta[] = []

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

  // Load from eagerly-imported theme data
  const label = themeFileMap[id]
  if (!label) {
    if (id !== DEFAULT_THEME) return loadTheme(DEFAULT_THEME)
    throw new Error(`Default theme "${DEFAULT_THEME}" not found in theme data`)
  }

  const json = themeDataByLabel[label]
  if (!json) {
    if (id !== DEFAULT_THEME) return loadTheme(DEFAULT_THEME)
    throw new Error(`Default theme "${DEFAULT_THEME}" data not found`)
  }

  const converted = convertTheme(json as Parameters<typeof convertTheme>[0], id)
  themeCache.set(id, converted)
  return converted
}

// Map legacy settings values to theme IDs
export function migrateLegacyTheme(value: string): string {
  if (value === 'dark' || value === 'vs-dark') return DEFAULT_THEME
  if (value === 'light' || value === 'vs') return DEFAULT_THEME
  return value
}
