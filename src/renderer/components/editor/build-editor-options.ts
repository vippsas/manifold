import type { editor } from 'monaco-editor'
import type { EditorSettings } from '../../../shared/types'

/**
 * Turns user EditorSettings into Monaco editor options. The settings fields
 * are user-configurable; everything else is a baked-in "good default" (no toggle):
 * current-line highlight, folding, bracket-pair colorization, sticky scroll, and
 * indentation guides — the visual affordances that make Monaco feel like VS Code.
 */
export function buildEditorOptions(
  settings: EditorSettings,
  opts: { readOnly: boolean; isMarkdown?: boolean },
): editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly: opts.readOnly,
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    wordWrap: opts.isMarkdown && settings.markdownWordWrap ? 'on' : settings.wordWrap,
    minimap: { enabled: settings.minimap },
    tabSize: settings.tabSize,
    renderLineHighlight: 'line',
    folding: true,
    bracketPairColorization: { enabled: true },
    stickyScroll: { enabled: true },
    guides: { indentation: true },
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
  }
}
