import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { INTERRUPT_TERMINAL_MODE_RESET } from '../terminal-input-filter'
import { loadWebFont } from './terminal-font'

interface MockTerminalInstance {
  write: ReturnType<typeof vi.fn>
  attachCustomKeyEventHandler: ReturnType<typeof vi.fn>
  onDataHandler: ((data: string) => void) | null
  options: Record<string, unknown>
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
    scrollToLine = vi.fn()
    buffer = { active: { viewportY: 0, baseY: 0 } }
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
  return <div ref={containerRef as React.RefObject<HTMLDivElement>} />
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

  it('opens OSC 8 hyperlinks via window.open instead of xterm’s confirm dialog', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<TerminalHarness />)

    const terminal = terminalMockState.instances[0]
    const linkHandler = terminal.options.linkHandler as
      | { activate: (event: MouseEvent, uri: string) => void }
      | undefined
    expect(linkHandler).toBeDefined()

    linkHandler?.activate(new MouseEvent('click'), 'https://github.com/example/repo/issues/687')
    expect(openSpy).toHaveBeenCalledWith('https://github.com/example/repo/issues/687')
  })
})

describe('loadWebFont', () => {
  beforeEach(() => {
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      getPathForFile: vi.fn(),
    }
    ;(global as unknown as Record<string, unknown>).FontFace = class {
      load = vi.fn().mockResolvedValue(undefined)
    }
    ;(global as unknown as Record<string, unknown>).document = {
      fonts: { add: vi.fn() },
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads different fonts independently (per-font cache keying)', async () => {
    const invoke = window.electronAPI.invoke as ReturnType<typeof vi.fn>
    invoke.mockImplementation((_channel: string, font: string) =>
      Promise.resolve(`data:font/ttf;base64,${font}-bytes`),
    )

    const r1 = await loadWebFont('FontA-unique-test-1')
    const r2 = await loadWebFont('FontB-unique-test-2')

    expect(r1).toBe(true)
    expect(r2).toBe(true)
    // Both fonts requested their own data — two separate IPC calls
    expect(invoke).toHaveBeenCalledWith('font:load-data', 'FontA-unique-test-1')
    expect(invoke).toHaveBeenCalledWith('font:load-data', 'FontB-unique-test-2')
  })

  it('returns cached result for the same font without re-fetching', async () => {
    const invoke = window.electronAPI.invoke as ReturnType<typeof vi.fn>
    invoke.mockResolvedValue('data:font/ttf;base64,abc')

    await loadWebFont('FontC-unique-test-3')
    invoke.mockClear()
    const result = await loadWebFont('FontC-unique-test-3')

    expect(result).toBe(true)
    // No second IPC call — served from cache
    expect(invoke).not.toHaveBeenCalled()
  })

  it('resets the in-flight entry on failure so the next call retries', async () => {
    const invoke = window.electronAPI.invoke as ReturnType<typeof vi.fn>
    // First call fails
    invoke.mockRejectedValueOnce(new Error('network error'))
    const r1 = await loadWebFont('FontD-unique-test-4')
    expect(r1).toBe(false)

    // Second call should retry (invoke called again)
    invoke.mockResolvedValueOnce('data:font/ttf;base64,abc')
    const r2 = await loadWebFont('FontD-unique-test-4')
    expect(r2).toBe(true)
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
