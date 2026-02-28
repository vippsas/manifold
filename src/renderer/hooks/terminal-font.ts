import type { ITerminalOptions, ITheme } from '@xterm/xterm'

const DEFAULT_FONT_STACK = "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace"
const WEB_FONT_ALIAS = 'ManifoldTerminal'
let webFontLoaded = false
let webFontLoading: Promise<boolean> | null = null

/**
 * Load the user's font as a web font from its file data. System fonts accessed
 * via local() don't render PUA characters on Chromium's canvas. Loading the
 * actual font file bytes as a web font bypasses this platform limitation.
 */
export function loadWebFont(fontFamily: string): Promise<boolean> {
  if (webFontLoaded) return Promise.resolve(true)
  if (webFontLoading) return webFontLoading
  webFontLoading = (async () => {
    try {
      console.log('[useTerminal] loadWebFont: requesting font data for', fontFamily)
      const dataUrl = await window.electronAPI.invoke('font:load-data', fontFamily) as string | null
      console.log('[useTerminal] loadWebFont: got data URL?', !!dataUrl, dataUrl ? `(${dataUrl.length} chars)` : '')
      if (!dataUrl) return false
      const face = new FontFace(WEB_FONT_ALIAS, `url(${dataUrl})`)
      await face.load()
      document.fonts.add(face)
      webFontLoaded = true
      console.log('[useTerminal] loadWebFont: web font loaded and added to document.fonts')
      return true
    } catch (err) {
      console.error('[useTerminal] loadWebFont: failed', err)
      return false
    }
  })()
  return webFontLoading
}

export function resolveFontFamily(terminalFontFamily?: string, useWebFont = false): string {
  const cleaned = terminalFontFamily?.replace(/^['"]|['"]$/g, '').trim()
  if (!cleaned) return DEFAULT_FONT_STACK
  const primary = useWebFont ? `'${WEB_FONT_ALIAS}', ` : ''
  return `${primary}'${cleaned}', ${DEFAULT_FONT_STACK}`
}

export function buildTerminalOptions(scrollbackLines: number, terminalFontFamily?: string, xtermTheme?: ITheme): ITerminalOptions {
  return {
    scrollback: scrollbackLines,
    fontFamily: resolveFontFamily(terminalFontFamily),
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'block',
    cursorInactiveStyle: 'outline',
    allowProposedApi: true,
    theme: xtermTheme,
  }
}

export function cleanFontName(terminalFontFamily?: string): string | undefined {
  return terminalFontFamily?.replace(/^['"]|['"]$/g, '').trim() || undefined
}

export { DEFAULT_FONT_STACK }
