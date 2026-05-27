# Image Preview in Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user clicks an image file in the filetree, open it in a tab and render a centered fit-to-pane preview instead of garbled Monaco text.

**Architecture:** Reuse the existing `files:read-data-url` IPC handler (which returns `data:image/...;base64,...` URLs with correct MIME). Branch on extension in two places: (1) the renderer's file-open hook routes image reads to the data-url IPC and stores the URL in `OpenFile.content`; (2) `CodeViewer` adds a top-level branch that renders a new `<ImagePreview>` component when the active file is an image. No changes to `OpenFile` shape, no changes to main-process code.

**Tech Stack:** React + TypeScript renderer in an Electron app; Vitest + Testing Library for tests. Source tree: `src/renderer/`, `src/main/`. Test runner: `npm test` (`vitest run`). Run a single test file with `npx vitest run path/to/file.test.ts`.

**Spec:** `docs/superpowers/specs/2026-05-26-image-preview-in-editor-design.md`

**Project rules to keep in mind:**
- Match existing code style — flow imports, named exports, prop-typed components, inline `style` objects driven from `*.styles.ts`.
- Don't add features beyond the spec. No zoom/pan/hex toggle/metadata panel.
- Don't refactor adjacent code.
- Split files approaching 300 LOC — already informs the `ImagePreview` extraction.

**File overview:**

| File | Action |
| --- | --- |
| `src/renderer/components/editor/code-viewer-utils.ts` | Modify — add `isImageFile` helper |
| `src/renderer/components/editor/code-viewer-utils.test.ts` | Modify — add `isImageFile` tests |
| `src/renderer/components/editor/viewer/ImagePreview.tsx` | Create — small image-rendering component |
| `src/renderer/components/editor/viewer/ImagePreview.test.tsx` | Create — component test |
| `src/renderer/hooks/useCodeViewFileOps.ts` | Modify — route image reads to `files:read-data-url` |
| `src/renderer/hooks/useCodeView.test.ts` | Modify — test image-path IPC routing |
| `src/renderer/components/editor/CodeViewer.tsx` | Modify — render `<ImagePreview>` branch, suppress preview/diff toggles for images |
| `src/renderer/components/editor/CodeViewer.test.tsx` | Modify — test image rendering path |

---

## Task 1: `isImageFile` helper

**Files:**
- Modify: `src/renderer/components/editor/code-viewer-utils.ts` (add helper near `isMarkdownFile` / `isHtmlFile`)
- Test: `src/renderer/components/editor/code-viewer-utils.test.ts` (add describe block alongside existing `isHtmlFile` describe)

- [ ] **Step 1: Write failing tests**

Append this `describe` block to `code-viewer-utils.test.ts` (also add `isImageFile` to the import at the top of that file):

```ts
describe('isImageFile', () => {
  it('returns true for common raster extensions', () => {
    expect(isImageFile('photo.png')).toBe(true)
    expect(isImageFile('photo.jpg')).toBe(true)
    expect(isImageFile('photo.jpeg')).toBe(true)
    expect(isImageFile('photo.gif')).toBe(true)
    expect(isImageFile('photo.webp')).toBe(true)
    expect(isImageFile('photo.bmp')).toBe(true)
    expect(isImageFile('photo.ico')).toBe(true)
    expect(isImageFile('photo.avif')).toBe(true)
    expect(isImageFile('photo.apng')).toBe(true)
  })

  it('returns true for svg', () => {
    expect(isImageFile('icon.svg')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isImageFile('Photo.PNG')).toBe(true)
    expect(isImageFile('Photo.JPEG')).toBe(true)
  })

  it('returns false for non-image extensions', () => {
    expect(isImageFile('readme.md')).toBe(false)
    expect(isImageFile('index.ts')).toBe(false)
    expect(isImageFile('page.html')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isImageFile(null)).toBe(false)
  })

  it('returns false for files without an extension', () => {
    expect(isImageFile('Dockerfile')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test and verify failure**

```
npx vitest run src/renderer/components/editor/code-viewer-utils.test.ts
```
Expected: FAIL — `isImageFile is not exported`.

- [ ] **Step 3: Implement `isImageFile`**

Add to `src/renderer/components/editor/code-viewer-utils.ts` (place after `isHtmlFile`):

```ts
// Must stay in sync with mimeTypeForFile in src/main/ipc/file-handlers.ts.
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'apng',
])

export function isImageFile(filePath: string | null): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (ext === filePath.toLowerCase()) return false
  return IMAGE_EXTENSIONS.has(ext)
}
```

The `ext === filePath.toLowerCase()` guard makes `Dockerfile` → `false` (no extension means `split('.').pop()` returns the whole string).

- [ ] **Step 4: Run test and verify pass**

```
npx vitest run src/renderer/components/editor/code-viewer-utils.test.ts
```
Expected: PASS — all `isImageFile` cases plus pre-existing tests.

- [ ] **Step 5: Commit**

```
git add src/renderer/components/editor/code-viewer-utils.ts src/renderer/components/editor/code-viewer-utils.test.ts
git commit -m "feat(editor): add isImageFile helper"
```

---

## Task 2: `ImagePreview` component

**Files:**
- Create: `src/renderer/components/editor/viewer/ImagePreview.tsx`
- Create: `src/renderer/components/editor/viewer/ImagePreview.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/renderer/components/editor/viewer/ImagePreview.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImagePreview } from './ImagePreview'

describe('ImagePreview', () => {
  it('renders an img element with the supplied data URL as src', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    render(<ImagePreview filePath="/repo/logo.png" dataUrl={dataUrl} />)

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', dataUrl)
    expect(img).toHaveAttribute('alt', '/repo/logo.png')
  })

  it('marks the image as not draggable', () => {
    render(<ImagePreview filePath="/repo/logo.png" dataUrl="data:image/png;base64,AA" />)
    expect(screen.getByRole('img')).toHaveAttribute('draggable', 'false')
  })
})
```

- [ ] **Step 2: Run test and verify failure**

```
npx vitest run src/renderer/components/editor/viewer/ImagePreview.test.tsx
```
Expected: FAIL — `Cannot find module './ImagePreview'`.

- [ ] **Step 3: Implement `ImagePreview`**

Create `src/renderer/components/editor/viewer/ImagePreview.tsx`:

```tsx
import React from 'react'

interface ImagePreviewProps {
  filePath: string
  dataUrl: string
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: '16px',
    overflow: 'auto',
    background: 'var(--bg-primary)',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    userSelect: 'none',
  },
}

export function ImagePreview({ filePath, dataUrl }: ImagePreviewProps): React.JSX.Element {
  return (
    <div style={styles.wrapper}>
      <img src={dataUrl} alt={filePath} style={styles.image} draggable={false} />
    </div>
  )
}
```

- [ ] **Step 4: Run test and verify pass**

```
npx vitest run src/renderer/components/editor/viewer/ImagePreview.test.tsx
```
Expected: PASS — both assertions.

- [ ] **Step 5: Commit**

```
git add src/renderer/components/editor/viewer/ImagePreview.tsx src/renderer/components/editor/viewer/ImagePreview.test.tsx
git commit -m "feat(editor): add ImagePreview component"
```

---

## Task 3: Route image reads to `files:read-data-url`

**Files:**
- Modify: `src/renderer/hooks/useCodeViewFileOps.ts`
- Modify: `src/renderer/hooks/useCodeView.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/renderer/hooks/useCodeView.test.ts` (inside the existing `describe('useCodeView', ...)`):

```ts
it('reads image files via files:read-data-url and stores the data URL in content', async () => {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
  mockInvoke.mockImplementation(async (channel: string) => {
    if (channel === 'files:read-data-url') return dataUrl
    if (channel === 'files:read') return 'should not be used for images'
    return null
  })

  const { result } = renderHook(() => useCodeView('session-1'))

  act(() => {
    result.current.handleSelectFile('/repo/logo.png')
  })

  await waitFor(() => {
    expect(result.current.openFiles.map((file) => file.path)).toEqual(['/repo/logo.png'])
  })

  expect(mockInvoke).toHaveBeenCalledWith('files:read-data-url', 'session-1', '/repo/logo.png')
  expect(mockInvoke).not.toHaveBeenCalledWith('files:read', 'session-1', '/repo/logo.png')
  expect(result.current.activeFileContent).toBe(dataUrl)
})

it('still reads non-image files via files:read', async () => {
  mockInvoke.mockResolvedValue('const value = 1')

  const { result } = renderHook(() => useCodeView('session-1'))

  act(() => {
    result.current.handleSelectFile('/repo/file.ts')
  })

  await waitFor(() => {
    expect(result.current.openFiles).toHaveLength(1)
  })

  expect(mockInvoke).toHaveBeenCalledWith('files:read', 'session-1', '/repo/file.ts')
  expect(mockInvoke).not.toHaveBeenCalledWith('files:read-data-url', 'session-1', '/repo/file.ts')
})
```

- [ ] **Step 2: Run test and verify failure**

```
npx vitest run src/renderer/hooks/useCodeView.test.ts
```
Expected: FAIL — the new image test fails because `mockInvoke` is called with `files:read`, not `files:read-data-url`.

- [ ] **Step 3: Update `useCodeViewFileOps.ts`**

In `src/renderer/hooks/useCodeViewFileOps.ts`:

(a) Add the import at the top, near the other imports:

```ts
import { isImageFile } from '../components/editor/code-viewer-utils'
```

(b) In `handleSelectFile` (around the existing `void (async () => { ... })()` block), replace the read with:

```ts
const ipcChannel = isImageFile(filePath) ? 'files:read-data-url' : 'files:read'
const content = readFileOverrideRef.current
  ? await readFileOverrideRef.current(filePath)
  : ((await window.electronAPI.invoke(
      ipcChannel,
      activeSessionIdRef.current,
      filePath,
    )) as string)
```

(c) In `refreshOpenFiles`, replace the per-file read with:

```ts
const ipcChannel = isImageFile(file.path) ? 'files:read-data-url' : 'files:read'
const content = readFileOverrideRef.current
  ? await readFileOverrideRef.current(file.path)
  : ((await window.electronAPI.invoke(
      ipcChannel,
      activeSessionIdRef.current,
      file.path,
    )) as string)
```

Leave the superagent `readFileOverride` path as-is — it keeps text-only behavior, which is fine for v1 (out of scope per spec).

- [ ] **Step 4: Run tests and verify pass**

```
npx vitest run src/renderer/hooks/useCodeView.test.ts
```
Expected: PASS — new image and non-image tests both pass, existing tests still pass.

- [ ] **Step 5: Commit**

```
git add src/renderer/hooks/useCodeViewFileOps.ts src/renderer/hooks/useCodeView.test.ts
git commit -m "feat(editor): route image file reads to files:read-data-url"
```

---

## Task 4: Render `ImagePreview` in `CodeViewer` and suppress mode toggles

**Files:**
- Modify: `src/renderer/components/editor/CodeViewer.tsx`
- Modify: `src/renderer/components/editor/CodeViewer.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `src/renderer/components/editor/CodeViewer.test.tsx` (no new imports needed — the test only checks rendered output and pane-mode controls):

```tsx
describe('CodeViewer image rendering', () => {
  it('renders an <img> with the data URL when the active file is an image', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    renderViewer({
      openFiles: [makeOpenFile({ path: '/repo/logo.png', content: dataUrl })],
      activeFilePath: '/repo/logo.png',
      fileContent: dataUrl,
    })

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', dataUrl)
    expect(screen.queryByTestId('monaco-editor')).toBeNull()
  })

  it('does not register preview or diff controls for image files', () => {
    const dataUrl = 'data:image/png;base64,AA'
    renderViewer({
      paneId: 'editor-image-test',
      openFiles: [makeOpenFile({ path: '/repo/logo.png', content: dataUrl })],
      activeFilePath: '/repo/logo.png',
      fileContent: dataUrl,
      fileDiffText: 'diff --git a/foo b/foo\n',
    })

    const controls = getEditorPaneModeControls('editor-image-test')
    expect(controls?.canShowPreview).toBe(false)
    expect(controls?.canShowDiff).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

```
npx vitest run src/renderer/components/editor/CodeViewer.test.tsx
```
Expected: FAIL — `monaco-editor` is rendered for an image; `canShowDiff` is `true` because diff text is present.

- [ ] **Step 3: Update `CodeViewer.tsx`**

In `src/renderer/components/editor/CodeViewer.tsx`:

(a) Add `isImageFile` to the existing import from `./code-viewer-utils`:

```ts
import {
  extensionToLanguage,
  isHtmlFile,
  isImageFile,
  isMarkdownFile,
} from './code-viewer-utils'
```

(b) Add the import for the new component near the other viewer imports:

```ts
import { ImagePreview } from './viewer/ImagePreview'
```

(c) Inside the component, after the existing `isMd` / `isHtml` lines, add:

```ts
const isImage = isImageFile(activeFilePath)
```

(d) Update `showPreviewToggle` and `showDiffToggle` to exclude images:

```ts
const showPreviewToggle = hasTabs && isPreviewable && !isImage
const showDiffToggle = hasTabs && hasDiff && !isImage
```

(e) In the JSX, add an image branch as the **first** conditional inside `<div style={viewerStyles.editorContainer} ...>`, before the existing `previewActive && isHtml ...` branch:

```tsx
{isImage && activeFilePath !== null && fileContent !== null ? (
  <ImagePreview filePath={activeFilePath} dataUrl={fileContent} />
) : previewActive && isHtml && resolvedHtml !== null ? (
  // ... existing branches unchanged
```

The image branch short-circuits everything else, so Monaco, markdown, HTML, and diff never mount for an image file.

- [ ] **Step 4: Run tests and verify pass**

```
npx vitest run src/renderer/components/editor/CodeViewer.test.tsx
```
Expected: PASS — image rendering tests pass; existing tests still pass.

- [ ] **Step 5: Run the full renderer test suite to confirm no regressions**

```
npx vitest run src/renderer
```
Expected: PASS — no regressions across editor / hooks / dock panels.

- [ ] **Step 6: Commit**

```
git add src/renderer/components/editor/CodeViewer.tsx src/renderer/components/editor/CodeViewer.test.tsx
git commit -m "feat(editor): render image preview in code viewer"
```

---

## Task 5: Manual verification

**Files:** none — manual smoke test in the running app.

- [ ] **Step 1: Run the typecheck / build to catch type regressions**

```
npm test
```
Expected: PASS — full vitest suite green.

- [ ] **Step 2: Start the dev app**

```
npm run dev
```
Or follow the project's preferred launch path. Once the app is running:

- [ ] **Step 3: Smoke-test in the UI**

In a session with a real repo:
1. Click a `.png` (e.g. `manifold.jpg` at the repo root) in the filetree. Verify it opens in a tab and shows the rendered image centered, fit to pane. Verify Monaco does not appear.
2. Click an `.svg` file (any) — verify it renders as an image, not as XML.
3. Click a `.ts` file — verify it still opens in Monaco as before.
4. Open the image in a split pane (drag tab right) — verify image renders in both panes.
5. Close the image tab — verify normal close behavior.
6. With an image active, confirm the Preview and Diff toggles in the editor header are hidden / disabled.

If any step fails, return to the relevant task and add a regression test before fixing.

- [ ] **Step 4: Final commit only if changes were needed for smoke-test fixes**

(No commit if Step 3 surfaced no issues.)

---

## Done criteria

- All five tasks complete; checklist boxes checked.
- `npm test` is green.
- Manual smoke test in Step 3 of Task 5 passes for all six bullets.
- No new files outside the list in "File overview".
- `CodeViewer.tsx` remains under ~320 LOC (the image branch should add < 10 lines).
