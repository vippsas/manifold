import type { ITerminalOptions, ITheme } from '@xterm/xterm'

const DEFAULT_FONT_STACK = "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace"
const WEB_FONT_ALIAS = 'ManifoldTerminal'
const webFontLoaded = new Set<string>()
const webFontLoading = new Map<string, Promise<boolean>>()

/**
 * Load the user's font as a web font from its file data. System fonts accessed
 * via local() don't render PUA characters on Chromium's canvas. Loading the
 * actual font file bytes as a web font bypasses this platform limitation.
 */
export function loadWebFont(fontFamily: string): Promise<boolean> {
  if (webFontLoaded.has(fontFamily)) return Promise.resolve(true)
  const inflight = webFontLoading.get(fontFamily)
  if (inflight) return inflight
  const promise = (async () => {
    try {
      const dataUrl = await window.electronAPI.invoke('font:load-data', fontFamily) as string | null
      if (!dataUrl) return false
      const face = new FontFace(WEB_FONT_ALIAS, `url(${dataUrl})`)
      await face.load()
      document.fonts.add(face)
      webFontLoaded.add(fontFamily)
      return true
    } catch (err) {
      console.error('[terminal-font] loadWebFont: failed', err)
      webFontLoading.delete(fontFamily)
      return false
    }
  })()
  webFontLoading.set(fontFamily, promise)
  return promise
}

export function resolveFontFamily(terminalFontFamily?: string, useWebFont = false): string {
  const cleaned = terminalFontFamily?.replace(/^['"]|['"]$/g, '').trim()
  if (!cleaned) return DEFAULT_FONT_STACK
  const primary = useWebFont ? `'${WEB_FONT_ALIAS}', ` : ''
  return `${primary}'${cleaned}', ${DEFAULT_FONT_STACK}`
}

export function buildTerminalOptions(scrollbackLines: number, terminalFontFamily?: string, xtermTheme?: ITheme, uiScale = 1): ITerminalOptions {
  return {
    scrollback: scrollbackLines,
    fontFamily: resolveFontFamily(terminalFontFamily),
    fontSize: Math.round(13 * uiScale),
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'block',
    cursorInactiveStyle: 'outline',
    allowProposedApi: true,
    // Embedded Claude Code runs with its ANSI-palette theme (see
    // `claudeAnsiThemeArgs`), so every background it paints is one of Manifold's
    // 16 palette colours. Clicking in an agent pane makes it highlight a region
    // with `ESC[47m`, and on a dark theme `ansiWhite` is a near-white — the same
    // near-white as the default foreground, so the whole block turned into an
    // unreadable white slab. xterm re-derives a foreground per cell to hold this
    // ratio against whatever background the cell actually has; normal output is
    // already well above it and renders unchanged.
    minimumContrastRatio: 4.5,
    theme: xtermTheme,
  }
}

export function cleanFontName(terminalFontFamily?: string): string | undefined {
  return terminalFontFamily?.replace(/^['"]|['"]$/g, '').trim() || undefined
}

export { DEFAULT_FONT_STACK }
