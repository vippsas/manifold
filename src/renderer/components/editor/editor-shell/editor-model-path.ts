/**
 * The Monaco model URI for a file open in a pane.
 *
 * Monaco's TypeScript worker reads the *script kind* off the model URI's extension, not off the
 * language id — `.tsx`/`.jsx` both map to the plain `typescript`/`javascript` ids, so a model at
 * the default `inmemory://model/1` URI is parsed as non-JSX TypeScript and every JSX tag reports
 * a syntax error. Naming the model after the file fixes that.
 *
 * The pane id keeps the URI unique per pane: `@monaco-editor/react` looks models up by URI and
 * disposes the model when its editor unmounts, so two split panes on the same file must not
 * share one.
 */
export function editorModelPath(paneId: string | undefined, filePath: string): string {
  // `#`/`?` in a filename would otherwise cut the URI short at a fragment or query, dropping the
  // extension the worker needs.
  const escaped = filePath.replace(/[#?]/g, (c) => encodeURIComponent(c))
  const prefix = escaped.startsWith('/') ? '' : '/'
  return `inmemory://${paneId ?? 'editor'}${prefix}${escaped}`
}
