# PDF Preview in the Editor — Design

## Goal

When a user opens a `.pdf` file from the file tree, render it as a readable PDF
viewer in the editor pane (continuous page scroll + zoom), the way any normal
PDF viewer would — instead of dumping its binary bytes into the Monaco text
editor.

## Approach

Render with **pdf.js** (`pdfjs-dist`), mirroring how images are already handled.
A PDF has no meaningful text source, so it always renders as a viewer (like
`ImagePreview`) — there is no source/preview toggle and no editing.

Decision (confirmed with user): pdf.js over Chromium's built-in pdfium viewer.
pdf.js gives a themeable, fully-controllable React viewer consistent with how the
app already bundles Monaco/Mermaid, and it works inside the existing CSP with a
same-origin Vite-bundled worker.

## Data flow

```
FileTree click
  → useCodeViewFileOps.handleSelectFile(path)
      channel = isImageFile(path) || isPdfFile(path) ? 'files:read-data-url' : 'files:read'
  → main: files:read-data-url → readFileAsDataUrl → mimeTypeForFile('.pdf') = 'application/pdf'
      returns  data:application/pdf;base64,....
  → OpenFile.content holds the data URL string (same shape as images)
  → CodeViewer: isPdf branch → <PdfPreview filePath dataUrl />
  → PdfPreview decodes base64 → Uint8Array → pdfjsLib.getDocument({ data })
      renders each page to a <canvas>, lazily as it scrolls into view
```

This reuses the existing `files:read-data-url` IPC channel (already whitelisted
in preload) — no new IPC channel, no preload change.

## Components / changes

1. `code-viewer-utils.ts` — add `isPdfFile(path)` (mirrors `isImageFile`). Unit
   tested.
2. `main/ipc/file-handlers.ts` — add `case '.pdf': return 'application/pdf'` to
   `mimeTypeForFile`. (Comment in `code-viewer-utils.ts` already says the two
   must stay in sync.)
3. `useCodeViewFileOps.ts` — route `.pdf` through `files:read-data-url` in both
   `handleSelectFile` and `refreshOpenFiles`.
4. `CodeViewer.tsx` — `const isPdf = isPdfFile(activeFilePath)`; add a PDF render
   branch (first in the ternary so it wins over diff/plain) and negate it in
   `showPlainEditor` so the status bar / Monaco don't also mount.
5. `viewer/PdfPreview.tsx` — **new**. pdf.js viewer: continuous vertical scroll of
   pages rendered to canvas, lazy render via `IntersectionObserver`, zoom
   in/out/reset controls mirroring `ImagePreview`'s control bar, page count, HiDPI
   support, loading + error states.
6. `viewer/pdfjs-worker.ts` — **new**. One-time worker setup:
   `GlobalWorkerOptions.workerPort = new PdfjsWorker()` using
   `pdfjs-dist/build/pdf.worker.min.mjs?worker` (same `?worker` pattern as
   `monaco-setup.ts`).
7. `index.html` — add `worker-src 'self' blob:` to the CSP (defensive; the worker
   is same-origin but Vite can fall back to a blob worker).

## Error / edge handling

- Decode/parse failure → show an error message in the pane, not a crash.
- Empty / 0-page PDF → render nothing with a "no pages" message.
- Large PDFs → lazy per-page rendering (only visible pages paint) keeps it
  responsive.
- Standard-14 / CJM-only fonts without embedded data may fall back to system
  fonts (no `cMapUrl`/`standardFontDataUrl` bundled in v1). Acceptable for v1;
  most real PDFs embed their fonts.

## Testing

- Unit: `isPdfFile` in `code-viewer-utils.test.ts`.
- Unit: `mimeTypeForFile` returns `application/pdf` for `.pdf` (if a test exists
  for it; otherwise covered by the sync-comment invariant).
- Manual: open a real PDF from the file tree in the running app; confirm pages
  render, scroll, and zoom.

## Out of scope (v1)

Text selection / search, printing, thumbnails sidebar, page jump input,
annotations, bundled cMaps/standard fonts.
