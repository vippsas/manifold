import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { filterTerminalResponses } from '../terminal-input-filter'
import {
  loadWebFont,
  resolveFontFamily,
  buildTerminalOptions,
  cleanFontName,
  DEFAULT_FONT_STACK,
} from './terminal-font'

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
    const cleaned = cleanFontName(terminalFontFamily)
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
    const cleanedFont = cleanFontName(terminalFontFamily)
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

    // Forward user keystrokes to PTY, filtering out terminal response sequences
    // (OSC color queries, cursor position reports, focus events) that xterm.js
    // auto-generates during replay/reset/focus and would appear as garbled input.
    const onDataDisposable = terminal.onData((data: string) => {
      if (sessionId) {
        const filtered = filterTerminalResponses(data)
        if (filtered) {
          void window.electronAPI.invoke('agent:input', sessionId, filtered)
        }
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
