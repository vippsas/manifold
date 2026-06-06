# Editor Maturity Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Manifold's Monaco editor feel like VS Code by enabling the visual defaults, adding a per-pane status strip, git gutter markers, and keyboard navigation (Go-to-Line, Go-to-Symbol, Quick Open).

**Architecture:** A pure `buildEditorOptions()` turns user `EditorSettings` into Monaco options (with good defaults baked in). New behavior lives in small hooks/helpers (`useEditorStatusBar`, `useDiffGutter`, `useEditorNavCommands`, `fuzzy-match`, `listWorktreeFiles`) so `CodeViewer.tsx` stays under 300 LOC. One new main-process IPC (`files:list`) backs Quick Open; everything else is renderer-only. Editor settings reach the pane through the existing dock-state → `CodeViewer` prop path (mirrors `terminalFontFamily`).

**Tech Stack:** Electron, React, TypeScript, `@monaco-editor/react` + `monaco-editor` 0.52, dockview, vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-06-06-editor-maturity-pass-design.md`

**Conventions:**
- Tests: `npx vitest run <path>` for one file. The project testing skill covers the full-suite command and the `better-sqlite3` ABI rebuild.
- Typecheck: `npm run typecheck:web` and `npm run typecheck:node`. These have a **non-zero baseline** (web≈53, node≈21 pre-existing errors). After each task, confirm you have not *added* new errors — compare the count/messages to before your change, do not expect zero.
- Commit messages follow repo norms (and append the repo's `Co-Authored-By` trailer).
- Path depth: files in `src/renderer/components/editor/` reach shared types via `../../../shared/...`; files in `src/renderer/components/modals/settings/` via `../../../../shared/...`.

---

## File Structure

**New files:**
- `src/renderer/components/editor/build-editor-options.ts` — pure `EditorSettings` → Monaco options.
- `src/renderer/components/editor/build-editor-options.test.ts`
- `src/renderer/components/editor/EditorStatusBar.tsx` — presentational status strip + `EditorStatusInfo` type.
- `src/renderer/components/editor/EditorStatusBar.test.tsx`
- `src/renderer/components/editor/useEditorStatusBar.ts` — cursor/indent/EOL tracking.
- `src/renderer/components/editor/useDiffGutter.ts` — diff → Monaco gutter decorations (+ pure `buildGutterDecorations`).
- `src/renderer/components/editor/useDiffGutter.test.ts`
- `src/renderer/components/editor/useEditorNavCommands.ts` — Go-to-Line / Go-to-Symbol bindings.
- `src/renderer/components/editor/useEditorNavCommands.test.ts`
- `src/renderer/components/editor/fuzzy-match.ts` — subsequence scorer.
- `src/renderer/components/editor/fuzzy-match.test.ts`
- `src/renderer/components/editor/QuickOpen.tsx` — Cmd+P overlay.
- `src/renderer/components/editor/QuickOpen.test.tsx`
- `src/renderer/components/modals/settings/EditorSettingsSection.tsx`
- `src/renderer/components/modals/settings/EditorSettingsSection.test.tsx`
- `src/main/fs/list-files.ts` — `listWorktreeFiles()` via `git ls-files`.
- `src/main/fs/list-files.test.ts`

**Modified files:**
- `src/shared/types.ts`, `src/shared/defaults.ts`, `src/main/store/settings-store.ts`
- `src/renderer/components/editor/EditorContent.tsx`, `CodeViewer.tsx`, `CodeViewer.styles.ts`
- `src/renderer/components/editor/dock-panels.tsx`, `dock-panel-types.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/modals/SettingsModal.tsx`, `settings/SettingsModalBody.tsx`
- `src/main/ipc/file-handlers.ts`, `src/preload/index.ts`
- `src/renderer/styles/theme.css`

---

## Task 1: `EditorSettings` type, defaults, and settings-store merge

**Files:**
- Modify: `src/shared/types.ts` (add interface + field on `ManifoldSettings`)
- Modify: `src/shared/defaults.ts` (add `editor` block)
- Modify: `src/main/store/settings-store.ts:26-35` (merge `editor` in `resolveDefaults`)
- Test: `src/main/store/settings-store.test.ts` (add a deep-merge test)

- [ ] **Step 1: Add the failing test**

In `src/main/store/settings-store.test.ts`, inside the `describe('defaults', ...)` block (after the search-AI merge test, ~line 168), add:

```ts
    it('fills in default editor settings when absent', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new SettingsStore()
      expect(store.getSettings().editor).toEqual(DEFAULT_SETTINGS.editor)
    })

    it('deep-merges partial editor settings with defaults', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify({ editor: { fontSize: 16 } }))

      const store = new SettingsStore()
      const editor = store.getSettings().editor
      expect(editor?.fontSize).toBe(16)
      expect(editor?.fontFamily).toBe(DEFAULT_SETTINGS.editor?.fontFamily)
      expect(editor?.wordWrap).toBe('off')
      expect(editor?.minimap).toBe(false)
      expect(editor?.tabSize).toBe(2)
    })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/store/settings-store.test.ts`
Expected: FAIL — `DEFAULT_SETTINGS.editor` is `undefined` / `editor` is `undefined`.

- [ ] **Step 3: Add the type**

In `src/shared/types.ts`, immediately above `export interface ManifoldSettings {` (line 94), add:

```ts
export interface EditorSettings {
  fontSize: number
  fontFamily: string
  wordWrap: 'on' | 'off'
  minimap: boolean
  tabSize: number
}
```

Then inside `ManifoldSettings`, add this line next to the other optional blocks (e.g. after `search?: SearchSettings`):

```ts
  editor?: EditorSettings
```

- [ ] **Step 4: Add the defaults**

In `src/shared/defaults.ts`, add to the `DEFAULT_SETTINGS` object (e.g. after the `search` block):

```ts
  editor: {
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
    wordWrap: 'off',
    minimap: false,
    tabSize: 2,
  },
```

- [ ] **Step 5: Merge in `resolveDefaults`**

In `src/main/store/settings-store.ts`, inside `resolveDefaults` after the `settings.search = {...}` block (line 35), add:

```ts
    settings.editor = {
      ...DEFAULT_SETTINGS.editor,
      ...settings.editor,
    } as ManifoldSettings['editor']
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/main/store/settings-store.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck:node`
Expected: no *new* errors vs baseline.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/store/settings-store.ts src/main/store/settings-store.test.ts
git commit -m "feat(editor): add EditorSettings type, defaults, and settings-store merge"
```

---

## Task 2: `buildEditorOptions` pure helper

**Files:**
- Create: `src/renderer/components/editor/build-editor-options.ts`
- Test: `src/renderer/components/editor/build-editor-options.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/editor/build-editor-options.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildEditorOptions } from './build-editor-options'
import type { EditorSettings } from '../../../shared/types'

const SETTINGS: EditorSettings = {
  fontSize: 15,
  fontFamily: 'Test Mono',
  wordWrap: 'on',
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/build-editor-options.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/components/editor/build-editor-options.ts`:

```ts
import type { editor } from 'monaco-editor'
import type { EditorSettings } from '../../../shared/types'

/**
 * Turns user EditorSettings into Monaco editor options. The five settings fields
 * are user-configurable; everything else is a baked-in "good default" (no toggle):
 * current-line highlight, folding, bracket-pair colorization, sticky scroll, and
 * indentation guides — the visual affordances that make Monaco feel like VS Code.
 */
export function buildEditorOptions(
  settings: EditorSettings,
  opts: { readOnly: boolean },
): editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly: opts.readOnly,
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    wordWrap: settings.wordWrap,
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/build-editor-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/build-editor-options.ts src/renderer/components/editor/build-editor-options.test.ts
git commit -m "feat(editor): add buildEditorOptions helper"
```

---

## Task 3: Wire `buildEditorOptions` into the editor + plumb `editorSettings`

This makes line-highlight/folding/brackets/sticky-scroll live and word-wrap configurable. The editor becomes settings-driven end to end.

**Files:**
- Modify: `src/renderer/components/editor/EditorContent.tsx` (take `options` prop)
- Modify: `src/renderer/components/editor/CodeViewer.tsx` (build options, accept `editorSettings`)
- Modify: `src/renderer/components/editor/dock-panel-types.ts:17` (add `editorSettings`)
- Modify: `src/renderer/components/editor/dock-panels.tsx:48-64` (pass prop)
- Modify: `src/renderer/App.tsx` (provide `editorSettings` in dockState)

- [ ] **Step 1: Make `EditorContent` take an `options` prop**

In `src/renderer/components/editor/EditorContent.tsx`, delete the `BASE_EDITOR_OPTIONS` and `EDITABLE_OPTIONS` consts (lines 5-15) and replace the component so options are passed in:

```tsx
import React from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import { viewerStyles } from './CodeViewer.styles'

interface EditorContentProps {
  filePath: string | null
  fileContent: string | null
  refreshVersion: number
  language: string
  monacoTheme: string
  options: monacoEditor.IStandaloneEditorConstructionOptions
  onMount?: OnMount
  onChange?: (value: string | undefined) => void
}

export function EditorContent({
  filePath,
  fileContent,
  refreshVersion,
  language,
  monacoTheme,
  options,
  onMount,
  onChange,
}: EditorContentProps): React.JSX.Element {
  if (fileContent !== null) {
    return (
      <Editor
        key={`${filePath ?? '__no-file__'}:${refreshVersion}`}
        defaultValue={fileContent}
        language={language}
        theme={monacoTheme}
        options={options}
        onMount={onMount}
        onChange={onChange}
      />
    )
  }

  return (
    <div style={viewerStyles.empty}>
      Select a file to view its contents
    </div>
  )
}
```

- [ ] **Step 2: Build options in `CodeViewer` and accept `editorSettings`**

In `src/renderer/components/editor/CodeViewer.tsx`:

(a) Add imports near the top (after the existing imports):

```tsx
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import type { EditorSettings } from '../../../shared/types'
import { buildEditorOptions } from './build-editor-options'
```

(b) Delete the `DIFF_EDITOR_OPTIONS` const (lines 43-55).

(c) Add `editorSettings` to `CodeViewerProps`:

```tsx
  editorSettings?: EditorSettings
```

(d) Add it to the destructured props with a default (next to `theme`):

```tsx
  editorSettings = DEFAULT_SETTINGS.editor as EditorSettings,
```

(e) Inside the component, after `const monacoTheme = theme`, add:

```tsx
  const editableOptions = useMemo(
    () => buildEditorOptions(editorSettings, { readOnly: false }),
    [editorSettings],
  )
  const diffOptions = useMemo(
    () => ({
      ...buildEditorOptions(editorSettings, { readOnly: true }),
      renderSideBySide: false,
      renderIndicators: true,
      renderMarginRevertIcon: false,
    }),
    [editorSettings],
  )
```

(f) In the `<DiffEditor ... options={DIFF_EDITOR_OPTIONS}` JSX, change to `options={diffOptions}`.

(g) In the `<EditorContent ... />` JSX, add `options={editableOptions}`.

- [ ] **Step 3: Add `editorSettings` to dock state type**

In `src/renderer/components/editor/dock-panel-types.ts`, add the import to the existing shared-types import on line 3 (append `EditorSettings`):

```ts
import type { AgentStatus, FileTreeNode, FileChange, Project, AgentSession, SpawnAgentOptions, FavoriteKind, ResolvedFavorite, EditorSettings } from '../../../shared/types'
```

Then add to `DockAppState` near the other terminal/editor fields (after line 19, `xtermTheme?: ITheme`):

```ts
  editorSettings?: EditorSettings
```

- [ ] **Step 4: Pass it through `dock-panels.tsx`**

In `src/renderer/components/editor/dock-panels.tsx`, in `EditorPanel`'s `<CodeViewer ... />` (after `theme={s.theme}`, line 57), add:

```tsx
      editorSettings={s.editorSettings}
```

- [ ] **Step 5: Provide it in `App.tsx`**

In `src/renderer/App.tsx`, in the `dockState` object, on the line that sets `scrollbackLines`/`terminalFontFamily` (line 213), append `editorSettings`:

```tsx
    scrollbackLines: settings.scrollbackLines, terminalFontFamily: settings.terminalFontFamily, xtermTheme, diffText: diff,
    editorSettings: settings.editor,
```

(`settings.editor` is always populated — the settings store fills it via `resolveDefaults`. `CodeViewer` also defaults it, so tests that omit it still pass.)

- [ ] **Step 6: Run editor tests + typecheck**

Run: `npx vitest run src/renderer/components/editor/`
Expected: PASS (existing `CodeViewer.test.tsx` etc. still green — the monaco mock ignores `options`).

Run: `npm run typecheck:web`
Expected: no *new* errors vs baseline.

- [ ] **Step 7: Manual check**

Build/run the app (per the project run skill). Open a code file: the current line is now highlighted, folding controls appear in the gutter, brackets are colorized, long lines no longer wrap. Verify nothing regressed in diff/markdown/image views.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/editor/EditorContent.tsx src/renderer/components/editor/CodeViewer.tsx src/renderer/components/editor/dock-panel-types.ts src/renderer/components/editor/dock-panels.tsx src/renderer/App.tsx
git commit -m "feat(editor): drive Monaco options from settings, enable VS Code defaults"
```

---

## Task 4: Editor settings section in the Settings modal

**Files:**
- Create: `src/renderer/components/modals/settings/EditorSettingsSection.tsx`
- Test: `src/renderer/components/modals/settings/EditorSettingsSection.test.tsx`
- Modify: `src/renderer/components/modals/settings/SettingsModalBody.tsx`
- Modify: `src/renderer/components/modals/SettingsModal.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/modals/settings/EditorSettingsSection.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorSettingsSection } from './EditorSettingsSection'
import { DEFAULT_SETTINGS } from '../../../../shared/defaults'
import type { EditorSettings } from '../../../../shared/types'

const VALUE = DEFAULT_SETTINGS.editor as EditorSettings

describe('EditorSettingsSection', () => {
  it('renders the current font size', () => {
    render(<EditorSettingsSection value={VALUE} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/Font Size/i)).toHaveValue(13)
  })

  it('calls onChange when font size changes', () => {
    const onChange = vi.fn()
    render(<EditorSettingsSection value={VALUE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/Font Size/i), { target: { value: '18' } })
    expect(onChange).toHaveBeenCalledWith({ ...VALUE, fontSize: 18 })
  })

  it('calls onChange when word wrap toggles', () => {
    const onChange = vi.fn()
    render(<EditorSettingsSection value={VALUE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/Word Wrap/i), { target: { value: 'on' } })
    expect(onChange).toHaveBeenCalledWith({ ...VALUE, wordWrap: 'on' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/modals/settings/EditorSettingsSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/renderer/components/modals/settings/EditorSettingsSection.tsx`:

```tsx
import React from 'react'
import type { EditorSettings } from '../../../../shared/types'
import { modalStyles } from '../SettingsModal.styles'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface Props {
  value: EditorSettings
  onChange: (value: EditorSettings) => void
}

export function EditorSettingsSection({ value, onChange }: Props): React.JSX.Element {
  function set<K extends keyof EditorSettings>(key: K, next: EditorSettings[K]): void {
    onChange({ ...value, [key]: next })
  }

  return (
    <>
      <SectionHeader
        title="Editor"
        description="Font, indentation, wrapping, and minimap for the code editor."
      />
      <div style={modalStyles.cardGrid}>
        <SectionCard title="Text" description="Font and indentation used by the code editor.">
          <div style={modalStyles.fieldGrid}>
            <label style={modalStyles.label}>
              Font Size
              <input
                type="number" min={8} max={32} step={1} value={value.fontSize}
                onChange={(event) => {
                  const n = parseInt(event.target.value, 10)
                  if (!Number.isNaN(n) && n > 0) set('fontSize', n)
                }}
                style={modalStyles.input}
              />
            </label>
            <label style={modalStyles.label}>
              Tab Size
              <input
                type="number" min={1} max={8} step={1} value={value.tabSize}
                onChange={(event) => {
                  const n = parseInt(event.target.value, 10)
                  if (!Number.isNaN(n) && n > 0) set('tabSize', n)
                }}
                style={modalStyles.input}
              />
            </label>
            <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
              Font Family
              <input
                type="text" value={value.fontFamily}
                onChange={(event) => set('fontFamily', event.target.value)}
                style={modalStyles.input}
                placeholder="SF Mono, Fira Code, Menlo, monospace"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Display" description="Wrapping and the minimap.">
          <div style={modalStyles.fieldGrid}>
            <label style={modalStyles.label}>
              Word Wrap
              <select
                value={value.wordWrap}
                onChange={(event) => set('wordWrap', event.target.value as 'on' | 'off')}
                style={modalStyles.select}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input
                type="checkbox" checked={value.minimap}
                onChange={(event) => set('minimap', event.target.checked)}
                style={modalStyles.checkboxInput}
              />
              Show minimap
            </label>
          </div>
        </SectionCard>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/modals/settings/EditorSettingsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the tab to `SettingsModalBody`**

In `src/renderer/components/modals/settings/SettingsModalBody.tsx`:

(a) Add the import (after the `GeneralSettingsSection` import, line 7):

```tsx
import { EditorSettingsSection } from './EditorSettingsSection'
```

(b) Add the type import to the existing shared-types import (line 3):

```tsx
import type { SearchAiSettings, EditorSettings } from '../../../../shared/types'
```

(c) Extend `SettingsTabId` (line 13) and `SETTINGS_TABS` (after the `general` entry):

```tsx
export type SettingsTabId = 'general' | 'editor' | 'search-ai' | 'provisioning' | 'transcription' | 'plugins'
```
```tsx
  { id: 'general', label: 'General' },
  { id: 'editor', label: 'Editor' },
```

(d) Add to `Props` (after `searchAiSettings: SearchAiSettings`):

```tsx
  editorSettings: EditorSettings
  onEditorSettingsChange: (value: EditorSettings) => void
```

(e) Render the panel — after the `general` line (line 92):

```tsx
          {props.activeTab === 'editor' && (
            <EditorSettingsSection value={props.editorSettings} onChange={props.onEditorSettingsChange} />
          )}
```

- [ ] **Step 6: Wire state in `SettingsModal`**

In `src/renderer/components/modals/SettingsModal.tsx`:

(a) Add the type import (line 4 area):

```tsx
import type { ManifoldSettings, EditorSettings } from '../../../shared/types'
```
(Replace the existing `ManifoldSettings` import line.)

(b) Add state (after `searchAiSettings`, line 31):

```tsx
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(settings.editor ?? DEFAULT_SETTINGS.editor!)
```

(c) Reset in the visibility effect (after `setSearchAiSettings(...)`, line 61):

```tsx
    setEditorSettings(settings.editor ?? DEFAULT_SETTINGS.editor!)
```

(d) Include in `onSave` (in the object, after `search: { ai: searchAiSettings },`, line 90):

```tsx
      editor: editorSettings,
```
Also add `editorSettings` to the `handleSave` dependency array (line 95).

(e) Pass to `SettingsModalBody` (after `onSearchAiSettingsChange={setSearchAiSettings}`, line 146):

```tsx
          editorSettings={editorSettings}
          onEditorSettingsChange={setEditorSettings}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/renderer/components/modals/`
Expected: PASS.

Run: `npm run typecheck:web`
Expected: no *new* errors vs baseline.

- [ ] **Step 8: Manual check**

Run the app → open Settings → the "Editor" tab appears between General and Search AI. Change font size / word wrap / minimap, Save, reopen a file: the editor reflects the change.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/modals/settings/EditorSettingsSection.tsx src/renderer/components/modals/settings/EditorSettingsSection.test.tsx src/renderer/components/modals/settings/SettingsModalBody.tsx src/renderer/components/modals/SettingsModal.tsx
git commit -m "feat(editor): add Editor settings section to the Settings modal"
```

---

## Task 5: `EditorStatusBar` presentational component

**Files:**
- Create: `src/renderer/components/editor/EditorStatusBar.tsx`
- Test: `src/renderer/components/editor/EditorStatusBar.test.tsx`
- Modify: `src/renderer/components/editor/CodeViewer.styles.ts` (add strip styles)

- [ ] **Step 1: Add the strip styles**

In `src/renderer/components/editor/CodeViewer.styles.ts`, add to the `viewerStyles` object (before the closing `}` at line 237):

```ts
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    height: '22px',
    padding: '0 10px',
    flexShrink: 0,
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
  },
  statusItem: {
    whiteSpace: 'nowrap' as const,
  },
  statusSpacer: {
    flex: 1,
  },
```

- [ ] **Step 2: Write the failing test**

Create `src/renderer/components/editor/EditorStatusBar.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorStatusBar, type EditorStatusInfo } from './EditorStatusBar'

const INFO: EditorStatusInfo = {
  line: 12,
  column: 4,
  selectionLength: 0,
  language: 'typescript',
  indent: 'Spaces: 2',
  eol: 'LF',
}

describe('EditorStatusBar', () => {
  it('renders cursor position, indent, eol, and language', () => {
    render(<EditorStatusBar info={INFO} />)
    expect(screen.getByText('Ln 12, Col 4')).toBeInTheDocument()
    expect(screen.getByText('Spaces: 2')).toBeInTheDocument()
    expect(screen.getByText('LF')).toBeInTheDocument()
    expect(screen.getByText('typescript')).toBeInTheDocument()
  })

  it('shows selection length only when a selection exists', () => {
    const { rerender } = render(<EditorStatusBar info={INFO} />)
    expect(screen.queryByText(/selected/)).toBeNull()
    rerender(<EditorStatusBar info={{ ...INFO, selectionLength: 7 }} />)
    expect(screen.getByText('(7 selected)')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/EditorStatusBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the component**

Create `src/renderer/components/editor/EditorStatusBar.tsx`:

```tsx
import React from 'react'
import { viewerStyles } from './CodeViewer.styles'

export interface EditorStatusInfo {
  line: number
  column: number
  selectionLength: number
  language: string
  indent: string
  eol: 'LF' | 'CRLF'
}

export function EditorStatusBar({ info }: { info: EditorStatusInfo }): React.JSX.Element {
  return (
    <div style={viewerStyles.statusBar} data-testid="editor-status-bar">
      <span style={viewerStyles.statusItem}>Ln {info.line}, Col {info.column}</span>
      {info.selectionLength > 0 && (
        <span style={viewerStyles.statusItem}>({info.selectionLength} selected)</span>
      )}
      <span style={viewerStyles.statusSpacer} />
      <span style={viewerStyles.statusItem}>{info.indent}</span>
      <span style={viewerStyles.statusItem}>{info.eol}</span>
      <span style={viewerStyles.statusItem}>{info.language}</span>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/EditorStatusBar.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/editor/EditorStatusBar.tsx src/renderer/components/editor/EditorStatusBar.test.tsx src/renderer/components/editor/CodeViewer.styles.ts
git commit -m "feat(editor): add EditorStatusBar component"
```

---

## Task 6: `useEditorStatusBar` hook + wire into `CodeViewer`

**Files:**
- Create: `src/renderer/components/editor/useEditorStatusBar.ts`
- Modify: `src/renderer/components/editor/CodeViewer.tsx`

- [ ] **Step 1: Write the hook**

Create `src/renderer/components/editor/useEditorStatusBar.ts`:

```ts
import { useCallback, useState } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import type { EditorStatusInfo } from './EditorStatusBar'

type StatusState = Omit<EditorStatusInfo, 'language'>

const INITIAL: StatusState = {
  line: 1,
  column: 1,
  selectionLength: 0,
  indent: 'Spaces: 2',
  eol: 'LF',
}

/**
 * Tracks cursor position, selection size, indentation, and EOL for the active
 * editor. `bindEditor` is called from the editor's onMount; it reads the initial
 * state and subscribes to cursor/selection changes. Monaco disposes these
 * listeners when the editor instance is disposed (on file remount).
 */
export function useEditorStatusBar(language: string): {
  statusInfo: EditorStatusInfo
  bindEditor: (editor: monacoEditor.IStandaloneCodeEditor) => void
} {
  const [state, setState] = useState<StatusState>(INITIAL)

  const bindEditor = useCallback((editor: monacoEditor.IStandaloneCodeEditor): void => {
    const read = (): void => {
      const model = editor.getModel()
      const position = editor.getPosition()
      const selection = editor.getSelection()
      const options = model?.getOptions()
      const selectionLength = selection && model ? model.getValueInRange(selection).length : 0
      setState({
        line: position?.lineNumber ?? 1,
        column: position?.column ?? 1,
        selectionLength,
        indent: options?.insertSpaces
          ? `Spaces: ${options.indentSize}`
          : `Tab Size: ${options?.tabSize ?? 4}`,
        eol: model?.getEOL() === '\r\n' ? 'CRLF' : 'LF',
      })
    }
    read()
    editor.onDidChangeCursorPosition(read)
    editor.onDidChangeCursorSelection(read)
  }, [])

  return { statusInfo: { ...state, language }, bindEditor }
}
```

- [ ] **Step 2: Wire into `CodeViewer`**

In `src/renderer/components/editor/CodeViewer.tsx`:

(a) Add imports:

```tsx
import { useEditorStatusBar } from './useEditorStatusBar'
import { EditorStatusBar } from './EditorStatusBar'
```

(b) Inside the component (after the `useCodeViewerModes` call), add:

```tsx
  const { statusInfo, bindEditor } = useEditorStatusBar(language)
```

(c) In `handleEditorMount`, after `editorRef.current = editor`, add:

```tsx
    bindEditor(editor)
```
Add `bindEditor` to the `handleEditorMount` `useCallback` dependency array (currently `[]` → `[bindEditor]`).

(d) Add the derived "plain editor is showing" boolean after the `hasTabs` line:

```tsx
  const showPlainEditor =
    !(isImage && activeFilePath !== null && fileContent !== null) &&
    !(previewActive && isHtml && resolvedHtml !== null) &&
    !(previewActive && fileContent !== null && !isHtml && activeFilePath !== null) &&
    !(diffMode && fileContent !== null)
```

(e) Render the status bar — change the closing of the editor area. The current return ends:

```tsx
      </div>
    </div>
  )
```

Replace with:

```tsx
      </div>
      {showPlainEditor && fileContent !== null && activeFilePath !== null && (
        <EditorStatusBar info={statusInfo} />
      )}
    </div>
  )
```

(The first `</div>` closes `editorContainer`; the status bar is a sibling inside `wrapper`, so it sits at the bottom of the pane.)

- [ ] **Step 3: Run editor tests + typecheck**

Run: `npx vitest run src/renderer/components/editor/`
Expected: PASS. (In `CodeViewer.test.tsx` the monaco mock never calls `onMount`, so the strip shows the initial `Ln 1, Col 1` when a file is open — existing assertions query by test id / content and are unaffected.)

Run: `npm run typecheck:web`
Expected: no *new* errors vs baseline.

- [ ] **Step 4: Manual check**

Run the app, open a file, move the cursor and select text: the bottom strip updates `Ln/Col`, shows `(N selected)`, the language, indent, and `LF`/`CRLF`. Open a markdown preview / image: the strip hides.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/useEditorStatusBar.ts src/renderer/components/editor/CodeViewer.tsx
git commit -m "feat(editor): per-pane status strip with Ln/Col, indent, EOL, language"
```

---

## Task 7: Git gutter decorations

**Files:**
- Create: `src/renderer/components/editor/useDiffGutter.ts` (incl. pure `buildGutterDecorations`)
- Test: `src/renderer/components/editor/useDiffGutter.test.ts`
- Modify: `src/renderer/components/editor/CodeViewer.tsx`
- Modify: `src/renderer/styles/theme.css`

- [ ] **Step 1: Write the failing test (pure mapping)**

Create `src/renderer/components/editor/useDiffGutter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildGutterDecorations } from './useDiffGutter'

const DIFF = `diff --git a/x.ts b/x.ts
index 111..222 100644
--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,4 @@
 unchanged
+added line
-removed line
+changed line
 tail
`

describe('buildGutterDecorations', () => {
  it('returns no decorations for empty diff', () => {
    expect(buildGutterDecorations(null)).toEqual([])
    expect(buildGutterDecorations('')).toEqual([])
  })

  it('maps added/modified/deleted ranges to gutter classes', () => {
    const decos = buildGutterDecorations(DIFF)
    const classes = decos.map((d) => d.className)
    expect(classes).toContain('editor-gutter--added')
    expect(classes).toContain('editor-gutter--modified')
    // every decoration has a 1-based line range
    for (const d of decos) {
      expect(d.startLine).toBeGreaterThanOrEqual(1)
      expect(d.endLine).toBeGreaterThanOrEqual(d.startLine)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/useDiffGutter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook + pure helper**

Create `src/renderer/components/editor/useDiffGutter.ts`:

```ts
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
  for (const r of added) out.push({ startLine: r.startLine, endLine: r.endLine, className: 'editor-gutter--added' })
  for (const r of modified) out.push({ startLine: r.startLine, endLine: r.endLine, className: 'editor-gutter--modified' })
  for (const line of deleted) out.push({ startLine: line, endLine: line, className: 'editor-gutter--deleted' })
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

    const specs = buildGutterDecorations(diffText)
    const collection = editor.createDecorationsCollection(
      specs.map((s) => ({
        range: new monaco.Range(s.startLine, 1, s.endLine, 1),
        options: { isWholeLine: true, linesDecorationsClassName: s.className },
      })),
    )
    return () => collection.clear()
  }, [editorRef, monacoRef, active, mountTick, diffText])
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/useDiffGutter.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `CodeViewer`**

In `src/renderer/components/editor/CodeViewer.tsx`:

(a) Add the import:

```tsx
import { useDiffGutter } from './useDiffGutter'
```

(b) Add refs/state near `editorRef` (line 81). `monaco-editor`'s `editor` type is already imported at the top of the file; type the ref as the whole module:

```tsx
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const [mountTick, setMountTick] = useState(0)
```
(Ensure `useState` is in the React import at the top — add it if missing.)

(c) In `handleEditorMount`, after `editorRef.current = editor`, add:

```tsx
    monacoRef.current = monacoApi
    setMountTick((tick) => tick + 1)
```
Note: the mount signature is `(editor, monaco)`. Rename the second param to `monacoApi` to avoid shadowing the `monaco` type import: change the signature to `useCallback((editor, monacoApi) => {`. Update the existing `monaco.KeyMod...` reference inside (the save command) to `monacoApi.KeyMod | monacoApi.KeyCode.KeyS`.

(d) Call the hook (after `useEditorStatusBar`):

```tsx
  useDiffGutter({
    editorRef,
    monacoRef,
    active: showPlainEditor && fileContent !== null,
    mountTick,
    diffText: fileDiffText,
  })
```
(`showPlainEditor` is defined in Task 6 step 2d; ensure it is declared above this call.)

- [ ] **Step 6: Add the gutter CSS**

In `src/renderer/styles/theme.css`, add (near the existing `--diff-*` usage, anywhere at top level):

```css
.editor-gutter--added {
  border-left: 3px solid var(--diff-added-gutter);
}
.editor-gutter--modified {
  border-left: 3px solid var(--accent);
}
.editor-gutter--deleted {
  border-left: 3px solid var(--diff-deleted-gutter);
}
```

- [ ] **Step 7: Run editor tests + typecheck**

Run: `npx vitest run src/renderer/components/editor/`
Expected: PASS.

Run: `npm run typecheck:web`
Expected: no *new* errors vs baseline.

- [ ] **Step 8: Manual check**

Run the app. Open a file with uncommitted changes (one the active agent modified). Added lines show a green gutter bar, changed lines blue, deletions red — without switching to the diff view. Switching to markdown/diff/image and back leaves no stale bars.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/editor/useDiffGutter.ts src/renderer/components/editor/useDiffGutter.test.ts src/renderer/components/editor/CodeViewer.tsx src/renderer/styles/theme.css
git commit -m "feat(editor): git gutter decorations from the active file diff"
```

---

## Task 8: Go-to-Line and Go-to-Symbol keybindings

**Files:**
- Create: `src/renderer/components/editor/useEditorNavCommands.ts`
- Test: `src/renderer/components/editor/useEditorNavCommands.test.ts`
- Modify: `src/renderer/components/editor/CodeViewer.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/editor/useEditorNavCommands.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { registerEditorNavCommands } from './useEditorNavCommands'

function makeMonaco() {
  return {
    KeyMod: { CtrlCmd: 2048, Shift: 1024, WinCtrl: 256 },
    KeyCode: { KeyO: 50, KeyG: 42 },
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
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/useEditorNavCommands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/components/editor/useEditorNavCommands.ts`:

```ts
import type { editor as monacoEditor } from 'monaco-editor'

/**
 * Registers VS Code-style structural navigation on a Monaco editor:
 *  - Go to Symbol  (Cmd/Ctrl + Shift + O) → quick outline
 *  - Go to Line    (Ctrl + G)             → goto line
 * Ctrl+G (the mac control key, KeyMod.WinCtrl) is used for Go to Line to avoid
 * clobbering Cmd+G (find-next), matching VS Code on macOS.
 */
export function registerEditorNavCommands(
  editor: monacoEditor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
): void {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO, () => {
    editor.getAction('editor.action.quickOutline')?.run()
  })
  editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyG, () => {
    editor.getAction('editor.action.gotoLine')?.run()
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/useEditorNavCommands.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `CodeViewer`**

In `src/renderer/components/editor/CodeViewer.tsx`:

(a) Add import:

```tsx
import { registerEditorNavCommands } from './useEditorNavCommands'
```

(b) In `handleEditorMount`, after `monacoRef.current = monacoApi` (Task 7), add:

```tsx
    registerEditorNavCommands(editor, monacoApi)
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/renderer/components/editor/`
Expected: PASS.

Run: `npm run typecheck:web`
Expected: no *new* errors vs baseline.

- [ ] **Step 7: Manual check**

Run the app, open a code file. `Cmd+Shift+O` opens the symbol outline picker; `Ctrl+G` opens go-to-line. `Cmd+F`/`Cmd+G` find-next still work.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/editor/useEditorNavCommands.ts src/renderer/components/editor/useEditorNavCommands.test.ts src/renderer/components/editor/CodeViewer.tsx
git commit -m "feat(editor): Go-to-Symbol (Cmd+Shift+O) and Go-to-Line (Ctrl+G)"
```

---

## Task 9: `files:list` IPC for Quick Open

**Files:**
- Create: `src/main/fs/list-files.ts`
- Test: `src/main/fs/list-files.test.ts`
- Modify: `src/main/ipc/file-handlers.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/fs/list-files.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const execFileMock = vi.fn()
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

import { listWorktreeFiles } from './list-files'

// promisify(execFile) (without the custom symbol) resolves with the first
// post-error callback argument, so resolve with an object exposing `stdout`.
function resolveWith(stdout: string): void {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb: (e: unknown, r: unknown) => void) => {
    cb(null, { stdout })
  })
}

describe('listWorktreeFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns non-empty relative paths from git ls-files', async () => {
    resolveWith('a.ts\nsrc/b.ts\n\n')
    expect(await listWorktreeFiles('/repo')).toEqual(['a.ts', 'src/b.ts'])
  })

  it('returns an empty list when git fails', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb: (e: unknown, r: unknown) => void) => {
      cb(new Error('not a git repo'), null)
    })
    expect(await listWorktreeFiles('/repo')).toEqual([])
  })

  it('caps the result to 10000 entries', async () => {
    resolveWith(Array.from({ length: 10005 }, (_v, i) => `f${i}.ts`).join('\n'))
    expect((await listWorktreeFiles('/repo')).length).toBe(10000)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/fs/list-files.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/main/fs/list-files.ts`:

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const FILE_LIST_CAP = 10000

/**
 * Lists every tracked-or-untracked, non-ignored file in a worktree (VS Code's
 * Quick Open set) via `git ls-files`. Returns repo-relative paths. Caps the
 * result and logs when capped (no silent truncation); returns [] on any failure.
 */
export async function listWorktreeFiles(worktreePath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: worktreePath, timeout: 10000, maxBuffer: 16 * 1024 * 1024 },
    )
    const files = stdout.split('\n').filter((line) => line.length > 0)
    if (files.length > FILE_LIST_CAP) {
      console.warn(`[files:list] ${worktreePath}: ${files.length} files, capping to ${FILE_LIST_CAP}`)
      return files.slice(0, FILE_LIST_CAP)
    }
    return files
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/fs/list-files.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the IPC handler**

In `src/main/ipc/file-handlers.ts`:

(a) Add the import (after line 7):

```ts
import { listWorktreeFiles } from '../fs/list-files'
```

(b) Add the handler inside `registerFileHandlers`, after the `files:search-content` handler (line 207):

```ts
  ipcMain.handle('files:list', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return listWorktreeFiles(session.worktreePath)
  })
```

- [ ] **Step 6: Allowlist the channel in preload**

In `src/preload/index.ts`, add `'files:list'` to the `ALLOWED_INVOKE_CHANNELS` array, next to the other `files:*` entries:

```ts
  'files:list',
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck:node`
Expected: no *new* errors vs baseline.

- [ ] **Step 8: Commit**

```bash
git add src/main/fs/list-files.ts src/main/fs/list-files.test.ts src/main/ipc/file-handlers.ts src/preload/index.ts
git commit -m "feat(editor): files:list IPC (git ls-files) for Quick Open"
```

---

## Task 10: `fuzzy-match` scorer

**Files:**
- Create: `src/renderer/components/editor/fuzzy-match.ts`
- Test: `src/renderer/components/editor/fuzzy-match.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/editor/fuzzy-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyFilter } from './fuzzy-match'

describe('fuzzyScore', () => {
  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'src/app.ts')).toBeNull()
  })

  it('matches a subsequence case-insensitively', () => {
    expect(fuzzyScore('apts', 'src/App.ts')).not.toBeNull()
  })

  it('ranks a basename match above a scattered match', () => {
    const basename = fuzzyScore('codeview', 'src/components/editor/CodeViewer.tsx')!
    const scattered = fuzzyScore('codeview', 'c/o/d/e/v/i/e/w/other.ts')!
    expect(basename).toBeGreaterThan(scattered)
  })
})

describe('fuzzyFilter', () => {
  const files = ['src/CodeViewer.tsx', 'src/code-viewer-diff.ts', 'README.md']

  it('returns all items (capped) for an empty query', () => {
    expect(fuzzyFilter('', files)).toEqual(files)
  })

  it('keeps only matching items, best-first', () => {
    const out = fuzzyFilter('codeview', files)
    expect(out).toContain('src/CodeViewer.tsx')
    expect(out).not.toContain('README.md')
    expect(out[0]).toBe('src/CodeViewer.tsx')
  })

  it('respects the limit', () => {
    expect(fuzzyFilter('', files, 2)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/fuzzy-match.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/components/editor/fuzzy-match.ts`:

```ts
export interface FuzzyResult {
  value: string
  score: number
}

const WORD_BOUNDARY = '/._- '

/**
 * Scores how well `query` fuzzy-matches `target` (case-insensitive subsequence).
 * Higher is better. Returns null if `query` is not a subsequence of `target`.
 * Rewards contiguous runs, word-boundary starts, and matches in the basename.
 */
export function fuzzyScore(query: string, target: string): number | null {
  if (query.length === 0) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  let qi = 0
  let score = 0
  let prevMatch = -2
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === prevMatch + 1) score += 5
      if (ti === 0 || WORD_BOUNDARY.includes(t[ti - 1])) score += 10
      score += 1
      prevMatch = ti
      qi++
    }
  }
  if (qi < q.length) return null

  const slash = target.lastIndexOf('/')
  if (slash >= 0 && prevMatch > slash) score += 3
  score -= target.length * 0.01
  return score
}

/** Filters and ranks `items` against `query`, returning at most `limit` values. */
export function fuzzyFilter(query: string, items: string[], limit = 100): string[] {
  if (query.trim() === '') return items.slice(0, limit)
  const scored: FuzzyResult[] = []
  for (const value of items) {
    const score = fuzzyScore(query, value)
    if (score !== null) scored.push({ value, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((result) => result.value)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/fuzzy-match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/fuzzy-match.ts src/renderer/components/editor/fuzzy-match.test.ts
git commit -m "feat(editor): fuzzy-match scorer for Quick Open"
```

---

## Task 11: `QuickOpen` overlay component

**Files:**
- Create: `src/renderer/components/editor/QuickOpen.tsx`
- Test: `src/renderer/components/editor/QuickOpen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/editor/QuickOpen.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuickOpen } from './QuickOpen'

const invoke = vi.fn()
beforeEach(() => {
  invoke.mockReset()
  ;(window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke }
})

function renderOpen(onSelect = vi.fn(), onClose = vi.fn()) {
  invoke.mockResolvedValue(['src/CodeViewer.tsx', 'src/code-viewer-diff.ts', 'README.md'])
  render(
    <QuickOpen
      visible
      sessionId="s1"
      worktreeRoot="/repo"
      onSelect={onSelect}
      onClose={onClose}
    />,
  )
  return { onSelect, onClose }
}

describe('QuickOpen', () => {
  it('lists files from files:list and filters by query', async () => {
    renderOpen()
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Go to file'), { target: { value: 'codeview' } })
    expect(screen.getByText('src/CodeViewer.tsx')).toBeInTheDocument()
    expect(screen.queryByText('README.md')).toBeNull()
  })

  it('opens the highlighted file as an absolute path on Enter', async () => {
    const { onSelect } = renderOpen()
    await waitFor(() => expect(screen.getByText('src/CodeViewer.tsx')).toBeInTheDocument())
    const input = screen.getByLabelText('Go to file')
    fireEvent.change(input, { target: { value: 'codeview' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('/repo/src/CodeViewer.tsx')
  })

  it('closes on Escape', async () => {
    const { onClose } = renderOpen()
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    fireEvent.keyDown(screen.getByLabelText('Go to file'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when not visible', () => {
    render(<QuickOpen visible={false} sessionId="s1" worktreeRoot="/repo" onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Go to file')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/QuickOpen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/renderer/components/editor/QuickOpen.tsx`:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyFilter } from './fuzzy-match'

interface QuickOpenProps {
  visible: boolean
  sessionId: string | null
  worktreeRoot: string | null
  onSelect: (absolutePath: string) => void
  onClose: () => void
}

const MAX_RESULTS = 50

export function QuickOpen({ visible, sessionId, worktreeRoot, onSelect, onClose }: QuickOpenProps): React.JSX.Element | null {
  const [files, setFiles] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!visible || !sessionId) return
    setQuery('')
    setActiveIndex(0)
    let cancelled = false
    void (async (): Promise<void> => {
      try {
        const list = (await window.electronAPI.invoke('files:list', sessionId)) as string[]
        if (!cancelled) setFiles(list)
      } catch {
        if (!cancelled) setFiles([])
      }
    })()
    return () => { cancelled = true }
  }, [visible, sessionId])

  useEffect(() => {
    if (visible) requestAnimationFrame(() => inputRef.current?.focus())
  }, [visible])

  const results = useMemo(() => fuzzyFilter(query, files, MAX_RESULTS), [query, files])

  useEffect(() => { setActiveIndex(0) }, [query])

  if (!visible) return null

  const choose = (relativePath: string): void => {
    if (!worktreeRoot) return
    onSelect(`${worktreeRoot}/${relativePath}`)
  }

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const choice = results[activeIndex]
      if (choice) choose(choice)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div style={quickOpenStyles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div style={quickOpenStyles.panel}>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Go to file…"
          aria-label="Go to file"
          style={quickOpenStyles.input}
        />
        <ul style={quickOpenStyles.list} role="listbox">
          {results.length === 0 ? (
            <li style={quickOpenStyles.empty}>No files.</li>
          ) : (
            results.map((relativePath, index) => (
              <li
                key={relativePath}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => { event.preventDefault(); choose(relativePath) }}
                onMouseEnter={() => setActiveIndex(index)}
                style={{ ...quickOpenStyles.item, ...(index === activeIndex ? quickOpenStyles.itemActive : {}) }}
              >
                {relativePath}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

const quickOpenStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 300,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: '12vh',
    background: 'rgba(0, 0, 0, 0.35)',
  },
  panel: {
    width: 'min(600px, 90vw)',
    maxHeight: '60vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-popover)',
    overflow: 'hidden',
  },
  input: {
    padding: '10px 12px',
    fontSize: '13px',
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    outline: 'none',
  },
  list: {
    margin: 0,
    padding: '4px',
    listStyle: 'none',
    overflowY: 'auto',
  },
  item: {
    padding: '6px 8px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    borderRadius: '4px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemActive: {
    background: 'var(--list-hover-bg)',
    color: 'var(--text-primary)',
  },
  empty: {
    padding: '8px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/QuickOpen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:web`
Expected: no *new* errors vs baseline.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/editor/QuickOpen.tsx src/renderer/components/editor/QuickOpen.test.tsx
git commit -m "feat(editor): QuickOpen overlay component"
```

---

## Task 12: Wire `Cmd+P` to open Quick Open in `App.tsx`

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add Quick Open state + key handler**

In `src/renderer/App.tsx`:

(a) Add the import near the other editor-component imports:

```tsx
import { QuickOpen } from './components/editor/QuickOpen'
```

(b) Add state alongside the other `useState` hooks in the component (anywhere near the top of the component body):

```tsx
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
```
(`useState` is already imported in `App.tsx`.)

(c) Add a global key handler effect (place it near the other top-level `useEffect`s in the component):

```tsx
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey && !event.shiftKey && !event.altKey && (event.key === 'p' || event.key === 'P')) {
        event.preventDefault()
        setQuickOpenVisible(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
```

- [ ] **Step 2: Render the overlay**

In `src/renderer/App.tsx`, the component currently `return`s `<AppShell ... />` (lines 313-359). Wrap it in a fragment and render `QuickOpen` after it:

```tsx
  return (
    <>
      <AppShell
        /* ...existing props unchanged... */
      />
      <QuickOpen
        visible={quickOpenVisible}
        sessionId={effectiveSessionId}
        worktreeRoot={tree?.path ?? null}
        onSelect={(absolutePath) => {
          editorHandlers.handleSelectFileWithDefaultView(absolutePath)
          setQuickOpenVisible(false)
        }}
        onClose={() => setQuickOpenVisible(false)}
      />
    </>
  )
```

(`effectiveSessionId`, `tree`, and `editorHandlers` are already in scope — they are used to build `dockState` above. `tree?.path` is the worktree root, matching `dockState.worktreeRoot`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no *new* errors vs baseline.

- [ ] **Step 4: Run the renderer test suite**

Run: `npx vitest run src/renderer/`
Expected: PASS.

- [ ] **Step 5: Manual check**

Run the app with an active session. Press `Cmd+P`: the overlay opens, focused. Type part of a filename → fuzzy-ranked results. `↑/↓` move the highlight, `Enter` opens the file in the editor, `Esc` (or clicking the backdrop) closes it.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(editor): Cmd+P opens Quick Open fuzzy file picker"
```

---

## Final Verification

- [ ] **Full test suite** — Run the project test command (per the testing skill, including the `better-sqlite3` rebuild). Expected: green.
- [ ] **Typecheck** — `npm run typecheck:web` and `npm run typecheck:node`: no *new* errors vs the baseline captured before Task 1.
- [ ] **Lint** — run the project linter; fix any issues introduced by the new files.
- [ ] **LOC check** — confirm `CodeViewer.tsx` is still under 300 lines (`wc -l src/renderer/components/editor/CodeViewer.tsx`). If it crept over, extract the `handleEditorMount` body into a `useEditorMount` hook.
- [ ] **End-to-end manual pass** — line highlight + folding + brackets visible; Editor settings round-trip; status strip tracks the cursor; gutter bars match the diff; `Cmd+Shift+O` / `Ctrl+G` / `Cmd+P` all work.
- [ ] **Finish the branch** — use superpowers:finishing-a-development-branch (PR via the gh-create-pr skill).
