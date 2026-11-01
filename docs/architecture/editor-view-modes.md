---
description: How explicit opens target one pane and moved tabs carry their remembered view mode to another.
covers: [src/renderer/components/editor/file-open-request.ts, src/renderer/components/editor/code-viewer/useCodeViewerModes.ts, src/renderer/hooks/editor/useEditorPaneHandlers.ts, src/renderer/hooks/editor/useFileOperations.ts, src/renderer/hooks/editor/useCodeView.ts]
updated: 2026-11-01T18:00:15Z
owner: see .github/CODEOWNERS
---

# Editor view modes

An explicit file-open request carries the `paneId` that actually handled the open
(`src/renderer/components/editor/file-open-request.ts:16`). The app-level file-opening
wrapper returns the selected pane ID after making it visible
(`src/renderer/hooks/editor/useFileOperations.ts:33`). File-tree, Modified Files,
Source Control, search (including split search), and markdown-link handlers record
that returned destination on their requests
(`src/renderer/hooks/editor/useEditorPaneHandlers.ts:70`, `:96`, `:118`, `:123`, `:132`).

`useCodeViewerModes` applies an explicit request only when both its pane ID and path
match the current pane and active file. Only a matching request is recorded as handled
(`src/renderer/components/editor/code-viewer/useCodeViewerModes.ts:109`). A request
targeted elsewhere therefore cannot override this pane's remembered Editor/Diff choice,
even if this pane activates the same file later. Tab clicks change the active file
without issuing another request (`useEditorPaneHandlers.ts:128`).

First opens and new matching requests seed Diff for `sourceControl` and `default`
(Modified Files), and Editor for other sources (`useCodeViewerModes.ts:113`). Diff
preferences survive delayed diff loading; the visible Diff mode also requires the
active file's current diff data (`useCodeViewerModes.ts:64`). Remembered choices and
handled requests survive remounts through module-level pane maps; diff choices and
first-open history are bounded to 200 paths per pane (`useCodeViewerModes.ts:13`, `:79`, `:115`).

Moving a tab uses `useCodeView.moveFileToPane` to copy that path's Diff and Preview
choices before activating it in the destination (`hooks/editor/useCodeView.ts:202`).
`copyCodeViewerModes` replaces only that path's choices and marks both first-open
histories as seeded, including when the choice is Editor. Markdown auto-preview and
first-open Diff defaults therefore cannot override the moved tab. All transferred
sets retain the 200-path bound (`useCodeViewerModes.ts:212`). A mounted destination
receives the copied sets immediately; an unmounted one reads them when it mounts
(`useCodeViewerModes.ts:195`, `:58`). No new open request is issued by either move
handler (`useEditorPaneHandlers.ts:147`, `:151`).

The two-pane regression in `code-viewer/useCodeViewerModes.test.tsx:182` covers a
Source Control request while the other pane shows either the same file or another tab.
`hooks/editor/useEditorPaneHandlers.open-request.test.ts:39` checks destination IDs
and preserves Source Control and search metadata across the open handlers.
`code-viewer/useCodeViewerModes-move.test.tsx:67` covers Source Control/Modified Files
Diff defaults, manual Editor/Diff/Preview choices, new splits, mounted destinations,
tab revisits, delayed diff data, and remounts using local pane state and fake dock operations.
