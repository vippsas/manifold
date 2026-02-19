import { useEffect, useRef, type RefObject } from 'react'
import { Terminal, type ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface AgentOutputEvent {
  sessionId: string
  data: string
}

interface UseTerminalOptions {
  sessionId: string | null
  scrollbackLines: number
}

interface UseTerminalResult {
  containerRef: RefObject<HTMLDivElement | null>
}

function buildTerminalOptions(scrollbackLines: number): ITerminalOptions {
  return {
    scrollback: scrollbackLines,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'block',
    cursorInactiveStyle: 'outline',
    theme: {
      background: '#1a1a2e',
      foreground: '#e0e0e0',
      cursor: '#ffcc00',
      cursorAccent: '#1a1a2e',
      selectionBackground: '#4fc3f744',
    },
  }
}

export function useTerminal({ sessionId, scrollbackLines }: UseTerminalOptions): UseTerminalResult {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal(buildTerminalOptions(scrollbackLines))
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    let disposed = false
    let outputCleanup: (() => void) | null = null

    // Fit terminal to its container and send actual dimensions to the PTY.
    // Then wait for the CLI tool (e.g. Claude Code) to re-render at the
    // correct size before subscribing to output. By deferring the IPC
    // listener registration, any output rendered at the wrong PTY size
    // is simply never received — there is no listener to deliver it to.
    requestAnimationFrame(() => {
      if (disposed) return
      fitAndResize(fitAddon, terminal, sessionId)
      setTimeout(() => {
        if (disposed) return
        terminal.reset()
        if (!sessionId) return
        const handleOutput = (...args: unknown[]): void => {
          const event = args[0] as AgentOutputEvent
          if (event.sessionId === sessionId && !disposed) {
            terminal.write(event.data)
          }
        }
        window.electronAPI.on('agent:output', handleOutput)
        outputCleanup = () => window.electronAPI.off('agent:output', handleOutput)
      }, 300)
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
      outputCleanup?.()
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
