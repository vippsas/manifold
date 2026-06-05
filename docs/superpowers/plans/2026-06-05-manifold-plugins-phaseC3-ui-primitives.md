# Phase C3 — Interactive UI primitives (message/toast, QuickPick, InputBox)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give plugins `window.showInformationMessage/showWarningMessage/showErrorMessage` (toasts, optional action buttons → returns the clicked label), `window.showQuickPick` (filterable picker → returns the chosen item), and `window.showInputBox` (text prompt → returns the string) — on BOTH the native `manifold` API and the `vscode` shim, sharing one renderer UI. This supersedes the fire-and-forget `HOST_MESSAGES`/`plugins:notification` path (nothing consumes it yet) with a real, value-returning UI.

**Architecture (the new mechanism — a request→response round-trip):** these calls must *return a value to the host*. Host calls `window.showQuickPick(...)` → host-side proxy calls the main `HOST_UI` service over RPC → main's handler mints a `requestId`, stores a pending resolver in a **UiRequestBroker**, sends `plugins:ui-request {requestId, kind, …}` to the renderer, and returns a Promise. The renderer's `PluginUiHost` shows the toast/modal; on the user's choice it `invoke('plugins:ui-response', requestId, value)`; main's IPC handler resolves the broker's pending promise → the `HOST_UI` RPC reply carries the value back → the host's `await` resolves. RpcEndpoint already `await`s service-method return values, so a `HOST_UI` method that returns a Promise "just works".

**Tech Stack:** existing `RpcEndpoint` + IPC + preload; React modals via the existing `dialogPrimitives`/`createDialogStyles`; clone `TitleBarSearch`'s filter+keyboard-nav for QuickPick; `useAutoFocus`; Vitest.

**Scope (C3):** messages (info/warn/error, optional buttons, returns chosen label or undefined), single-select QuickPick (filter + keyboard nav + Esc), InputBox (prompt/placeholder/value/password). **Out of scope:** multi-select QuickPick (`canPickMany`), QuickPick item icons/buttons, validation callbacks on InputBox (basic only), progress/status bar (C4).

---

## Context (verified file:line from recon)

- **Modal base:** `src/renderer/components/workbench-style-primitives.ts` → `dialogPrimitives` (overlay zIndex 1000, panelBase, header/footer/body/buttons) + `createDialogStyles(width)`. `ConfirmDialog.tsx`/`AboutOverlay.tsx` are the pattern (overlay+panel, backdrop click, `e.stopPropagation`, AboutOverlay has Esc-to-close).
- **QuickPick clone source:** `src/renderer/components/TitleBarSearch.tsx:31-145` — `activeIndex` keyboard nav (Arrow/Enter/Esc), filter, highlight. NOT reusable as-is; clone the nav+filter into a generic modal.
- **Toast examples:** `src/shared/UpdateToast.tsx` (fixed bottom-right, zIndex 10000). No queue/manager — build a small one.
- **App-root mount:** `src/renderer/AppShell.tsx:124-250` renders modals inline (no portal). Add `<PluginUiHost …/>` there; state lives in a new `usePluginUiHost` hook (or `useAppOverlays`).
- **Focus:** `src/renderer/hooks/useAutoFocus.ts`. No focus-trap/esc hook — handle inline per modal (AboutOverlay pattern).
- **No `plugins:notification` consumer** in the renderer; supersede it.
- **RPC/IPC pattern:** `rpc.ts` constants · `extension-host.ts` `ensure()` services + `this.send` · `plugin-handlers.ts` ipcMain · `preload/index.ts` whitelists · `plugin-host/index.ts`/`window-api.ts` host. `HOST_MESSAGES` ($showMessage fire-and-forget) currently exists (extension-host.ts) and is wired from the vscode shim — this plan replaces it.

**Verification gate:** runtime tests green; typecheck node ≤16 / web ≤37 / plugins 0, none new in touched files. The actual toast/modal UX is Electron-only → dev smoke.

---

## Task C3-T1: Shared UI types + RPC constant

**Files:** `src/shared/plugins/ui.ts` (new) + test; `src/shared/plugins/rpc.ts` (HOST_UI); `src/shared/plugins/api-types.ts` (window methods).

- [ ] **Step 1: Wire types + a normalizer test**

Create `src/shared/plugins/ui.ts`:

```typescript
// src/shared/plugins/ui.ts — shared shapes for plugin UI primitives (messages, quick pick, input box).
export type MessageLevel = 'info' | 'warning' | 'error'

export interface QuickPickItem { label: string; description?: string; detail?: string }
export interface QuickPickOptions { placeholder?: string; title?: string }
export interface InputBoxOptions { prompt?: string; placeholder?: string; value?: string; password?: boolean; title?: string }

/** Discriminated request the main process sends to the renderer's PluginUiHost. */
export type UiRequest =
  | { requestId: string; kind: 'message'; level: MessageLevel; message: string; actions: string[] }
  | { requestId: string; kind: 'quickPick'; items: QuickPickItem[]; options: QuickPickOptions }
  | { requestId: string; kind: 'inputBox'; options: InputBoxOptions }

/** Normalize showQuickPick input (vscode accepts string[] or QuickPickItem[]) into QuickPickItem[]. */
export function normalizeQuickPickItems(items: ReadonlyArray<string | QuickPickItem>): QuickPickItem[] {
  return items.map((it) => (typeof it === 'string' ? { label: it } : it))
}
```

Create `src/shared/plugins/ui.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { normalizeQuickPickItems } from './ui'

describe('normalizeQuickPickItems', () => {
  it('wraps strings and passes items through', () => {
    expect(normalizeQuickPickItems(['a', { label: 'b', description: 'd' }])).toEqual([{ label: 'a' }, { label: 'b', description: 'd' }])
  })
})
```

- [ ] **Step 2:** run → fail → implement → `npx vitest run src/shared/plugins/ui.test.ts` PASS.

- [ ] **Step 3: RPC constant** — in `rpc.ts` add `export const HOST_UI = 'HostUi'  // main, called by host (interactive UI, returns a value)`.

- [ ] **Step 4: window API types** — in `api-types.ts`, extend `ManifoldApi['window']`:
```typescript
  showInformationMessage(message: string, ...actions: string[]): Promise<string | undefined>
  showWarningMessage(message: string, ...actions: string[]): Promise<string | undefined>
  showErrorMessage(message: string, ...actions: string[]): Promise<string | undefined>
  showQuickPick(items: ReadonlyArray<string | QuickPickItem>, options?: QuickPickOptions): Promise<QuickPickItem | string | undefined>
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>
```
Import `QuickPickItem`, `QuickPickOptions`, `InputBoxOptions` from `./ui`. (Keep these methods OPTIONAL `?` if making them required breaks existing `window` producers — but window-api implements them in C3-T3, so prefer required only if clean; otherwise optional.)

- [ ] **Step 5:** typecheck node/web at baseline; commit `feat(plugins): shared UI primitive types + HOST_UI`.

---

## Task C3-T2: Main UI request broker + IPC

**Files:** `src/main/plugins/ui-broker.ts` (new) + test; `src/main/plugins/extension-host.ts` (HOST_UI service + expose broker resolve); `src/main/plugins/plugin-manager.ts` (resolveUiResponse passthrough); `src/main/ipc/plugin-handlers.ts` (`plugins:ui-response`); `src/preload/index.ts` (channels).

- [ ] **Step 1: Broker + failing test**

Create `src/main/plugins/ui-broker.ts`:

```typescript
// src/main/plugins/ui-broker.ts
import type { UiRequest } from '../../shared/plugins/ui'

/** Bridges a host UI request to the renderer and awaits the user's response (by requestId). */
export class UiRequestBroker {
  private seq = 0
  private readonly pending = new Map<string, (value: unknown) => void>()
  constructor(private readonly send: () => ((channel: string, ...args: unknown[]) => void) | null) {}

  /** Send a UI request to the renderer; resolves with the renderer's response value (or undefined if no window). */
  request(req: Omit<UiRequest, 'requestId'>): Promise<unknown> {
    const send = this.send()
    if (!send) return Promise.resolve(undefined)
    const requestId = `ui${++this.seq}`
    return new Promise<unknown>((resolve) => {
      this.pending.set(requestId, resolve)
      send('plugins:ui-request', { ...req, requestId } as UiRequest)
    })
  }

  /** Called from the renderer IPC response; resolves the matching pending request. */
  resolve(requestId: string, value: unknown): void {
    const r = this.pending.get(requestId)
    if (!r) return
    this.pending.delete(requestId)
    r(value)
  }

  /** Reject all pending (e.g. window closed) — resolve them to undefined. */
  flush(): void { for (const r of this.pending.values()) r(undefined); this.pending.clear() }
}
```

Create `src/main/plugins/ui-broker.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { UiRequestBroker } from './ui-broker'

describe('UiRequestBroker', () => {
  it('sends a ui-request and resolves when the matching response arrives', async () => {
    const sent: unknown[] = []
    const broker = new UiRequestBroker(() => (ch, ...a) => { if (ch === 'plugins:ui-request') sent.push(a[0]) })
    const p = broker.request({ kind: 'inputBox', options: { prompt: 'name?' } })
    const req = sent[0] as { requestId: string; kind: string }
    expect(req.kind).toBe('inputBox')
    broker.resolve(req.requestId, 'Daisy')
    expect(await p).toBe('Daisy')
  })
  it('resolves undefined when no window is available', async () => {
    const broker = new UiRequestBroker(() => null)
    expect(await broker.request({ kind: 'message', level: 'info', message: 'hi', actions: [] })).toBeUndefined()
  })
  it('ignores unknown requestIds', () => {
    const broker = new UiRequestBroker(() => () => {})
    expect(() => broker.resolve('nope', 'x')).not.toThrow()
  })
})
```

Run → fail → implement → `npx vitest run src/main/plugins/ui-broker.test.ts` PASS.

- [ ] **Step 2: HOST_UI service in ExtensionHost** — in `extension-host.ts`: construct `private readonly ui = new UiRequestBroker(() => this.send)`. Register HOST_UI in `ensure()`:
```typescript
endpoint.registerService(HOST_UI, {
  $showMessage: (level: MessageLevel, message: string, actions: string[]) => this.ui.request({ kind: 'message', level, message, actions }),
  $showQuickPick: (items, options) => this.ui.request({ kind: 'quickPick', items, options }),
  $showInputBox: (options) => this.ui.request({ kind: 'inputBox', options }),
})
```
Add a public `resolveUi(requestId: string, value: unknown): void { this.ui.resolve(requestId, value) }`. **Remove the old `HOST_MESSAGES` service registration** (superseded). Call `this.ui.flush()` in `dispose()`.

- [ ] **Step 3: plugin-manager passthrough** — `resolveUiResponse(requestId, value) { this.host.resolveUi(requestId, value) }`.

- [ ] **Step 4: IPC** — in `plugin-handlers.ts`: `ipcMain.handle('plugins:ui-response', (_e, requestId: string, value: unknown) => { deps.pluginManager.resolveUiResponse(requestId, value); return true })`.

- [ ] **Step 5: preload** — add `'plugins:ui-response'` to `ALLOWED_INVOKE_CHANNELS`; add `'plugins:ui-request'` to `ALLOWED_LISTEN_CHANNELS`. Remove `'plugins:notification'` from listen channels (superseded) — or leave it; if any test references it, prefer removing the now-dead channel and its `HOST_MESSAGES` test (`extension-host-messages.test.ts`).

- [ ] **Step 6:** `npx vitest run src/main/plugins` green (delete/replace `extension-host-messages.test.ts` since HOST_MESSAGES is gone); typecheck node ≤16. Commit `feat(plugins): main UI request broker + HOST_UI + ui-response IPC`.

---

## Task C3-T3: Host API — native window methods + vscode-shim wiring

**Files:** `src/plugin-host/window-api.ts` (native methods over HOST_UI), `src/plugin-host/index.ts` (pass the HOST_UI proxy), `src/plugin-host/vscode-shim/window.ts` (replace notImplemented + the old HOST_MESSAGES showMessage with HOST_UI delegation), `src/plugin-host/vscode-shim/index.ts` + `index.test.ts`.

- [ ] **Step 1: native window methods** — in `window-api.ts`, build a HOST_UI proxy (`endpoint.getProxy<{ $showMessage; $showQuickPick; $showInputBox }>(HOST_UI)`) and add to `windowApi`:
```typescript
showInformationMessage: (message: string, ...actions: string[]) => hostUi.$showMessage('info', message, actions),
showWarningMessage: (message: string, ...actions: string[]) => hostUi.$showMessage('warning', message, actions),
showErrorMessage: (message: string, ...actions: string[]) => hostUi.$showMessage('error', message, actions),
showQuickPick: (items, options = {}) => hostUi.$showQuickPick(normalizeQuickPickItems(items), options),
showInputBox: (options = {}) => hostUi.$showInputBox(options),
```
(Import `normalizeQuickPickItems` from shared/plugins/ui. The endpoint is already available in `createWindowApi(endpoint)`.)

- [ ] **Step 2: vscode-shim** — in `vscode-shim/window.ts`, the `show{Information,Warning,Error}Message` currently call the messages proxy ($showMessage fire-and-forget). Change them to delegate to the real `windowApi.show*Message` (which now returns the chosen action). Replace `showQuickPick`/`showInputBox` `notImplemented` stubs with delegation to `windowApi.showQuickPick`/`showInputBox`. Widen `RealWindowApi` (in window.ts) to include the 5 methods. Drop the `messagesProxy`/`HostMessagesProxy` param from `createShimWindow` (no longer used — show*Message now go through windowApi); update `createVscodeShim` deps (`VscodeShimDeps`) to remove `messagesProxy`, and remove the `messagesProxy` build in `plugin-host/index.ts`. Update `index.test.ts` accordingly (the `deps()` windowApi stub gains the 5 methods; remove messagesProxy; assert show*Message + showQuickPick delegate to windowApi).

- [ ] **Step 3:** `npx vitest run src/plugin-host` green; typecheck node ≤16. If C3-T1 left the window methods optional, you may make them required now (window-api implements them). Commit `feat(plugins): native + vscode-shim show*Message/showQuickPick/showInputBox over HOST_UI`.

---

## Task C3-T4: Renderer — PluginUiHost (toast + QuickPick + InputBox)

**Files:** `src/renderer/components/plugin-ui/PluginUiHost.tsx` (+ `Toast.tsx`, `QuickPickModal.tsx`, `InputBoxModal.tsx`), `src/renderer/hooks/usePluginUiHost.ts`, mount in `src/renderer/AppShell.tsx`. Test: `src/renderer/components/plugin-ui/plugin-ui-host.test.tsx`.

- [ ] **Step 1: the hook** — `usePluginUiHost()` subscribes to `plugins:ui-request`; maintains a toast queue + a single active modal (quickPick|inputBox). It exposes the state + responders that call `invoke('plugins:ui-response', requestId, value)` and clear the state. Messages with no actions auto-dismiss after ~4s (resolving undefined); with actions, the toast shows buttons and resolves the clicked label (or undefined on dismiss). Only one quickPick/inputBox modal at a time (queue if needed, or replace — queue is safer).

- [ ] **Step 2: components** —
  - `Toast.tsx`: info/warn/error styled, optional action buttons, close (×); reuse the `UpdateToast` fixed-position style; container stacks multiple toasts (bottom-right).
  - `QuickPickModal.tsx`: reuse `createDialogStyles`; a filter `<input>` (autofocus via `useAutoFocus`) + a list of items (label + dim description/detail); keyboard: ArrowUp/Down move `activeIndex`, Enter selects, Esc cancels (clone `TitleBarSearch` nav); click selects; backdrop click cancels. Resolves the chosen `QuickPickItem` (or undefined).
  - `InputBoxModal.tsx`: reuse `createDialogStyles` + `ConfirmDialog` shape; a labeled `<input>` (prompt as label, placeholder, initial value, `type=password` when `options.password`), OK/Cancel, Enter submits, Esc cancels. Resolves the string (or undefined).
  - `PluginUiHost.tsx`: renders the toast container + (active modal ? the QuickPick/InputBox modal). Driven entirely by `usePluginUiHost`.

- [ ] **Step 3: mount** — render `<PluginUiHost />` in `AppShell.tsx` alongside the other modals (it self-subscribes; no props needed). Confirm z-index: toasts above modals; the quickpick/inputbox modal at dialog zIndex.

- [ ] **Step 4: test** — `plugin-ui-host.test.tsx` (jsdom, @testing-library/react): simulate a `plugins:ui-request` of kind `inputBox` (by invoking the `on('plugins:ui-request', …)` handler with a fake request), type a value, submit, and assert `invoke('plugins:ui-response', requestId, 'value')` was called. Add a quickPick case: render items, filter, Enter, assert the response is the chosen item. Add a message-with-actions case: click an action, assert the response is the label. Mock `window.electronAPI.on/invoke` (follow existing renderer test patterns for mocking electronAPI).

- [ ] **Step 5:** `npx vitest run src/renderer` green; typecheck web ≤37. Commit `feat(plugins): renderer PluginUiHost — toast + QuickPick + InputBox over ui-request/response`.

---

## Task C3-T5: Sample + dev smoke

**Files:** extend `resources/plugins/hello/src/plugin.ts` (a command that exercises the three primitives); build + dev smoke; followups note.

- [ ] **Step 1:** Add to the `hello` plugin a command (e.g. `manifold.hello.demoUi`) that: `const name = await manifold.window.showInputBox({ prompt: 'Your name?' })`; `const pick = await manifold.window.showQuickPick(['Red','Green','Blue'], { placeholder: 'Pick a color' })`; `const action = await manifold.window.showInformationMessage(\`Hi \${name}, you picked \${pick}\`, 'Cool', 'Meh')`. (Wire it to the existing hello webview's button or a tree node, or just register the command and trigger via `plugins:execute-command` in the smoke.) Keep the existing hello behavior intact.

- [ ] **Step 2:** `npm run build`; `npm run dev`; trigger the command; confirm: input box prompts + returns the typed value; quick pick shows the 3 colors, filter + arrow + Enter works; an info toast appears with two buttons and resolves the clicked one. Record in the followups doc.

- [ ] **Step 3:** commit the sample + followups note. Note remaining: **C4** StatusBar/withProgress/OutputChannel; multi-select QuickPick + InputBox validation (C3b).

---

## Self-Review

**Spec coverage:** shared types + HOST_UI (T1); the request→response broker + IPC, superseding HOST_MESSAGES (T2); native window methods + vscode-shim delegation (T3); the renderer toast/quickpick/inputbox UI (T4); sample + smoke (T5).

**The round-trip is the crux:** host `await window.showQuickPick()` → HOST_UI RPC (main `await`s the broker promise) → `plugins:ui-request` → renderer modal → `plugins:ui-response` → broker resolves → RPC reply → host resolves. RpcEndpoint already awaits service returns, so this composes. Broker `flush()` on dispose prevents hung promises if the window dies.

**Risks/notes:** (a) superseding HOST_MESSAGES means deleting `extension-host-messages.test.ts` + the `messagesProxy` plumbing — do it cleanly in T2/T3. (b) One active quickpick/inputbox modal at a time — queue concurrent requests. (c) Message auto-dismiss (no actions) resolves undefined; with actions, resolves the label or undefined on close. (d) Multi-select / InputBox validation deferred (C3b). (e) These are first-party; no rate-limiting/abuse concern yet (matters once untrusted plugins run).

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-05-manifold-plugins-phaseC3-ui-primitives.md`.**
