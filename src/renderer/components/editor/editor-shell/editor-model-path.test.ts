import { describe, it, expect } from 'vitest'
import { editorModelPath } from './editor-model-path'

describe('editorModelPath', () => {
  it('keeps the file extension last so the TS worker picks the JSX script kind', () => {
    expect(editorModelPath('pane-1', '/repo/src/App.tsx')).toMatch(/\.tsx$/)
  })

  it('gives two panes on the same file distinct model URIs', () => {
    const a = editorModelPath('pane-1', '/repo/src/App.tsx')
    const b = editorModelPath('pane-2', '/repo/src/App.tsx')
    expect(a).not.toBe(b)
  })

  it('escapes # and ? so the extension is not swallowed by a fragment or query', () => {
    expect(editorModelPath('pane-1', '/repo/we#ird?.ts')).toBe('inmemory://pane-1/repo/we%23ird%3F.ts')
  })

  it('inserts a separator for a relative path', () => {
    expect(editorModelPath('pane-1', 'src/App.tsx')).toBe('inmemory://pane-1/src/App.tsx')
  })
})
