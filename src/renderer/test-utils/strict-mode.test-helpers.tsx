import React from 'react'
import { render, type RenderResult } from '@testing-library/react'

/**
 * Render `ui` wrapped in `<React.StrictMode>` so React's development-only
 * mount → unmount → remount cycle fires during the test.
 *
 * Why this exists: the app itself mounts under `<React.StrictMode>`
 * (`src/renderer/index.tsx`), so every component's effects run
 * setup → cleanup → setup on first render in dev. A bare `render()` mounts
 * once and hides an entire class of bug — the canonical one being a
 * `useRef(true)` "is-mounted" flag that a cleanup flips to `false` and only
 * the effect *body* sets back to `true`. Reset it only in cleanup and the flag
 * sticks at `false` after the remount, so later async callbacks that gate on
 * `mountedRef.current` are silently dropped (this caused the New Agent
 * "Starting…" hang; see `NewAgentForm.tsx` and `docs/architecture/gotchas.md`).
 *
 * A packaged build mounts once too, so manual verification of the .dmg misses
 * this — only a StrictMode unit test catches it deterministically.
 *
 * Use this instead of a bare `render()` for any component whose async work
 * gates on a mounted/aborted ref, or whose effects must be idempotent across a
 * remount. `strict-mode.test.tsx` is the copyable template + proof it works.
 */
export function renderWithStrictMode(ui: React.ReactElement): RenderResult {
  return render(<React.StrictMode>{ui}</React.StrictMode>)
}
