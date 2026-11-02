import React from 'react'
import type { ITerminalOptions, Terminal } from '@xterm/xterm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const shared = vi.hoisted(() => ({
  terminal: null as Terminal | null,
  cols: 80,
  rows: 24,
  resizeCallback: null as ResizeObserverCallback | null,
  outputHandler: null as ((event: { sessionId: string; data: string }) => void) | null,
}))

// Use the real parser, buffers, scroll API and resize reflow. Only the DOM/GPU
// attachment and container measurement are replaced for this offline test.
vi.mock('@xterm/xterm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xterm/xterm')>()
  return {
    ...actual,
    Terminal: class extends actual.Terminal {
      constructor(options: ITerminalOptions) {
        super(options)
        shared.terminal = this
      }
      open = (): void => {
        // Public scrollToLine delegates to a DOM viewport, which sends the
        // scroll back to the core with ScrollSource.VIEWPORT (1). Replace only
        // that round trip; xterm still clamps and updates its real buffer.
        const core = (this as unknown as { _core: {
          viewport: unknown
          scrollLines: (amount: number, suppress: boolean, source: number) => void
        } })._core
        core.viewport = {
          scrollLines: (amount: number) => core.scrollLines(amount, false, 1),
          syncScrollArea: vi.fn(),
          reset: vi.fn(),
        }
      }
      focus = vi.fn()
      loadAddon = (addon: { activate?: (terminal: Terminal) => void }): void => { addon.activate?.(this) }
    },
  }
})

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    private terminal: Terminal | null = null
    activate(terminal: Terminal): void { this.terminal = terminal }
    fit(): void { this.terminal?.resize(shared.cols, shared.rows) }
  },
}))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: class { onContextLoss = vi.fn() } }))

import { useTerminal } from './useTerminal'

function Harness(): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId: 'agent-1', scrollbackLines: 5000 })
  return <div ref={containerRef as React.RefObject<HTMLDivElement>} />
}

async function output(data: string): Promise<void> {
  shared.outputHandler?.({ sessionId: 'agent-1', data })
  await vi.runOnlyPendingTimersAsync()
}

describe('useTerminal with real xterm resize replay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    shared.terminal = null
    shared.cols = 80
    shared.rows = 24
    shared.outputHandler = null
    shared.resizeCallback = null
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { shared.resizeCallback = callback }
      observe(): void {}
      disconnect(): void {}
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
    window.electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((_channel, callback) => { shared.outputHandler = callback; return () => {} }),
      send: vi.fn(),
      getPathForFile: vi.fn(),
    } as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([0, 90])('keeps offset %i through narrower and wider clear/purge/replays', async (offset) => {
    render(<Harness />)
    await vi.advanceTimersByTimeAsync(300)
    const terminal = shared.terminal
    if (!terminal) throw new Error('terminal was not created')
    const transcript = Array.from({ length: 200 }, (_, i) => `transcript line ${i}\r\n`)
    await output(transcript.join(''))
    terminal.scrollToLine(terminal.buffer.active.baseY - offset)

    for (const [cols, rows] of [[60, 30], [120, 18]]) {
      shared.cols = cols
      shared.rows = rows
      shared.resizeCallback?.([], {} as ResizeObserver)
      expect(terminal.cols).toBe(cols)
      expect(terminal.rows).toBe(rows)
      expect(terminal.buffer.active.baseY - terminal.buffer.active.viewportY).toBe(offset)

      // A real cursor-position query emits onData during parsing; it must not
      // be mistaken for a user keystroke that cancels the resize guard.
      await output('\x1b[6n\x1b[2J\x1b[3J\x1b[H')
      expect(terminal.buffer.active.baseY).toBe(0)
      for (let start = 0; start < transcript.length; start += 50) {
        await vi.advanceTimersByTimeAsync(250)
        const before = terminal.buffer.active.baseY
        shared.outputHandler?.({ sessionId: 'agent-1', data: transcript.slice(start, start + 50).join('') })
        expect(terminal.buffer.active.baseY).toBe(before) // write has not parsed yet
        await vi.runOnlyPendingTimersAsync()
        const { baseY, viewportY } = terminal.buffer.active
        expect(viewportY).toBe(Math.max(0, baseY - offset))
      }
    }
  })
})
