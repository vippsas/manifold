import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import {
  filterTerminalResponses,
  includesInterruptSignal,
  INTERRUPT_TERMINAL_MODE_RESET,
} from '../../terminal-input-filter'
import { stripTerminalQueries } from './terminal-replay'
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
  focusTerminal: () => void
}

// How long after a resize to keep re-pinning the scroll position. Covers the
// round trip (fit -> agent:resize -> PTY SIGWINCH -> agent repaint -> output)
// while staying short enough that it never lingers into normal scrolling.
const RESIZE_SCROLL_GUARD_MS = 400

function getShellEditShortcut(event: KeyboardEvent): string | null {
  if (event.type !== 'keydown') return null

  if (event.metaKey) {
    if (event.key === 'Backspace') return '\x15' // Cmd+Delete: kill to start of line
    if (event.key === 'Delete') return '\x0b' // Cmd+Forward Delete: kill to end of line
    if (event.key === 'ArrowLeft') return '\x01' // Cmd+Left: start of line
    if (event.key === 'ArrowRight') return '\x05' // Cmd+Right: end of line
  }

  if (event.altKey) {
    if (event.key === 'Backspace') return '\x1b\x7f' // Option+Delete: kill word backward
    if (event.key === 'Delete') return '\x1bd' // Option+Forward Delete: kill word forward
    if (event.key === 'ArrowLeft') return '\x1bb' // Option+Left: word backward
    if (event.key === 'ArrowRight') return '\x1bf' // Option+Right: word forward
  }

  return null
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
    if (!terminal) return
    const cleaned = cleanFontName(terminalFontFamily)
    if (!cleaned) {
      terminal.options.fontFamily = DEFAULT_FONT_STACK
      terminal.clearTextureAtlas()
      fitPreservingScroll(fitAddonRef.current, terminal)
      return
    }
    // First apply the system font immediately, then upgrade to web font
    terminal.options.fontFamily = resolveFontFamily(terminalFontFamily)
    void loadWebFont(cleaned).then((loaded) => {
      if (terminalRef.current === terminal) {
        terminal.options.fontFamily = resolveFontFamily(terminalFontFamily, loaded)
        terminal.clearTextureAtlas()
        fitPreservingScroll(fitAddonRef.current, terminal)
      }
    })
  }, [terminalFontFamily])

  // Update font size when the user changes the UI scale factor in settings.
  useEffect(() => {
    const handleScaleChange = (event: Event): void => {
      const terminal = terminalRef.current
      if (!terminal) return
      const scale = (event as CustomEvent<number>).detail
      terminal.options.fontSize = Math.round(13 * scale)
      fitPreservingScroll(fitAddonRef.current, terminal)
    }
    document.addEventListener('manifold:ui-scale-changed', handleScaleChange)
    return () => document.removeEventListener('manifold:ui-scale-changed', handleScaleChange)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const currentScale = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-scale') || '1'
    ) || 1

    const terminal = new Terminal({
      ...buildTerminalOptions(scrollbackLines, terminalFontFamily, xtermTheme, currentScale),
      // OSC 8 hyperlinks (e.g. links rendered by Claude Code) bypass the
      // WebLinksAddon and would otherwise hit xterm's built-in confirm dialog
      // ("WARNING: This link could potentially be dangerous"). xterm only
      // passes http/https URIs here, and Electron's window-open handler
      // routes them to the default browser.
      linkHandler: {
        activate: (_event, uri) => {
          window.open(uri)
        },
      },
    })
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
    // Per terminal instance: a fresh terminal always sends its first size.
    const lastSentSize: { current: { cols: number; rows: number } | null } = { current: null }
    let interruptResetTimer: ReturnType<typeof setTimeout> | null = null

    // After a resize we re-fit synchronously (fitPreservingScroll), but the
    // agent only repaints asynchronously once its PTY receives the SIGWINCH —
    // and a runtime that redraws aggressively on resize (Codex) emits output
    // that snaps the viewport back to the top, undoing the synchronous restore.
    // A runtime that stays quiet on resize (Claude) never trips this. Pin the
    // user's distance-from-bottom for a short window after each resize and
    // re-assert it as that repaint lands, so the reading position survives the
    // async redraw too (issue #792).
    let scrollAnchor: { offsetFromBottom: number; expiresAt: number } | null = null
    const reapplyScrollAnchor = (): void => {
      if (!scrollAnchor) return
      if (Date.now() >= scrollAnchor.expiresAt) {
        scrollAnchor = null
        return
      }
      const buffer = terminal.buffer.active
      const target = Math.max(0, buffer.baseY - scrollAnchor.offsetFromBottom)
      if (buffer.viewportY !== target) terminal.scrollToLine(target)
    }

    // Load the user's font as a web font on initial terminal creation so PUA
    // glyphs render correctly from the start (the font-change effect only fires
    // when terminalFontFamily changes, not on first mount).
    const cleanedFont = cleanFontName(terminalFontFamily)
    if (cleanedFont) {
      void loadWebFont(cleanedFont).then((loaded) => {
        if (!disposed && loaded) {
          terminal.options.fontFamily = resolveFontFamily(terminalFontFamily, true)
          terminal.clearTextureAtlas()
          fitPreservingScroll(fitAddonRef.current, terminal)
        }
      })
    }

    // Register the IPC listener synchronously so cleanup always works.
    // Buffer is suppressed until the terminal has been sized and reset.
    const handleOutput = (...args: unknown[]): void => {
      const event = args[0] as AgentOutputEvent
      if (event.sessionId === sessionId && !disposed && ready) {
        terminal.write(event.data)
        reapplyScrollAnchor()
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
      fitAndResize(fitAddon, terminal, sessionId, lastSentSize)
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
            terminal.write(stripTerminalQueries(buffer as string))
          }
          if (!disposed) {
            void window.electronAPI.invoke('shell:predict-suggestion', sessionId)
          }
        })
      }, 300)
    })

    // Translate common macOS shell editing shortcuts to readline-friendly input.
    // Translate Shift+Enter to newline (for multiline input in Claude Code)
    terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const editShortcut = getShellEditShortcut(event)
      if (editShortcut) {
        if (sessionId) {
          void window.electronAPI.invoke('agent:input', sessionId, editShortcut)
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
          // Real keystrokes mean the user has taken over — stop re-pinning the
          // post-resize scroll position so we don't fight their own scrolling.
          scrollAnchor = null
          if (includesInterruptSignal(filtered)) {
            if (interruptResetTimer) clearTimeout(interruptResetTimer)
            interruptResetTimer = setTimeout(() => {
              if (!disposed) terminal.write(INTERRUPT_TERMINAL_MODE_RESET)
            }, 50)
          }
          if (filtered === '\t') {
            // Tab key: try to accept AI suggestion first, fall through to normal tab if none
            void window.electronAPI.invoke('shell:accept-suggestion', sessionId).then((accepted) => {
              if (!accepted) {
                // No active suggestion — forward Tab to PTY for normal completion
                void window.electronAPI.invoke('agent:input', sessionId, '\t')
              }
            })
          } else {
            // Any other key: dismiss suggestion then forward the keystroke
            void window.electronAPI.invoke('shell:dismiss-suggestion', sessionId)
            void window.electronAPI.invoke('agent:input', sessionId, filtered)
          }
        }
      }
    })

    // Re-fit terminal when container resizes
    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return
      requestAnimationFrame(() => {
        if (disposed) return
        const offsetFromBottom = fitAndResize(fitAddon, terminal, sessionId, lastSentSize)
        scrollAnchor = offsetFromBottom > 0
          ? { offsetFromBottom, expiresAt: Date.now() + RESIZE_SCROLL_GUARD_MS }
          : null
      })
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      terminalRef.current = null
      fitAddonRef.current = null
      if (interruptResetTimer) clearTimeout(interruptResetTimer)
      unsubscribe?.()
      onDataDisposable.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- terminalFontFamily handled by its own effect
  }, [sessionId, scrollbackLines])

  const focusTerminal = useCallback((): void => {
    terminalRef.current?.focus()
  }, [])

  return {
    containerRef: containerRef as RefObject<HTMLDivElement | null>,
    focusTerminal,
  }
}

/**
 * Re-fit the terminal to its container while keeping the user's place in the
 * scrollback. xterm's reflow only anchors the bottom, so a user scrolled up
 * gets snapped (typically to the top, issue #774) whenever the terminal is
 * re-fitted — on a pane resize or a font change. Capture the viewport's offset
 * from the bottom before the fit and, when scrolled up, restore it afterward.
 * A bottom-pinned viewport (offset 0) and the alternate buffer (baseY 0) are
 * left untouched.
 */
function fitPreservingScroll(fitAddon: FitAddon | null, terminal: Terminal): number {
  const before = terminal.buffer.active
  const offsetFromBottom = before.baseY - before.viewportY

  fitAddon?.fit()

  if (offsetFromBottom > 0) {
    const target = terminal.buffer.active.baseY - offsetFromBottom
    terminal.scrollToLine(Math.max(0, target))
  }

  return offsetFromBottom
}

/**
 * Re-fit on a container resize and return the viewport's pre-fit distance from
 * the bottom so the caller can re-assert it against the agent's asynchronous
 * resize repaint (issue #792). Returns 0 (no scroll guard needed) for a
 * bottom-pinned viewport or when the fit throws mid-transition.
 */
function fitAndResize(
  fitAddon: FitAddon | null,
  terminal: Terminal,
  sessionId: string | null,
  lastSentSize: { current: { cols: number; rows: number } | null }
): number {
  try {
    const offsetFromBottom = fitPreservingScroll(fitAddon, terminal)
    // Only tell the PTY about a size it hasn't been told. Re-attaching a dock
    // pane (every tab switch) fires the ResizeObserver at the size the terminal
    // already had, and a redundant resize still raises SIGWINCH — which an
    // agent TUI answers with a full repaint, so switching tabs flashed and
    // replayed a screenful of output for nothing.
    if (sessionId
      && (lastSentSize.current?.cols !== terminal.cols || lastSentSize.current?.rows !== terminal.rows)) {
      lastSentSize.current = { cols: terminal.cols, rows: terminal.rows }
      void window.electronAPI.invoke('agent:resize', sessionId, terminal.cols, terminal.rows)
    }
    return offsetFromBottom
  } catch {
    // Ignore fit errors during layout transitions
    return 0
  }
}
