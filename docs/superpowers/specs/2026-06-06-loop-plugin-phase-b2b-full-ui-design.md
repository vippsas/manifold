# Loop-as-a-Plugin — Phase B2b: Full Webview UI — Design

**Status:** Design (standing pre-approval). Plan to follow via `writing-plans`.
**Date:** 2026-06-06
**Depends on:** B2a (#445 — webview bundle, theme injection, message bridge, minimal panel).

---

## Why this exists

B2a proved the webview pipeline with a minimal read-only panel. B2b ports the **full
interactive loop UI** into that webview and wires the action protocol, reaching feature parity
with the built-in loop panel — config form, iteration history, start/stop/clear/restore
controls, "Improve with AI", and the Clear confirm. This is the last build-out before Phase C
(which deletes the built-in panel and makes this canonical).

The three React components already exist in `src/renderer/components/loop/`; B2b ports them into
the plugin's webview, replacing their renderer-only dependencies (`useDockState`, `useLoop`,
`window.electronAPI`, `window.confirm`) with the webview message bridge and host-routed
callbacks.

---

## Webview architecture

All under `resources/plugins/manifold.loop/src/webview/`.

### State bridge — `use-loop-bridge.ts` (replaces `useLoop`)

A hook returning `{ sessionId, status, iterations, config, busy }` plus actions. Inbound host
messages drive state via a **pure reducer** `applyHostMsg(state, msg)` (extracted + unit-tested):

- `init` → replace all (sessionId/status/iterations/config)
- `status` → set status
- `iteration` → append iteration
- `__manifold_theme` → apply CSS vars (handled in the message listener, not the reducer)

Actions post `WebviewMsg` to `parent`:

- `start(config)` → `{start}` + optimistic local `iterations: []`, `status.state:'running'`
- `stop()` → `{stop}`
- `saveConfig(config)` → `{saveConfig}`
- `clear()` → `{clearRequest}` (host shows the confirm; on success the host re-posts `init`)
- `restoreBest()` → `{restoreBest}`; resolves when `restoreResult` arrives → `{ sha }` or throw
- `improveWithAi(draft, evalCommand, targetGlobs)` → `{improveWithAi}`; resolves when
  `aiResult` arrives → improved text or throw

`restoreBest`/`improveWithAi` are **single-flight** (the UI disables the trigger while busy), so
a single pending-resolver per kind is sufficient — no request ids.

### Components — `components/`

- **`LoopIterationList.tsx`** — copied verbatim; imports retargeted to local `../styles` and
  `../types`.
- **`LoopConfigForm.tsx`** — copied; the only change is replacing the direct
  `window.electronAPI.invoke('git:ai-generate', …)` call with an injected prop
  `onImproveWithAi(draft: string): Promise<string>` (the container passes `bridge.improveWithAi`
  bound with the current eval/globs). All form state logic (`helpers.ts`) is unchanged.
- **`LoopPanel.tsx`** — copied container; `useDockState().sessionId` + `useLoop(sessionId)` →
  `useLoopBridge()`; `window.confirm(...)` in `handleClear` → `bridge.clear()` (host confirms);
  `LoopIntro` + `PendingIterationCard` ported as-is.

### Helpers + styles

- **`helpers.ts`** — copy `FormState`, `DEFAULT_FORM`, `formFromConfig`, `configFromForm`,
  `describeMetric` (retarget the type import to `../types`).
- **`styles/panel.styles.ts`**, **`styles/form.styles.ts`**, **`styles/iteration.styles.ts`**,
  **`styles/index.ts`** — the 469-line `loopPanelStyles` object split by section and re-merged
  in the index (`loopPanelStyles = { ...panel, ...form, ...iteration }`), plus `outcomeColors`
  and `stateColors`. Keeps every file < 300 LOC. Component import sites use the index unchanged
  (`import { loopPanelStyles as S, outcomeColors, stateColors } from '../styles'`).
- **Keyframes** — the styles use `@keyframes dot-blink`, `spin`, `ai-pulse`,
  `loop-progress-sweep` (defined in `src/renderer/styles/theme.css`, absent in the iframe).
  `index.tsx` injects a `<style>` with these four keyframes on mount (CSP `style-src
  'unsafe-inline'` allows it).

### Entry — `index.tsx`

Renders `<LoopPanel/>` (full container) instead of the B2a minimal app; injects the keyframes
`<style>`; keeps the `__manifold_theme` handling (now inside `use-loop-bridge`).

---

## Protocol changes (`webview/protocol.ts`)

Add one `HostMsg` variant (the rest already exist from B2a):

```ts
  | { type: 'restoreResult'; ok: boolean; sha?: string; error?: string }
```

`WebviewMsg` is unchanged (B2a already defined `start`/`stop`/`saveConfig`/`restoreBest`/
`clearRequest`/`improveWithAi`).

---

## Plugin side

### `webview-host.ts` — handle the full message set

`createWebviewHost` options widen:

```ts
interface WebviewHostOptions {
  engine: EngineFacade            // widened: getStatus/getStatusSync/getIterations/getConfig/
                                  //          start/stop/setConfig/restoreBest/clear
  readBundle: () => string
  getActiveSessionId: () => string | null
  confirmClear: () => Promise<boolean>                       // → manifold.window.showWarningMessage
  improveWithAi: (a: { draft: string; evalCommand: string; targetGlobs: string }) => Promise<string>  // → manifold.lm
}
```

`onDidReceiveMessage` dispatch:
- `ready` → post `init` (unchanged)
- `start{config}` → `engine.start(config)` fire-and-forget (engine persists config + emits status)
- `stop` → `engine.stop(sessionId)`
- `saveConfig{config}` → `engine.setConfig(sessionId, config)`
- `restoreBest` → `engine.restoreBest(sessionId)` → post `restoreResult{ok,sha}` / `{ok:false,error}`
- `clearRequest` → `await confirmClear()`; if true → `engine.clear(sessionId)` → re-post `init`
- `improveWithAi{…}` → `await improveWithAi(args)` → post `aiResult{ok,text}` / `{ok:false,error}`

`refresh()` (re-post `init` to the current view) is added and called by the plugin on active-session change.

Kept **manifold-free** (engine + the two callbacks are injected), so the full dispatch is
unit-testable with fakes.

### `plugin.ts` — wire callbacks + session refresh

- `confirmClear`: `(await manifold.window.showWarningMessage('Clear all iteration history for this loop? This cannot be undone.', 'Clear')) === 'Clear'`.
- `improveWithAi`: build the instruction via `buildImproveInstruction(args)` (pure, ported from
  the form's prompt text), then `(await manifold.lm.selectChatModels())[0]?.sendRequest(instruction)`.
- Subscribe `manifold.workspace.onDidChangeActiveSession(() => host.refresh())`.

### `improve-instruction.ts` — pure prompt builder

Ported verbatim from `LoopConfigForm.improveWithAi`'s instruction text (draft vs. no-draft
branches). Unit-tested for both branches.

---

## Data flow (representative)

```
Start: form submit → bridge.start(cfg) → {start} → host → engine.start → engine.emit('status'/'iteration')
  → host.postMessage → bridge reducer → panel re-renders live
Clear: Clear button → bridge.clear() → {clearRequest} → host → confirmClear() (manifold dialog)
  → engine.clear → host re-posts init → bridge resets
Improve: form "Improve with AI" → bridge.improveWithAi(draft,…) → {improveWithAi} → host
  → manifold.lm.sendRequest → host {aiResult, text} → bridge resolves → form sets program
```

---

## Testing strategy

- `helpers.test.ts` — `configFromForm` validation/branches, `formFromConfig` round-trip,
  `describeMetric`.
- `improve-instruction.test.ts` — draft vs. no-draft prompt contents.
- `use-loop-bridge` reducer — `applyHostMsg` cases (init/status/iteration).
- `webview-host.test.ts` (extend) — `start`/`stop`/`saveConfig` call the engine;
  `restoreBest` posts `restoreResult`; `clearRequest` confirmed→`clear`+`init`,
  declined→no-op; `improveWithAi` posts `aiResult`; `refresh` re-posts `init`.
- Build: `build:plugins` emits `out/webview.js`.
- React rendering + real interaction verified by **manual dev smoke** (owed): configure + start
  a loop from the panel, watch iterations stream, Clear (confirm dialog), Restore Best, Improve
  with AI.

---

## Verification gates

- New tests green; full suite green.
- `typecheck:node`/`:web` baseline (16/36); `typecheck:plugins` clean.
- `build:plugins` emits `manifold.loop/out/{plugin,webview}.js`.
- Built-in loop untouched (empty diff under `src/main/loop`, `src/renderer/components/loop`,
  `loop-handlers.ts`).
- All touched files < 300 LOC (styles split enforces this).

---

## Out of scope (B2b)

- Removing the built-in loop panel / flipping the contribution `internal`→`plugin` → **Phase C**.
- Any behavior change vs. the built-in panel — this is a parity port.
- Light/dark switch fidelity beyond the host-injected vars from B2a.

---

## Self-review notes

- **Placeholders:** none — every ported file names its source and the one adaptation it needs.
- **Consistency:** `useLoopBridge` mirrors `UseLoopResult`; the styles index re-exports the same
  names the components already import (`loopPanelStyles`/`outcomeColors`/`stateColors`); the
  protocol gains exactly one variant; webview-host stays manifold-free via injected callbacks.
- **Scope:** parity UI port + action wiring; no built-in removal (Phase C). Styles split is the
  one structural change, driven by the < 300 LOC rule on the copied file.
- **Ambiguity resolved:** Clear confirm happens host-side (`showWarningMessage`), then `init`
  re-post; `restoreBest`/`improveWithAi` are single-flight so no request-id correlation needed.
