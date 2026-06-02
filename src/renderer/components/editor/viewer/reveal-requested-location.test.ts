import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { revealRequestedLocation } from './reveal-requested-location'
import type { FileOpenRequest } from '../file-open-request'

type Listener = () => void

function createFakeEditor(opts: { setPositionFiresCursor?: boolean } = {}) {
  const clear = vi.fn()
  const collection = { clear }
  const cursorCbs: Listener[] = []
  const contentCbs: Listener[] = []
  const cursorDispose = vi.fn()
  const contentDispose = vi.fn()

  const editor = {
    setPosition: vi.fn(() => {
      if (opts.setPositionFiresCursor) cursorCbs.forEach((cb) => cb())
    }),
    revealPositionInCenter: vi.fn(),
    focus: vi.fn(),
    createDecorationsCollection: vi.fn((_decorations: unknown) => collection),
    onDidChangeCursorPosition: vi.fn((cb: Listener) => {
      cursorCbs.push(cb)
      return { dispose: cursorDispose }
    }),
    onDidChangeModelContent: vi.fn((cb: Listener) => {
      contentCbs.push(cb)
      return { dispose: contentDispose }
    }),
  }

  return { editor, clear, cursorCbs, contentCbs, cursorDispose, contentDispose }
}

const searchRequest = (line = 18): FileOpenRequest => ({
  path: '/repo/a.ts',
  line,
  column: 3,
  source: 'search',
})

describe('revealRequestedLocation', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('highlights the matched line with a whole-line decoration', () => {
    const { editor } = createFakeEditor()

    revealRequestedLocation(editor as never, '/repo/a.ts', searchRequest(18))

    expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1)
    const decorations = editor.createDecorationsCollection.mock.calls[0][0] as Array<{
      range: { startLineNumber: number; endLineNumber: number }
      options: { isWholeLine?: boolean; className?: string }
    }>
    expect(decorations).toHaveLength(1)
    expect(decorations[0].range.startLineNumber).toBe(18)
    expect(decorations[0].range.endLineNumber).toBe(18)
    expect(decorations[0].options.isWholeLine).toBe(true)
    expect(decorations[0].options.className).toBe('search-reveal-line')
  })

  it('clears the highlight when the cursor moves', () => {
    const { editor, clear, cursorCbs, cursorDispose, contentDispose } = createFakeEditor()

    revealRequestedLocation(editor as never, '/repo/a.ts', searchRequest())
    expect(clear).not.toHaveBeenCalled()

    cursorCbs[0]()

    expect(clear).toHaveBeenCalledTimes(1)
    expect(cursorDispose).toHaveBeenCalledTimes(1)
    expect(contentDispose).toHaveBeenCalledTimes(1)
  })

  it('clears the highlight when the document is edited', () => {
    const { editor, clear, contentCbs } = createFakeEditor()

    revealRequestedLocation(editor as never, '/repo/a.ts', searchRequest())
    contentCbs[0]()

    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('keeps the highlight when setPosition fires a cursor change during reveal', () => {
    const { editor, clear } = createFakeEditor({ setPositionFiresCursor: true })

    revealRequestedLocation(editor as never, '/repo/a.ts', searchRequest())

    expect(editor.setPosition).toHaveBeenCalledTimes(1)
    expect(clear).not.toHaveBeenCalled()
  })

  it('does nothing when the request has no line', () => {
    const { editor } = createFakeEditor()

    revealRequestedLocation(editor as never, '/repo/a.ts', { path: '/repo/a.ts', source: 'search' })

    expect(editor.createDecorationsCollection).not.toHaveBeenCalled()
    expect(editor.setPosition).not.toHaveBeenCalled()
  })
})
