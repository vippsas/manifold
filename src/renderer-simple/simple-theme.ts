import { applyThemeCssVars } from '../shared/themes/adapter'
import type { ConvertedTheme } from '../shared/themes/types'

const SIMPLE_RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
}

export function getSimpleRuntimeLabel(runtimeId?: string): string {
  if (!runtimeId) return 'AI Assistant'
  return SIMPLE_RUNTIME_LABELS[runtimeId] ?? runtimeId
}

/** Apply theme CSS vars + alias the developer-view names to simple-mode names */
export function applySimpleThemeVars(theme: ConvertedTheme): void {
  const vars = theme.cssVars
  applyThemeCssVars(vars)
  const root = document.documentElement
  root.style.setProperty('--bg', vars['--bg-primary'])
  root.style.setProperty('--surface', vars['--bg-secondary'])
  root.style.setProperty('--text', vars['--text-primary'])
  root.style.setProperty('--accent-dim', vars['--accent-dim'])
  root.style.setProperty('--shadow-elevated', vars['--shadow-elevated'])
  root.style.setProperty('--shadow-overlay', vars['--shadow-overlay'])
  root.style.setProperty('--shadow-subtle', vars['--shadow-subtle'])
  root.style.setProperty('--bg-chrome-hi', vars['--bg-chrome-hi'])
  root.style.setProperty('--bg-chrome-lo', vars['--bg-chrome-lo'])
}
