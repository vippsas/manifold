# Loop-as-a-Plugin — Phase B2a: Webview Plumbing — Design

**Status:** Design (standing pre-approval). Plan to follow via `writing-plans`.
**Date:** 2026-06-06
**Depends on:** Phase A (#443) + B1 (#444 — the `manifold.loop` plugin + `LoopEngine`).

---

## Why this exists

B1 gave the loop plugin a headless engine driven by commands. B2 gives it a UI in a webview.
Because the webview work is large and risk-concentrated in the *infrastructure* (bundling a
React app into a sandboxed nonce-CSP iframe, theming it, and a duplex message protocol), B2
splits:

- **B2a (this spec):** the plumbing — build step, generic theme injection, message protocol,
  the plugin's webview provider, and a **minimal read-only status webview** that proves the
  whole pipeline end-to-end.
- **B2b (next spec):** port the full interactive UI (config form, iteration list, controls,
  "Improve with AI", Clear-confirm).

The built-in loop panel stays untouched and coexists; the plugin's view uses a distinct title
("Loop (plugin)") during the transition. Phase C removes the built-in one and makes the plugin
view canonical.

---

## Constraints (from the existing webview infra)

- The webview is a sandboxed iframe (`sandbox="allow-scripts"`) served a single HTML blob by
  the `manifold-webview://` protocol, under a nonce CSP: `default-src 'none'; script-src
  'nonce-…'; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob: https:`.
  Implications: the React bundle must be **inlined** as a `<script>` (auto-nonced by
  `injectNonce`); **no fetch/XHR** (talk to the host via `parent.postMessage` only); inline
  styles + a `<style>` block are allowed.
- Duplex messaging already exists: webview `parent.postMessage` → `PluginViewPanel` →
  `plugins:webview-to-host` → host → plugin `webview.onDidReceiveMessage`; and plugin
  `webview.postMessage` → host → `plugins:webview-message` → `PluginViewPanel` → iframe. B2a
  reuses this unchanged.
- **Theme tokens are computed at runtime** by `applyThemeCssVars()` on `<html>`; they are not
  statically available, so the webview cannot hardcode them.

---

## Components

### 1. Build step — webview bundle (`scripts/build-plugins.mjs`)

After building a plugin's node entry, if `<root>/src/webview/index.tsx` exists, also build it:

```
esbuild { entryPoints: [src/webview/index.tsx], outfile: out/webview.js,
          bundle: true, platform: 'browser', format: 'iife', target: 'es2020',
          jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
          loader: { '.tsx':'tsx', '.ts':'ts' } }
```

React/react-dom (18.3.1, already deps) are bundled in. `manifold` is **not** external here —
the webview never imports `manifold` (it talks via postMessage), so no externals needed.
`out/` stays gitignored (artifact).

### 2. Generic theme injection (`src/renderer/components/editor/PluginViewPanel.tsx`)

A small, additive change that benefits every plugin webview. On iframe load and whenever the
app theme changes, read the live values of a fixed token list from
`getComputedStyle(document.documentElement)` and post them to the iframe:

```
{ type: '__manifold_theme', vars: { '--bg-primary': '#…', '--text-muted': '…', … } }
```

The token list is the set plugin webviews may use (the loop set + common tokens). The webview
applies them via `document.documentElement.style.setProperty(name, value)`. Theme changes are
detected via the dock theme (`useDockState().theme`) driving a re-post effect. Existing
webviews that ignore the message are unaffected.

### 3. Message protocol (`resources/plugins/manifold.loop/src/webview/protocol.ts`)

Typed messages, shared by the plugin side and the webview side (the webview imports types
only; bundling drops them). B2a defines the full set so B2b just fills in handlers:

```ts
// host → webview
type HostMsg =
  | { type: 'init'; sessionId: string | null; status: LoopStatus | null; iterations: LoopIteration[]; config: LoopConfig | null }
  | { type: 'status'; status: LoopStatus }
  | { type: 'iteration'; iteration: LoopIteration }
  | { type: 'aiResult'; ok: boolean; text?: string; error?: string }      // B2b
  | { type: 'actionError'; message: string }
// webview → host
type WebviewMsg =
  | { type: 'ready' }
  | { type: 'start'; config: LoopConfig }                                  // B2b
  | { type: 'stop' }                                                       // B2b
  | { type: 'saveConfig'; config: LoopConfig }                            // B2b
  | { type: 'restoreBest' }                                                // B2b
  | { type: 'clearRequest' }                                               // B2b
  | { type: 'improveWithAi'; draft: string; evalCommand: string; targetGlobs: string }  // B2b
```

B2a only exercises `ready` → `init`, plus live `status`/`iteration`.

### 4. Plugin webview provider (`resources/plugins/manifold.loop/src/webview-host.ts` + `plugin.ts`)

`createWebviewHost(engine, readBundle, getActiveSessionId)` returns a `WebviewViewProvider`:

- `resolveWebviewView(view)`: set `view.webview.html` to a document containing a `<div
  id="root">`, a `<style>` resetting body margins, and an inlined `<script>` with the bundle
  (read once from `out/webview.js` via `node:fs` + `context.pluginUri`). Subscribe to
  `engine.emit` (wired in B1 as a no-op default — B2a passes a real emit that calls
  `view.webview.postMessage({type:'status'|'iteration', …})`).
- `onDidReceiveMessage`: on `ready`, reply with `init` (current sessionId + engine
  `getStatus`/`getIterations`/`getConfig`). B2b adds the action handlers.

`plugin.ts` constructs the engine with `emit` bridged to the active view, registers the
provider, and the manifest gains the view contribution:

```jsonc
"contributes": {
  "views": [{ "id": "manifold.loop.panel", "title": "Loop (plugin)", "description": "Autoresearch loop (plugin).", "launcher": true }],
  "commands": [ /* unchanged from B1 */ ]
}
```
(Add `"onView:manifold.loop.panel"` to `activationEvents` if such an event exists; otherwise
keep `onCommand:*` — opening the view activates the plugin via `resolveView`.)

### 5. Minimal webview (`resources/plugins/manifold.loop/src/webview/index.tsx`)

A small React app proving the pipeline: applies `__manifold_theme` vars; posts `ready`;
renders the loop **state + current iteration + best score** from `init`/`status`/`iteration`
messages, themed with a couple of CSS vars (e.g. `var(--text-primary)`, `var(--bg-primary)`,
`var(--status-running)`). No controls (that's B2b). Shows "Select a session…" when
`sessionId` is null.

---

## Data flow (B2a)

```
open "Loop (plugin)" → PluginViewPanel mounts iframe (manifold-webview://view/manifold.loop.panel)
  → plugins:open-view → plugin resolveWebviewView → webview.html set (bundle inlined)
iframe load → PluginViewPanel posts __manifold_theme vars → webview applies to :root
webview mounts → posts {ready} → plugin replies {init ...snapshot}
engine runs (via a B1 command) → engine.emit('status'/'iteration')
  → view.webview.postMessage → webview updates live
```

---

## Testing strategy

- `protocol.ts` — type-only; covered by `typecheck:plugins`.
- `webview-host.ts` — unit test with a fake engine + a fake `WebviewView` (records
  `postMessage`, lets the test fire `onDidReceiveMessage`): `ready` yields an `init` with the
  engine snapshot; an `emit('status', …)` forwards a `status` message to the webview.
- Build: `npm run build:plugins` emits `out/webview.js` for the plugin.
- The React rendering + CSP + real theming are verified by **manual dev smoke** (owed): open
  the panel, run a loop via a command, watch state update; toggle theme and see colors follow.

---

## Verification gates

- New unit tests green; full suite green.
- `typecheck:node`/`:web` no new errors vs baseline (16/36); `typecheck:plugins` clean.
- `npm run build:plugins` emits both `out/plugin.js` and `out/webview.js` for `manifold.loop`.
- Built-in loop untouched (empty diff under `src/main/loop`, `src/renderer/components/loop`,
  `loop-handlers.ts`). (`PluginViewPanel.tsx` is plugin infra, not loop — it may change.)
- All touched files < 300 LOC.

---

## Out of scope (B2a)

- The interactive UI: config form, iteration list, start/stop/clear/restore controls,
  "Improve with AI", Clear-confirm → **B2b**.
- Removing the built-in loop panel / flipping the contribution → **Phase C**.
- Per-plugin theme opt-in/agnostic styling beyond injecting the standard token list.

---

## Self-review notes

- **Placeholders:** none — each component names its file and responsibility; B2b-only message
  variants are marked but defined now so the protocol is stable.
- **Consistency:** reuses the existing duplex bridge and `injectNonce`/CSP unchanged; the only
  core change is additive theme injection in `PluginViewPanel`; manifest view id
  `manifold.loop.panel` matches the provider registration and the webview.
- **Scope:** plumbing + minimal webview; full UI deferred to B2b. The minimal webview is a
  technical milestone (de-risks bundle/CSP/theming/messaging) rather than a user feature.
- **Ambiguity resolved:** theming = host-injected live vars (not static); webview never imports
  `manifold` (postMessage only); distinct view title avoids confusion with the built-in panel.
