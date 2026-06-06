# Editor Maturity Pass — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)

## Problem

Manifold's Monaco-based editor "doesn't feel like VS Code." Analysis traced this to
two root causes:

1. **Monaco with the defaults turned off** — current-line highlight disabled
   (`renderLineHighlight: 'none'`), no folding, no bracket-pair colorization, no
   sticky scroll, no status bar, font hardcoded, word wrap forced on. The visceral
   layer.
2. **A single-file viewer, not a project-aware shell** — no go-to-line/symbol, no
   quick-open, no in-gutter change markers. The capability layer.

This pass closes the highest-leverage gaps without taking on full language
intelligence (LSP), which is explicitly out of scope.

## Scope

Three tiers, plus a shared settings foundation. Decisions locked during
brainstorming:

- **Status bar:** editor-local strip per pane (not a global bar).
- **Navigation:** Lean — Go-to-Line, Go-to-Symbol, Quick Open. No app command palette.
- **Editor settings:** a new "Editor" settings section exposing font size, font
  family, word wrap (default off), minimap (default off), tab size. Everything else
  gets good defaults baked in with no toggle.
- **Dirty indicator:** dropped. Autosave (~500ms debounce, flush on tab switch)
  means files are never meaningfully "dirty"; a persistent dot would only flicker.

### Out of scope

LSP / cross-file intelligence, app command palette (Cmd+Shift+P), find-and-replace
in global search, breadcrumbs, back/forward navigation, pinned/preview tabs.

## Architecture

All work lands in the renderer except one small main-process IPC (`files:list`) for
Quick Open. New behavior goes into small hooks/helpers rather than swelling
`CodeViewer.tsx` (currently 209 LOC; must stay under 300).

### Foundation — settings → Monaco options

- `src/shared/types.ts`: add an `EditorSettings` interface and an optional
  `editor?: EditorSettings` field on `ManifoldSettings`.
  ```ts
  interface EditorSettings {
    fontSize: number         // default 13
    fontFamily: string       // default "'SF Mono', 'Fira Code', Menlo, Consolas, monospace"
    wordWrap: 'on' | 'off'   // default 'off'
    minimap: boolean         // default false
    tabSize: number          // default 2
  }
  ```
- `src/shared/defaults.ts`: `DEFAULT_SETTINGS.editor` with the values above. The
  settings store already deep-merges nested blocks (`memory`, `search`) in
  `resolveDefaults`; add `editor` to that merge so older configs gain the new block.
- `src/renderer/components/editor/build-editor-options.ts` (new): pure function
  `buildEditorOptions(editor: EditorSettings, opts: { readOnly: boolean }) → monaco.editor.IStandaloneEditorConstructionOptions`.
  - Applies the 5 configurable values.
  - Bakes in, with no toggle: `renderLineHighlight: 'line'`, `folding: true`,
    `bracketPairColorization: { enabled: true }`, `stickyScroll: { enabled: true }`,
    `guides: { indentation: true }`, plus the existing `scrollBeyondLastLine: false`,
    `lineNumbers: 'on'`.
  - `EditorContent.tsx` and `CodeViewer.tsx` (diff options) drop their hardcoded
    option literals and call this.
- Plumbing: `editorSettings` flows through the dock state into `CodeViewer` as a
  prop, mirroring how `terminalFontFamily`/`scrollbackLines` already reach
  `ShellPanel` (`dock-panels.tsx`). The settings → dock-state wiring follows the
  existing app-effects pattern.
- `src/renderer/components/modals/settings/EditorSettingsSection.tsx` (new), wired
  into `SettingsModalBody.tsx` and the section nav. Reuses the existing settings
  get/set IPC — no new settings channel.

### Tier 1 — pane polish + status strip

The option flips above deliver the polish (line highlight, folding, brackets,
sticky scroll). The status strip is the only new UI:

- `src/renderer/components/editor/EditorStatusBar.tsx` (new, presentational):
  renders a thin strip at the bottom of the editor container showing
  `Ln L, Col C` · `(N selected)` when a selection is non-empty · language label ·
  `Spaces: N` or `Tab Size: N` · `LF`/`CRLF`. Hidden when no file is open.
- `src/renderer/components/editor/useEditorStatusBar.ts` (new): owns the cursor
  state. On editor mount, subscribes to `onDidChangeCursorPosition` /
  `onDidChangeCursorSelection`; reads indentation from `model.getOptions()`
  (`insertSpaces`, `indentSize`) and EOL from `model.getEOL()`. Returns the props
  the status bar renders. Disposes listeners on unmount.
- `CodeViewer.styles.ts`: status strip styles (height ~22px, muted foreground,
  top border per the "keep structural borders" guideline, monospace figures).

The status strip is per-pane, so split editors each show their own cursor — no
cross-pane focus tracking.

### Tier 2 — git gutter decorations

- `src/renderer/components/editor/useDiffGutter.ts` (new): given the mounted editor
  and `fileDiffText`, calls the existing `parseDiffToLineRanges()` and applies a
  Monaco `DecorationsCollection` with `linesDecorationsClassName` per range bucket
  (added / modified / deleted). Re-applies when `fileDiffText` or the file's
  `refreshVersion` changes; clears the collection when there is no diff. Only active
  in the editable view (the side-by-side diff view already visualizes changes).
- CSS (`theme.css`): `.editor-gutter--added` (green, `--color-success`),
  `--modified` (accent blue), `--deleted` (red) — a thin bar in the line-decorations
  margin. Deleted markers render as a wedge on the line below the deletion, matching
  Monaco's convention.

### Tier 3 — navigation (Lean)

- `src/renderer/components/editor/useEditorNavCommands.ts` (new): on editor mount,
  registers:
  - **Go-to-Symbol** `Cmd+Shift+O` → `editor.getAction('editor.action.quickOutline')?.run()`.
  - **Go-to-Line** `Ctrl+G` → `editor.getAction('editor.action.gotoLine')?.run()`.
    Ctrl+G is the VS Code-on-mac binding; it avoids clobbering Cmd+G (find-next).
- **Quick Open (Cmd+P):**
  - Main — `src/main/ipc/file-handlers.ts`: new `files:list` handler. Resolves the
    session worktree root (same resolution the other `files:*` handlers use), runs
    `rg --files` via the search module's ripgrep binary resolver, returns relative
    paths. Caps the result (10,000) and logs when truncated — no silent cap.
    Falls back to an empty list (not an error) if rg is unavailable.
  - Preload: add `files:list` to the channel allowlist.
  - Renderer — `src/renderer/components/editor/fuzzy-match.ts` (new): a small
    subsequence scorer (contiguity + word-boundary + path-basename bonus). No new
    dependency.
  - Renderer — `src/renderer/components/editor/QuickOpen.tsx` (new): modal overlay
    with a text input and a fuzzy-ranked, virtualizable-enough list (cap rendered
    rows). Keyboard nav: ↑/↓ move, Enter opens, Esc closes; closes on blur/backdrop.
  - Wiring: a global `Cmd+P` keydown handler in the app shell opens QuickOpen with
    the active session's file list; selecting a result opens the file through the
    existing dock-state `onSelectFile` path. `Cmd+P`'s default (print) is prevented.

## Data flow

```
SettingsStore (~/.manifold/config.json)
  └─ settings.editor ──IPC──▶ renderer settings state ──▶ dock state
                                                            └─ editorSettings ──▶ CodeViewer
                                                                                   └─ buildEditorOptions ──▶ Monaco

fileDiffText (useFileDiff, already wired) ──▶ useDiffGutter ──▶ Monaco DecorationsCollection

editor instance ──▶ useEditorStatusBar ──▶ EditorStatusBar
editor instance ──▶ useEditorNavCommands (Cmd+Shift+O, Ctrl+G)

Cmd+P (app shell) ──▶ QuickOpen ──IPC files:list──▶ rg --files
                        └─ fuzzy-match ──▶ onSelectFile (dock state)
```

## Error handling

- `files:list`: rg missing or worktree unresolved → empty list, logged; QuickOpen
  shows "No files." The UI never throws.
- `useDiffGutter`: malformed/empty `fileDiffText` → `parseDiffToLineRanges` already
  returns empty buckets; the collection is cleared. No throw.
- `buildEditorOptions`: total function over a fully-defaulted `EditorSettings`
  (defaults guaranteed by `resolveDefaults`), so no missing-field branches.

## Testing

Unit (vitest; follow the project testing skill incl. the `better-sqlite3` rebuild):

- `build-editor-options.test.ts` — configurable values applied, defaults baked in.
- `fuzzy-match.test.ts` — ranking: exact > prefix > subsequence; basename bonus.
- `useDiffGutter` / decoration mapping — ranges → expected class buckets (the
  underlying `parseDiffToLineRanges` is already covered).
- `EditorStatusBar.test.tsx` — renders Ln/Col, indent, EOL; hidden with no file.
- `QuickOpen.test.tsx` — filtering, keyboard nav, selection callback.
- `file-handlers` `files:list` — mocked rg: parses output, caps, empty on failure.

Manual run-through after each tier: line highlight + folding visible; status strip
tracks the cursor; gutter bars match the diff; Cmd+Shift+O / Ctrl+G / Cmd+P work;
editor settings round-trip through the modal.

## File inventory

New:
- `src/renderer/components/editor/build-editor-options.ts`
- `src/renderer/components/editor/EditorStatusBar.tsx`
- `src/renderer/components/editor/useEditorStatusBar.ts`
- `src/renderer/components/editor/useDiffGutter.ts`
- `src/renderer/components/editor/useEditorNavCommands.ts`
- `src/renderer/components/editor/QuickOpen.tsx`
- `src/renderer/components/editor/fuzzy-match.ts`
- `src/renderer/components/modals/settings/EditorSettingsSection.tsx`
- (+ co-located `*.test.ts(x)` files above)

Modified:
- `src/shared/types.ts`, `src/shared/defaults.ts`
- `src/main/store/settings-store.ts` (merge `editor` defaults)
- `src/main/ipc/file-handlers.ts` (+ `files:list`), preload allowlist
- `src/renderer/components/editor/EditorContent.tsx`, `CodeViewer.tsx`,
  `CodeViewer.styles.ts`
- `src/renderer/components/editor/dock-panels.tsx` + dock-state type (carry
  `editorSettings`)
- `src/renderer/components/modals/settings/SettingsModalBody.tsx`
- the settings → dock-state app-effects wiring
- `src/renderer/styles/theme.css` (gutter + status strip classes)
- app-shell key handler for Cmd+P
