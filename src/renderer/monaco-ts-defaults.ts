import type * as Monaco from 'monaco-editor'

/**
 * Point Monaco's TypeScript/JavaScript language defaults at what the editor can actually know.
 *
 * The TS worker only ever sees the single open file — no tsconfig, no node_modules, no sibling
 * modules — so every semantic check it runs is answered from an empty project: unresolved
 * imports, "Cannot find name 'Deno'", implicit `any` on typed parameters. Those markers are
 * always wrong here, so semantic validation stays off and only real syntax errors squiggle.
 * Turning it back on means giving the worker a real file graph (a language server), not
 * flipping this flag.
 */
export function configureTypeScriptDefaults(monaco: typeof Monaco): void {
  for (const defaults of [
    monaco.languages.typescript.typescriptDefaults,
    monaco.languages.typescript.javascriptDefaults,
  ]) {
    defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
    // `.tsx`/`.jsx` map to the plain `typescript`/`javascript` language ids, whose default
    // compiler options leave `jsx` off — without this every JSX tag parses as a failed type
    // assertion and reports a *syntax* error the flag above doesn't suppress.
    defaults.setCompilerOptions({
      ...defaults.getCompilerOptions(),
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    })
  }
}
