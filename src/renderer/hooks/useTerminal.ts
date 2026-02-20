import { useEffect, useRef, type RefObject } from 'react'
import { Terminal, type ITerminalOptions, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface AgentOutputEvent {
  sessionId: string
  data: string
}

interface UseTerminalOptions {
  sessionId: string | null
  scrollbackLines: number
  xtermTheme?: ITheme
}

interface UseTerminalResult {
  containerRef: RefObject<HTMLDivElement | null>
}

function buildTerminalOptions(scrollbackLines: number, xtermTheme?: ITheme): ITerminalOptions {
  return {
    scrollback: scrollbackLines,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'block',
    cursorInactiveStyle: 'outline',
    theme: xtermTheme,
  }
}

export function useTerminal({ sessionId, scrollbackLines, xtermTheme }: UseTerminalOptions): UseTerminalResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)

  // Update theme on running terminals without recreating them
  useEffect(() => {
    if (terminalRef.current && xtermTheme) {
      terminalRef.current.options.theme = xtermTheme
    }
  }, [xtermTheme])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal(buildTerminalOptions(scrollbackLines, xtermTheme))
    terminalRef.current = terminal
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    let disposed = false
    let ready = false

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
      unsubscribe?.()
      onDataDisposable.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
    }
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
