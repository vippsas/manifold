import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { INTERRUPT_TERMINAL_MODE_RESET } from '../terminal-input-filter'

interface MockTerminalInstance {
  write: ReturnType<typeof vi.fn>
  attachCustomKeyEventHandler: ReturnType<typeof vi.fn>
  onDataHandler: ((data: string) => void) | null
}

const terminalMockState = vi.hoisted(() => ({
  instances: [] as MockTerminalInstance[],
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    rows = 24
    cols = 80
    options: Record<string, unknown>
    unicode = { activeVersion: '' }
    write = vi.fn()
    loadAddon = vi.fn()
    open = vi.fn()
    reset = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    clearTextureAtlas = vi.fn()
    attachCustomKeyEventHandler = vi.fn()
    onDataHandler: ((data: string) => void) | null = null

    constructor(options: Record<string, unknown>) {
      this.options = options
      terminalMockState.instances.push(this)
    }

    onData(callback: (data: string) => void): { dispose: () => void } {
      this.onDataHandler = callback
      return { dispose: vi.fn() }
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
  },
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class {},
}))

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss = vi.fn()
    dispose = vi.fn()
  },
}))

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: class {},
}))

import { useTerminal } from './useTerminal'

function TerminalHarness(): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId: 'shell-1', scrollbackLines: 5000 })
  return <div ref={containerRef} />
}

function getCustomKeyHandler(): (event: KeyboardEvent) => boolean {
  const terminal = terminalMockState.instances[0]
  const handler = terminal.attachCustomKeyEventHandler.mock.calls[0]?.[0]
  if (!handler) throw new Error('custom key handler was not attached')
  return handler as (event: KeyboardEvent) => boolean
}

describe('useTerminal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    terminalMockState.instances.length = 0
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      getPathForFile: vi.fn(),
    }
    ;(window as unknown as Record<string, unknown>).ResizeObserver = class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('resets xterm cursor modes after Ctrl+C without sending reset bytes to the PTY', async () => {
    render(<TerminalHarness />)

    expect(terminalMockState.instances).toHaveLength(1)
    const terminal = terminalMockState.instances[0]

    act(() => {
      terminal.onDataHandler?.('\x03')
    })

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('agent:input', 'shell-1', '\x03')
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith(
      'agent:input',
      'shell-1',
      INTERRUPT_TERMINAL_MODE_RESET,
    )

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(terminal.write).toHaveBeenCalledWith(INTERRUPT_TERMINAL_MODE_RESET)
  })

  it('translates macOS shell editing shortcuts to shell control sequences', () => {
    render(<TerminalHarness />)
    const handleKey = getCustomKeyHandler()

    const shortcuts: Array<{ event: KeyboardEventInit; expected: string }> = [
      { event: { key: 'Backspace', metaKey: true }, expected: '\x15' },
      { event: { key: 'Delete', metaKey: true }, expected: '\x0b' },
      { event: { key: 'ArrowLeft', metaKey: true }, expected: '\x01' },
      { event: { key: 'ArrowRight', metaKey: true }, expected: '\x05' },
      { event: { key: 'Backspace', altKey: true }, expected: '\x1b\x7f' },
      { event: { key: 'Delete', altKey: true }, expected: '\x1bd' },
      { event: { key: 'ArrowLeft', altKey: true }, expected: '\x1bb' },
      { event: { key: 'ArrowRight', altKey: true }, expected: '\x1bf' },
    ]

    for (const shortcut of shortcuts) {
      vi.mocked(window.electronAPI.invoke).mockClear()

      expect(handleKey(new KeyboardEvent('keydown', shortcut.event))).toBe(false)
      expect(window.electronAPI.invoke).toHaveBeenCalledWith(
        'agent:input',
        'shell-1',
        shortcut.expected,
      )
    }
  })

  it('does not send shell editing shortcuts on keyup', () => {
    render(<TerminalHarness />)
    const handleKey = getCustomKeyHandler()

    expect(handleKey(new KeyboardEvent('keyup', { key: 'Backspace', metaKey: true }))).toBe(true)
    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('agent:input', 'shell-1', '\x15')
  })
})
