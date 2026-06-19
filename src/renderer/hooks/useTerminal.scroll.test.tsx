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
  _viewportY: number
  _baseY: number
  scrollToLine: ReturnType<typeof vi.fn>
}

const shared = vi.hoisted(() => ({
  terminal: null as FakeTerminal | null,
  // Simulates xterm's reflow during fit(): mutates the buffer's scroll state.
  fitImpl: null as ((t: FakeTerminal) => void) | null,
  resizeCallback: null as ResizeObserverCallback | null,
}))

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    rows = 24
    cols = 80
    options: Record<string, unknown>
    unicode = { activeVersion: '' }
    _viewportY = 0
    _baseY = 0
    scrollToLine = vi.fn((line: number) => { this._viewportY = line })
    write = vi.fn()
    open = vi.fn()
    reset = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    clearTextureAtlas = vi.fn()
    attachCustomKeyEventHandler = vi.fn()
    loadAddon = vi.fn((addon: { activate?: (t: unknown) => void }) => { addon.activate?.(this) })

    constructor(options: Record<string, unknown>) {
      this.options = options
      shared.terminal = this as unknown as FakeTerminal
    }

    get buffer(): { active: { viewportY: number; baseY: number } } {
      const t = this
      return { active: { get viewportY() { return t._viewportY }, get baseY() { return t._baseY } } }
    }

    onData(): { dispose: () => void } { return { dispose: vi.fn() } }
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

describe('useTerminal scroll preservation on resize', () => {
  beforeEach(() => {
    shared.terminal = null
    shared.fitImpl = null
    shared.resizeCallback = null
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
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
})
