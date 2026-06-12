import { describe, it, expect, vi } from 'vitest'
import { registerEditorNavCommands } from './editor-nav-commands'

function makeMonaco() {
  return {
    KeyMod: { CtrlCmd: 2048, Shift: 1024, WinCtrl: 256 },
    KeyCode: { KeyO: 45, KeyG: 37 },
  } as unknown as typeof import('monaco-editor')
}

describe('registerEditorNavCommands', () => {
  it('registers two commands (go-to-symbol and go-to-line)', () => {
    const addCommand = vi.fn()
    const editor = { addCommand, getAction: vi.fn() } as unknown as Parameters<typeof registerEditorNavCommands>[0]
    registerEditorNavCommands(editor, makeMonaco())
    expect(addCommand).toHaveBeenCalledTimes(2)
  })

  it('runs the quickOutline action for go-to-symbol', () => {
    const run = vi.fn()
    const getAction = vi.fn().mockReturnValue({ run })
    let symbolHandler: (() => void) | undefined
    const addCommand = vi.fn((_keys: number, handler: () => void) => {
      if (symbolHandler === undefined) symbolHandler = handler // first registration = symbol
    })
    const editor = { addCommand, getAction } as unknown as Parameters<typeof registerEditorNavCommands>[0]
    registerEditorNavCommands(editor, makeMonaco())
    symbolHandler?.()
    expect(getAction).toHaveBeenCalledWith('editor.action.quickOutline')
    expect(run).toHaveBeenCalled()
  })

  it('runs the gotoLine action for go-to-line', () => {
    const run = vi.fn()
    const getAction = vi.fn().mockReturnValue({ run })
    const handlers: Array<() => void> = []
    const addCommand = vi.fn((_keys: number, handler: () => void) => { handlers.push(handler) })
    const editor = { addCommand, getAction } as unknown as Parameters<typeof registerEditorNavCommands>[0]
    registerEditorNavCommands(editor, makeMonaco())
    handlers[1]?.() // second registration = go-to-line
    expect(getAction).toHaveBeenCalledWith('editor.action.gotoLine')
    expect(run).toHaveBeenCalled()
  })
})
