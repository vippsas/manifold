// Regression guard for issue #774: resizing the shell pane next to the agent
// pane snapped the agent terminal to the top. The agent terminal's
// ResizeObserver re-fits xterm on every container size change, and xterm's
// reflow only keeps the BOTTOM anchored — a user scrolled up into the
// scrollback got snapped. fitAndResize must capture the viewport's distance
// from the bottom before the fit and restore it afterward.
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

interface FakeTerminal {
  cols: number
  rows: number
  _viewportY: number
  _baseY: number
  scrollToLine: ReturnType<typeof vi.fn>
  parseWrite: (baseY: number, viewportY: number) => void
  keyHandler: ((event: KeyboardEvent) => boolean) | null
  onDataHandler: ((data: string) => void) | null
}

const shared = vi.hoisted(() => ({
  terminal: null as FakeTerminal | null,
  // Simulates xterm's reflow during fit(): mutates the buffer's scroll state.
  fitImpl: null as ((t: FakeTerminal) => void) | null,
  resizeCallback: null as ResizeObserverCallback | null,
  // The 'agent:output' IPC listener, captured so a test can simulate the
  // agent's asynchronous resize repaint arriving as terminal output.
  outputHandler: null as ((event: { sessionId: string; data: string }) => void) | null,
}))

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    rows = 24
    cols = 80
    options: Record<string, unknown>
    unicode = { activeVersion: '' }
    _viewportY = 0
    _baseY = 0
    private writes: Array<(() => void) | undefined> = []
    keyHandler: ((event: KeyboardEvent) => boolean) | null = null
    onDataHandler: ((data: string) => void) | null = null
    scrollToLine = vi.fn((line: number) => { this._viewportY = line })
    // xterm queues writes. Only parseWrite changes the buffer and then invokes
    // the completion callback, after the output handler has returned.
    write = vi.fn((_data: string, callback?: () => void) => { this.writes.push(callback) })
    parseWrite(baseY: number, viewportY: number): void {
      if (!this.writes.length) throw new Error('no queued write to parse')
      const callback = this.writes.shift()
      this._baseY = baseY
      this._viewportY = viewportY
      callback?.()
    }
    open = vi.fn()
    reset = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    clearTextureAtlas = vi.fn()
    attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      this.keyHandler = handler
    })
    loadAddon = vi.fn((addon: { activate?: (t: unknown) => void }) => { addon.activate?.(this) })

    constructor(options: Record<string, unknown>) {
      this.options = options
      shared.terminal = this as unknown as FakeTerminal
    }

    get buffer(): { active: { viewportY: number; baseY: number } } {
      const t = this
      return { active: { get viewportY() { return t._viewportY }, get baseY() { return t._baseY } } }
    }

    onData(handler: (data: string) => void): { dispose: () => void } {
      this.onDataHandler = handler
      return { dispose: vi.fn() }
    }
  }
  return { Terminal: MockTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    private _terminal: FakeTerminal | null = null
    activate(t: FakeTerminal): void { this._terminal = t }
    fit = vi.fn(() => { if (shared.fitImpl && this._terminal) shared.fitImpl(this._terminal) })
  }
  return { FitAddon: MockFitAddon }
})

vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: class { onContextLoss = vi.fn(); dispose = vi.fn() } }))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }))

import { useTerminal } from './useTerminal'

function Harness({ font }: { font?: string }): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId: 'agent-1', scrollbackLines: 5000, terminalFontFamily: font })
  return <div ref={containerRef as React.RefObject<HTMLDivElement>} />
}

function fireResize(): void {
  shared.resizeCallback?.([], {} as ResizeObserver)
}

function readyTerminal(): { term: FakeTerminal; view: ReturnType<typeof render> } {
  const view = render(<Harness />)
  vi.advanceTimersByTime(300)
  const term = shared.terminal
  if (!term) throw new Error('terminal was not created')
  return { term, view }
}

function resizeWithOffset(term: FakeTerminal, offset: number, cols = 60, rows = 30): void {
  term._baseY = 100
  term._viewportY = 100 - offset
  shared.fitImpl = (t) => {
    t.cols = cols
    t.rows = rows
    t._baseY = 120
    t._viewportY = 120 - offset
  }
  fireResize()
  term.scrollToLine.mockClear()
}

function output(data = '\x1b[2J\x1b[3J\x1b[Htranscript replay'): void {
  shared.outputHandler?.({ sessionId: 'agent-1', data })
}

describe('useTerminal scroll preservation on resize', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    shared.terminal = null
    shared.fitImpl = null
    shared.resizeCallback = null
    shared.outputHandler = null
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn((channel: string, cb: (event: { sessionId: string; data: string }) => void) => {
        if (channel === 'agent:output') shared.outputHandler = cb
        return () => {}
      }),
      getPathForFile: vi.fn(),
    }
    ;(globalThis as unknown as Record<string, unknown>).ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) { shared.resizeCallback = cb }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    ;(globalThis as unknown as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('restores the scrollback offset from the bottom after a reflow', () => {
    render(<Harness />)
    const term = shared.terminal
    if (!term) throw new Error('terminal was not created')

    // User has scrolled up: viewport top sits 90 lines above the bottom.
    term._baseY = 100
    term._viewportY = 10
    // The fit reflows the buffer and snaps the viewport to the top while the
    // line count grows (narrower cols wrap more lines) — the #774 symptom.
    shared.fitImpl = (t) => { t._baseY = 120; t._viewportY = 0 }
    term.scrollToLine.mockClear()

    fireResize()

    // 90 lines from the bottom must be preserved against the new base: 120-90.
    expect(term.scrollToLine).toHaveBeenCalledWith(30)
    expect(term._viewportY).toBe(30)
  })

  it('leaves a bottom-pinned terminal stuck to the bottom', () => {
    render(<Harness />)
    const term = shared.terminal
    if (!term) throw new Error('terminal was not created')

    // User is at the bottom (offset 0). xterm keeps the bottom anchored itself.
    term._baseY = 100
    term._viewportY = 100
    shared.fitImpl = (t) => { t._baseY = 120; t._viewportY = 120 }
    term.scrollToLine.mockClear()

    fireResize()

    expect(term.scrollToLine).not.toHaveBeenCalled()
  })

  it('restores the scrollback offset when a font change re-fits the terminal', () => {
    const { rerender } = render(<Harness font="Menlo" />)
    const term = shared.terminal
    if (!term) throw new Error('terminal was not created')

    term._baseY = 100
    term._viewportY = 10
    shared.fitImpl = (t) => { t._baseY = 120; t._viewportY = 0 }
    term.scrollToLine.mockClear()

    // Clearing the font (cleanFontName -> undefined) takes the synchronous
    // re-fit branch of the font-change effect.
    rerender(<Harness font="" />)

    expect(term.scrollToLine).toHaveBeenCalledWith(30)
  })

  it.each([
    { offset: 0, cols: 60, rows: 30 },
    { offset: 0, cols: 120, rows: 18 },
    { offset: 90, cols: 60, rows: 30 },
    { offset: 90, cols: 120, rows: 18 },
  ])('restores offset $offset after parsing a repaint at $cols x $rows', ({ offset, cols, rows }) => {
    const { term } = readyTerminal()
    resizeWithOffset(term, offset, cols, rows)

    output()
    // The old implementation re-pinned here, before xterm changed its buffer.
    expect(term.scrollToLine).not.toHaveBeenCalled()
    expect(term._viewportY).toBe(120 - offset)
    term.parseWrite(200, 0)

    expect(term._viewportY).toBe(200 - offset)
    expect(term.scrollToLine).toHaveBeenCalledWith(200 - offset)
  })

  it.each([0, 90])('keeps offset %i through a purge and a replay lasting longer than 400 ms', (offset) => {
    const { term } = readyTerminal()
    resizeWithOffset(term, offset)
    output('\x1b[2J\x1b[3J\x1b[H')
    term.parseWrite(0, 0)

    for (const baseY of [60, 120, 180, 240]) {
      vi.advanceTimersByTime(250)
      output('next transcript chunk\r\n')
      term.parseWrite(baseY, 0)
      expect(term._viewportY).toBe(Math.max(0, baseY - offset))
    }
  })

  it('waits for queued parsing before starting the quiet period', () => {
    const { term } = readyTerminal()
    resizeWithOffset(term, 90)
    output()
    output('more replay')
    vi.advanceTimersByTime(600)
    term.parseWrite(0, 0)
    vi.advanceTimersByTime(600)
    term.parseWrite(200, 0)
    expect(term._viewportY).toBe(110)

    vi.advanceTimersByTime(250)
    output('last chunk')
    term.parseWrite(220, 0)
    expect(term._viewportY).toBe(130)
  })

  it('preserves the original offset across another resize while scrollback is purged', () => {
    const { term } = readyTerminal()
    resizeWithOffset(term, 90)
    output()
    term.parseWrite(0, 0)

    shared.fitImpl = (t) => { t.cols = 100 }
    fireResize()
    output('replayed history')
    term.parseWrite(200, 0)
    expect(term._viewportY).toBe(110)
  })

  it('stops re-pinning after the repaint goes quiet', () => {
    const { term } = readyTerminal()
    resizeWithOffset(term, 90)
    output()
    term.parseWrite(200, 0)

    vi.advanceTimersByTime(401)
    term.scrollToLine.mockClear()
    output('ordinary later output')
    term.parseWrite(220, 20)
    expect(term._viewportY).toBe(20)
    expect(term.scrollToLine).not.toHaveBeenCalled()
  })

  it('bounds the guard even when output never goes quiet', () => {
    const { term } = readyTerminal()
    resizeWithOffset(term, 90)
    for (let elapsed = 250; elapsed < 5000; elapsed += 250) {
      vi.advanceTimersByTime(250)
      output('continuous output')
      term.parseWrite(200, 0)
      expect(term._viewportY).toBe(110)
    }
    output('queued beyond the maximum lifetime')
    vi.advanceTimersByTime(250)
    term.scrollToLine.mockClear()
    term.parseWrite(220, 20)
    expect(term._viewportY).toBe(20)
    expect(term.scrollToLine).not.toHaveBeenCalled()
  })

  it.each(['wheel', 'pointerdown', 'touchstart', 'paste', 'input', 'keydown'])(
    'lets user %s interaction cancel even an already queued repaint', (type) => {
      const { term, view } = readyTerminal()
      resizeWithOffset(term, 90)
      output()
      if (type === 'keydown') {
        term.keyHandler?.(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
      } else {
        view.container.firstElementChild?.dispatchEvent(new Event(type))
      }
      term.parseWrite(200, 20)
      expect(term._viewportY).toBe(20)
      expect(term.scrollToLine).not.toHaveBeenCalled()
    }
  )

  it('keeps the guard when parsing a cursor-position query sends a terminal reply', () => {
    const { term } = readyTerminal()
    resizeWithOffset(term, 90)
    output('\x1b[6n')
    term.onDataHandler?.('\x1b[24;1R')
    term.parseWrite(200, 0)
    expect(term._viewportY).toBe(110)
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('agent:input', 'agent-1', '\x1b[24;1R')
  })

  it('does not create a guard for an unchanged size or a failed fit', () => {
    const { term } = readyTerminal()
    term._baseY = 100
    term._viewportY = 10
    fireResize()
    output()
    term.parseWrite(100, 20)
    expect(term._viewportY).toBe(20)

    shared.fitImpl = () => { throw new Error('layout transition') }
    fireResize()
    output()
    term.parseWrite(100, 30)
    expect(term._viewportY).toBe(30)
  })

  it('ignores queued write callbacks after the terminal is disposed', () => {
    const { term, view } = readyTerminal()
    resizeWithOffset(term, 90)
    output()
    view.unmount()
    term.parseWrite(200, 0)
    expect(term.scrollToLine).not.toHaveBeenCalled()
  })
})
