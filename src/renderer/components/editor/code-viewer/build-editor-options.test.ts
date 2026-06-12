import { describe, it, expect } from 'vitest'
import { buildEditorOptions } from './build-editor-options'
import type { EditorSettings } from '../../../../shared/types'

const SETTINGS: EditorSettings = {
  fontSize: 15,
  fontFamily: 'Test Mono',
  wordWrap: 'on',
  markdownWordWrap: true,
  minimap: true,
  tabSize: 4,
}

describe('buildEditorOptions', () => {
  it('applies the configurable values', () => {
    const opts = buildEditorOptions(SETTINGS, { readOnly: false })
    expect(opts.fontSize).toBe(15)
    expect(opts.fontFamily).toBe('Test Mono')
    expect(opts.wordWrap).toBe('on')
    expect(opts.minimap).toEqual({ enabled: true })
    expect(opts.tabSize).toBe(4)
    expect(opts.readOnly).toBe(false)
  })

  it('forces word wrap on for markdown when markdownWordWrap is enabled', () => {
    const settings: EditorSettings = { ...SETTINGS, wordWrap: 'off', markdownWordWrap: true }
    const opts = buildEditorOptions(settings, { readOnly: false, isMarkdown: true })
    expect(opts.wordWrap).toBe('on')
  })

  it('falls back to the global wordWrap for markdown when markdownWordWrap is disabled', () => {
    const settings: EditorSettings = { ...SETTINGS, wordWrap: 'off', markdownWordWrap: false }
    const opts = buildEditorOptions(settings, { readOnly: false, isMarkdown: true })
    expect(opts.wordWrap).toBe('off')
  })

  it('does not let markdownWordWrap affect non-markdown files', () => {
    const settings: EditorSettings = { ...SETTINGS, wordWrap: 'off', markdownWordWrap: true }
    const opts = buildEditorOptions(settings, { readOnly: false })
    expect(opts.wordWrap).toBe('off')
  })

  it('bakes in the VS Code-like defaults', () => {
    const opts = buildEditorOptions(SETTINGS, { readOnly: true })
    expect(opts.readOnly).toBe(true)
    expect(opts.renderLineHighlight).toBe('line')
    expect(opts.folding).toBe(true)
    expect(opts.bracketPairColorization).toEqual({ enabled: true })
    expect(opts.stickyScroll).toEqual({ enabled: true })
    expect(opts.guides).toEqual({ indentation: true })
    expect(opts.scrollBeyondLastLine).toBe(false)
    expect(opts.lineNumbers).toBe('on')
  })
})
