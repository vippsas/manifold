import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { parseDiffToLineRanges } from './code-viewer-diff'

export interface GutterDecoration {
  startLine: number
  endLine: number
  className: string
}

/** Pure mapping from a unified-diff string to gutter decoration specs. */
export function buildGutterDecorations(diffText: string | null): GutterDecoration[] {
  if (!diffText) return []
  const { added, modified, deleted } = parseDiffToLineRanges(diffText)
  const out: GutterDecoration[] = []
  for (const r of added) {
    out.push({ startLine: r.startLine, endLine: r.endLine, className: 'editor-gutter--added' })
  }
  for (const r of modified) {
    out.push({ startLine: r.startLine, endLine: r.endLine, className: 'editor-gutter--modified' })
  }
  for (const line of deleted) {
    out.push({ startLine: line, endLine: line, className: 'editor-gutter--deleted' })
  }
  return out
}

interface UseDiffGutterParams {
  editorRef: RefObject<monacoEditor.IStandaloneCodeEditor | null>
  monacoRef: RefObject<typeof import('monaco-editor') | null>
  active: boolean
  mountTick: number
  diffText: string | null
}

/**
 * Applies green/blue/red line-decoration bars in the editor gutter from the
 * active file's unified diff. Only runs when the plain code editor is showing
 * (`active`) and after the editor has mounted (`mountTick` bump). Clears the
 * decoration collection on cleanup, so switching files/views leaves no residue.
 */
export function useDiffGutter({ editorRef, monacoRef, active, mountTick, diffText }: UseDiffGutterParams): void {
  useEffect(() => {
    if (!active) return
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return // editor disposed (e.g. mid file-switch) — wait for the next mountTick

    const specs = buildGutterDecorations(diffText)
    const collection = editor.createDecorationsCollection(
      specs.map((s) => ({
        range: new monaco.Range(s.startLine, 1, s.endLine, 1),
        options: { isWholeLine: true, linesDecorationsClassName: s.className },
      })),
    )
    return () => collection.clear()
    // mountTick re-runs this once the editor mounts (refs are stable, so they're
    // intentionally omitted from the deps).
  }, [active, mountTick, diffText])
}
