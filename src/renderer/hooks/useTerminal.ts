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
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(sessionId)
  const readyRef = useRef(false)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useTerminalMount(containerRef, terminalRef, fitAddonRef, sessionIdRef, readyRef, scrollbackLines)
  useAgentOutputListener(terminalRef, sessionIdRef, readyRef)
  useSessionChangeEffect(terminalRef, fitAddonRef, sessionIdRef, readyRef, sessionId)

  return { containerRef: containerRef as RefObject<HTMLDivElement | null> }
}

function useTerminalMount(
  containerRef: RefObject<HTMLDivElement | null>,
  terminalRef: React.MutableRefObject<Terminal | null>,
  fitAddonRef: React.MutableRefObject<FitAddon | null>,
  sessionIdRef: React.MutableRefObject<string | null>,
  readyRef: React.MutableRefObject<boolean>,
  scrollbackLines: number
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal(buildTerminalOptions(scrollbackLines))
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    readyRef.current = false

    // Send resize to PTY, then wait for it to take effect before
    // allowing output through. The stale-check guards against
    // React StrictMode's double-mount leaving orphan timers.
    requestAnimationFrame(() => {
      if (terminalRef.current !== terminal) return
      fitAndResize(fitAddon, terminal, sessionIdRef.current)
      setTimeout(() => {
        if (terminalRef.current !== terminal) return
        terminal.reset()
        readyRef.current = true
      }, 200)
    })

    const onDataDisposable = terminal.onData((data: string) => {
      if (sessionIdRef.current) {
        void window.electronAPI.invoke('agent:input', sessionIdRef.current, data)
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      if (terminalRef.current !== terminal) return
      requestAnimationFrame(() => {
        if (terminalRef.current !== terminal) return
        fitAndResize(fitAddon, terminal, sessionIdRef.current)
      })
    })
    resizeObserver.observe(container)

    return () => {
      onDataDisposable.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      readyRef.current = false
    }
  }, [scrollbackLines, containerRef, terminalRef, fitAddonRef, sessionIdRef, readyRef])
}

function useAgentOutputListener(
  terminalRef: React.MutableRefObject<Terminal | null>,
  sessionIdRef: React.MutableRefObject<string | null>,
  readyRef: React.MutableRefObject<boolean>
): void {
  useEffect(() => {
    const handleOutput = (...args: unknown[]): void => {
      const event = args[0] as AgentOutputEvent
      if (event.sessionId === sessionIdRef.current && terminalRef.current && readyRef.current) {
        terminalRef.current.write(event.data)
      }
    }

    window.electronAPI.on('agent:output', handleOutput)
    return () => {
      window.electronAPI.off('agent:output', handleOutput)
    }
  }, [terminalRef, sessionIdRef, readyRef])
}

function useSessionChangeEffect(
  terminalRef: React.MutableRefObject<Terminal | null>,
  fitAddonRef: React.MutableRefObject<FitAddon | null>,
  sessionIdRef: React.MutableRefObject<string | null>,
  readyRef: React.MutableRefObject<boolean>,
  sessionId: string | null
): void {
  useEffect(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal) return

    terminal.clear()
    readyRef.current = false

    requestAnimationFrame(() => {
      if (terminalRef.current !== terminal) return
      fitAndResize(fitAddon, terminal, sessionId)
      setTimeout(() => {
        if (terminalRef.current !== terminal) return
        terminal.reset()
        readyRef.current = true
      }, 200)
    })
  }, [sessionId, terminalRef, fitAddonRef, sessionIdRef, readyRef])
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
