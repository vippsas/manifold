import { useEffect, useRef, type RefObject } from 'react'
import { Terminal, type ITerminalOptions, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

interface AgentOutputEvent {
  sessionId: string
  data: string
}

interface UseTerminalOptions {
  sessionId: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
}

interface UseTerminalResult {
  containerRef: RefObject<HTMLDivElement | null>
}

const DEFAULT_FONT_STACK = "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace"
const WEB_FONT_ALIAS = 'ManifoldTerminal'
let webFontLoaded = false
let webFontLoading: Promise<boolean> | null = null

/**
 * Load the user's font as a web font from its file data. System fonts accessed
 * via local() don't render PUA characters on Chromium's canvas. Loading the
 * actual font file bytes as a web font bypasses this platform limitation.
 */
function loadWebFont(fontFamily: string): Promise<boolean> {
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

function resolveFontFamily(terminalFontFamily?: string, useWebFont = false): string {
  const cleaned = terminalFontFamily?.replace(/^['"]|['"]$/g, '').trim()
  if (!cleaned) return DEFAULT_FONT_STACK
  const primary = useWebFont ? `'${WEB_FONT_ALIAS}', ` : ''
  return `${primary}'${cleaned}', ${DEFAULT_FONT_STACK}`
}

function buildTerminalOptions(scrollbackLines: number, terminalFontFamily?: string, xtermTheme?: ITheme): ITerminalOptions {
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

export function useTerminal({ sessionId, scrollbackLines, terminalFontFamily, xtermTheme }: UseTerminalOptions): UseTerminalResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  // Update theme on running terminals without recreating them
  useEffect(() => {
    if (terminalRef.current && xtermTheme) {
      terminalRef.current.options.theme = xtermTheme
    }
  }, [xtermTheme])

  // Update font family on running terminals without recreating them.
  // Loads the font file as a web font to bypass Chromium canvas PUA limitations.
  useEffect(() => {
    const terminal = terminalRef.current
    console.log('[useTerminal] font effect: terminalFontFamily =', terminalFontFamily, 'terminal exists =', !!terminal)
    if (!terminal) return
    const cleaned = terminalFontFamily?.replace(/^['"]|['"]$/g, '').trim()
    if (!cleaned) {
      terminal.options.fontFamily = DEFAULT_FONT_STACK
      terminal.clearTextureAtlas()
      fitAddonRef.current?.fit()
      return
    }
    // First apply the system font immediately, then upgrade to web font
    terminal.options.fontFamily = resolveFontFamily(terminalFontFamily)
    console.log('[useTerminal] font effect: loading web font for', cleaned)
    void loadWebFont(cleaned).then((loaded) => {
      console.log('[useTerminal] font effect: web font loaded =', loaded)
      if (terminalRef.current === terminal) {
        terminal.options.fontFamily = resolveFontFamily(terminalFontFamily, loaded)
        terminal.clearTextureAtlas()
        fitAddonRef.current?.fit()
      }
    })
  }, [terminalFontFamily])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal(buildTerminalOptions(scrollbackLines, terminalFontFamily, xtermTheme))
    terminalRef.current = terminal
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon((_event, uri) => {
      window.open(uri)
    }))
    const unicodeAddon = new Unicode11Addon()
    terminal.loadAddon(unicodeAddon)
    terminal.unicode.activeVersion = '11'
    terminal.open(container)

    // Use WebGL renderer for proper Nerd Font / PUA glyph rendering.
    // The default canvas renderer struggles with Private Use Area characters
    // on macOS. Falls back to canvas silently if WebGL is unavailable.
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
      })
      terminal.loadAddon(webglAddon)
    } catch {
      // WebGL not available — fall back to default canvas renderer
    }

    let disposed = false
    let ready = false

    // Load the user's font as a web font on initial terminal creation so PUA
    // glyphs render correctly from the start (the font-change effect only fires
    // when terminalFontFamily changes, not on first mount).
    const cleanedFont = terminalFontFamily?.replace(/^['"]|['"]$/g, '').trim()
    console.log('[useTerminal] main effect: cleanedFont =', cleanedFont)
    if (cleanedFont) {
      void loadWebFont(cleanedFont).then((loaded) => {
        console.log('[useTerminal] main effect: loadWebFont resolved, loaded =', loaded, 'disposed =', disposed)
        if (!disposed && loaded) {
          const resolved = resolveFontFamily(terminalFontFamily, true)
          console.log('[useTerminal] main effect: setting fontFamily to', resolved)
          terminal.options.fontFamily = resolved
          terminal.clearTextureAtlas()
          fitAddonRef.current?.fit()
        }
      })
    }

    // Register the IPC listener synchronously so cleanup always works.
    // Buffer is suppressed until the terminal has been sized and reset.
    const handleOutput = (...args: unknown[]): void => {
      const event = args[0] as AgentOutputEvent
      if (event.sessionId === sessionId && !disposed && ready) {
        terminal.write(event.data)
      }
    }

    const unsubscribe = sessionId
      ? window.electronAPI.on('agent:output', handleOutput)
      : null

    // Fit terminal to its container and send actual dimensions to the PTY.
    // Then wait for the CLI tool (e.g. Claude Code) to re-render at the
    // correct size before accepting output.
    requestAnimationFrame(() => {
      if (disposed) return
      fitAndResize(fitAddon, terminal, sessionId)
      setTimeout(() => {
        if (disposed) return
        terminal.reset()
        ready = true

        terminal.focus()

        if (!sessionId) return
        // Replay the session's buffered output to restore the terminal state.
        // Without this, switching sessions shows a blank terminal until the
        // PTY emits new output (e.g. user presses Enter).
        void window.electronAPI.invoke('agent:replay', sessionId).then((buffer) => {
          if (!disposed && buffer) {
            terminal.write(buffer as string)
          }
        })
      }, 300)
    })

    // Translate macOS Cmd+Backspace to Ctrl+U (kill line backward)
    // Translate Shift+Enter to newline (for multiline input in Claude Code)
    terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type === 'keydown' && event.metaKey && event.key === 'Backspace') {
        if (sessionId) {
          void window.electronAPI.invoke('agent:input', sessionId, '\x15')
        }
        return false
      }
      if (event.shiftKey && event.key === 'Enter') {
        if (event.type === 'keydown' && sessionId) {
          void window.electronAPI.invoke('agent:input', sessionId, '\x1b[13;2u')
        }
        return false // Block all event types (keydown + keypress) to prevent \r leaking
      }
      return true
    })

    // Forward user keystrokes to PTY
    const onDataDisposable = terminal.onData((data: string) => {
      if (sessionId) {
        void window.electronAPI.invoke('agent:input', sessionId, data)
      }
    })

    // Re-fit terminal when container resizes
    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return
      requestAnimationFrame(() => {
        if (disposed) return
        fitAndResize(fitAddon, terminal, sessionId)
      })
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      terminalRef.current = null
      fitAddonRef.current = null
      unsubscribe?.()
      onDataDisposable.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- terminalFontFamily handled by its own effect
  }, [sessionId, scrollbackLines])

  return { containerRef: containerRef as RefObject<HTMLDivElement | null> }
}

function fitAndResize(
  fitAddon: FitAddon | null,
  terminal: Terminal,
  sessionId: string | null
): void {
  try {
    fitAddon?.fit()
    if (sessionId) {
      void window.electronAPI.invoke('agent:resize', sessionId, terminal.cols, terminal.rows)
    }
  } catch {
    // Ignore fit errors during layout transitions
  }
}
