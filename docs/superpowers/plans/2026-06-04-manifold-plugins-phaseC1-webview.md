# Phase C1 — Plugin Webviews via a Privileged Scheme + Nonce CSP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Serve plugin webview HTML from a dedicated `manifold-webview://` privileged origin with a **per-serve nonce CSP**, so plugin panel scripts actually run — fixing the live bug where the Hello panel's inline `<script>` is blocked by the app's `script-src 'self'` (a `srcdoc` iframe inherits the parent page CSP). This is the secure content substrate Phase C builds on.

**Architecture:** Today `PluginViewPanel` renders plugin HTML via `<iframe sandbox="allow-scripts" srcDoc={html}>`. Because `about:srcdoc` inherits the embedder's CSP (`script-src 'self'`), inline plugin scripts are blocked. We instead (1) register a privileged scheme `manifold-webview` in main; (2) keep the current per-view HTML in a main-side `WebviewContentStore`; (3) serve it from a `protocol.handle` that generates a fresh nonce per serve, injects it into the HTML's `<script>` tags, and returns a restrictive `Content-Security-Policy` response header (`default-src 'none'; script-src 'nonce-…'; style-src 'unsafe-inline'; img-src data: https:`); (4) point the iframe at `manifold-webview://view/<id>?v=<version>` instead of `srcDoc`. The iframe then has its **own** origin + CSP (decoupled from the app), the nonce'd script runs, and the existing cross-origin `postMessage` bridge is unchanged. Because the iframe is still `sandbox="allow-scripts"` (opaque origin, no `allow-same-origin`) and the CSP is nonce-gated, this is safe for first-party plugins and is the correct foundation before untrusted ones.

**Tech Stack:** Electron 39 `protocol.registerSchemesAsPrivileged` (pre-ready) + `session.defaultSession.protocol.handle` (post-ready, returns a web `Response`); the existing `RpcEndpoint`/IPC; React (`PluginViewPanel`); Vitest.

**Scope (C1):** the webview **content pipeline** + fixing the existing `registerWebviewViewProvider` path (used by `hello`) + wiring the vscode-shim `window.registerWebviewViewProvider` to the real host impl. **Out of scope (later):** `vscode.window.createWebviewPanel` opening a *new* dock panel programmatically (needs a host→renderer open-panel channel — C1b); vscode view *containers* / surfacing vscode-contributed views in the UI (C2); trees/quickpick/etc.

---

## Context (verified file:line coordinates)

- `src/renderer/components/editor/PluginViewPanel.tsx` — iframe at lines ~32–38 uses `sandbox="allow-scripts" srcDoc={html}`; subscribes `plugins:webview-html`(viewId,html)→`setHtml`, `plugins:webview-message`(viewId,msg)→`iframe.postMessage(msg,'*')`; on mount `invoke('plugins:open-view', viewId)`; `window.addEventListener('message')` guards `e.source === iframe.contentWindow` → `invoke('plugins:webview-to-host', viewId, e.data)`.
- `src/main/plugins/extension-host.ts` — `HOST_WINDOW` service `$setHtml(viewId, html) → this.send('plugins:webview-html', viewId, html)` and `$postToWebview(viewId,msg) → this.send('plugins:webview-message', viewId, msg)` (in `ensure()`, ~lines 44–47). `setSend(fn)` wires the renderer send.
- `src/main/app/window-factory.ts` — `new BrowserWindow` (~58–74): `contextIsolation:true, sandbox:false, nodeIntegration:false, webviewTag:true, preload`. Renderer loaded via `loadRenderer` (~147–151): dev `ELECTRON_RENDERER_URL` (http), prod `file://`. **No custom protocol or `registerSchemesAsPrivileged` exists yet.** Find where `app.whenReady()`/bootstrap runs (likely `src/main/app/index.ts` or `src/main/index.ts`) — the scheme must be registered BEFORE ready.
- `src/renderer/index.html` — CSP meta (line 8): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file: blob:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com`.
- `src/preload/index.ts` — `ALLOWED_LISTEN_CHANNELS` (~150–184) has `plugins:webview-html`, `plugins:webview-message`; `ALLOWED_INVOKE_CHANNELS` has `plugins:open-view`, `plugins:webview-to-host`.
- `src/plugin-host/window-api.ts` — `createWindowApi(endpoint)`: `registerWebviewViewProvider` stores providers; `resolveView` builds the `WebviewView` (`webview.html` setter → `$setHtml`, `postMessage` → `$postToWebview`, `onDidReceiveMessage`), `deliverMessage` invokes listeners.
- `src/plugin-host/vscode-shim/window.ts` — `registerWebviewViewProvider` + `createWebviewPanel` are `notImplemented(...)` stubs.

**Verification gate:** runtime tests green; `typecheck:node` ≤16 / `typecheck:web` ≤37 baseline, no new errors in touched files. The script-execution fix itself is Electron-only → dev smoke.

---

## Task C1-T1: `manifold-webview` scheme + content store + nonce-CSP handler (main)

**Files:**
- Create: `src/main/plugins/webview-content-store.ts`
- Create: `src/main/plugins/webview-protocol.ts`
- Test: `src/main/plugins/webview-protocol.test.ts`
- Modify: the main bootstrap (where `app.whenReady()` is) to register the scheme (pre-ready) + handler (post-ready).

- [ ] **Step 1: Failing test for the content store + nonce injection (pure logic)**

Create `src/main/plugins/webview-protocol.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { WebviewContentStore } from './webview-content-store'
import { injectNonce, buildCsp } from './webview-protocol'

describe('WebviewContentStore', () => {
  it('stores html per view and bumps version on each set', () => {
    const s = new WebviewContentStore()
    const v1 = s.set('view.a', '<h1>1</h1>')
    const v2 = s.set('view.a', '<h1>2</h1>')
    expect(v2).toBeGreaterThan(v1)
    expect(s.get('view.a')).toBe('<h1>2</h1>')
    expect(s.get('missing')).toBeUndefined()
  })
})

describe('injectNonce', () => {
  it('adds the nonce to every <script> tag (opening tags only)', () => {
    const out = injectNonce('<script>a()</script><script type="module">b()</script>', 'N0NCE')
    expect(out).toBe('<script nonce="N0NCE">a()</script><script type="module" nonce="N0NCE">b()</script>')
  })
  it('does not touch non-script tags', () => {
    expect(injectNonce('<div>x</div>', 'N')).toBe('<div>x</div>')
  })
})

describe('buildCsp', () => {
  it('is nonce-gated and locked down by default', () => {
    const csp = buildCsp('N0NCE')
    expect(csp).toContain("script-src 'nonce-N0NCE'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).not.toContain("'unsafe-inline'") // ...except style-src; assert script has no unsafe-inline
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/)
  })
})
```

- [ ] **Step 2: Run → fail**

`npx vitest run src/main/plugins/webview-protocol.test.ts` — FAIL (modules missing).

- [ ] **Step 3: Implement the content store**

Create `src/main/plugins/webview-content-store.ts`:

```typescript
// src/main/plugins/webview-content-store.ts
/** Holds the current HTML for each plugin webview, keyed by view id.
 *  Written by the extension host ($setHtml); read by the manifold-webview protocol handler. */
export class WebviewContentStore {
  private readonly html = new Map<string, string>()
  private version = 0

  /** Store HTML for a view; returns a monotonically increasing version (cache-buster). */
  set(viewId: string, html: string): number {
    this.html.set(viewId, html)
    return ++this.version
  }

  get(viewId: string): string | undefined {
    return this.html.get(viewId)
  }

  delete(viewId: string): void {
    this.html.delete(viewId)
  }
}

/** Process-wide singleton shared by the extension host and the protocol handler. */
export const webviewContentStore = new WebviewContentStore()
```

- [ ] **Step 4: Implement the protocol (scheme privilege + handler + helpers)**

Create `src/main/plugins/webview-protocol.ts`:

```typescript
// src/main/plugins/webview-protocol.ts
import { protocol, session } from 'electron'
import { randomBytes } from 'node:crypto'
import { webviewContentStore, type WebviewContentStore } from './webview-content-store'

export const WEBVIEW_SCHEME = 'manifold-webview'

/** Add a nonce attribute to every opening <script ...> tag (first-party HTML rewrite). */
export function injectNonce(html: string, nonce: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (_m, attrs: string) => `<script${attrs} nonce="${nonce}">`)
}

/** Restrictive, nonce-gated CSP for plugin webview content. No external scripts; inline only via nonce. */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src data: blob: https:",
    "font-src data:",
    "connect-src 'none'",
  ].join('; ')
}

function nonce(): string {
  return randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '')
}

/** MUST be called BEFORE app.whenReady(). */
export function registerWebviewSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: WEBVIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
  ])
}

/** MUST be called AFTER app.whenReady(). Serves manifold-webview://view/<id> from the store with a fresh nonce CSP. */
export function installWebviewProtocol(store: WebviewContentStore = webviewContentStore): void {
  session.defaultSession.protocol.handle(WEBVIEW_SCHEME, (request) => {
    // URL shape: manifold-webview://view/<viewId>?v=<version>
    const url = new URL(request.url)
    const viewId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const html = store.get(viewId)
    if (html === undefined) {
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    }
    const n = nonce()
    const body = injectNonce(html, n)
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': buildCsp(n),
      },
    })
  })
}
```

Note: `request.url` host is `view` and path is `/<viewId>` (from `manifold-webview://view/<viewId>`). Parse defensively; if your Electron URL parsing puts the viewId in the host instead of the path, adjust `viewId` extraction accordingly and add a test for the exact `manifold-webview://view/<id>?v=1` shape.

- [ ] **Step 5: Register in the main bootstrap**

Find the main entry that calls `app.whenReady()` (search: `git grep -n "whenReady\|registerSchemesAsPrivileged" src/main`). Add:
- BEFORE ready (top of the module / before `app.whenReady()`): `import { registerWebviewSchemePrivileged } from './plugins/webview-protocol'` (adjust path) then `registerWebviewSchemePrivileged()`.
- AFTER ready (inside the `whenReady().then(...)` / bootstrap, near where the window/plugin-manager are set up): `installWebviewProtocol()`.

- [ ] **Step 6: Run tests + typecheck**

`npx vitest run src/main/plugins/webview-protocol.test.ts` → PASS.
`npm run typecheck:node` → ≤16, none in new files. (The `Response` global is available in Electron's main/Node 20+; if tsc complains about `Response`/`URL` types, ensure `lib`/`dom` types are present — `URL` is from node; `Response` is the global Fetch Response available in the Electron main + Node ≥18. If a type is missing, add a minimal local type rather than changing tsconfig libs, and note it.)

- [ ] **Step 7: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add src/main/plugins/webview-content-store.ts src/main/plugins/webview-protocol.ts src/main/plugins/webview-protocol.test.ts && \
git add -u && git commit -m "feat(plugins): manifold-webview privileged scheme + nonce-CSP content handler

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(`git add -u` stages the bootstrap file you edited — verify with `git status` it's only the intended main entry.)

---

## Task C1-T2: Route `$setHtml` through the store (main)

**Files:**
- Modify: `src/main/plugins/extension-host.ts`

- [ ] **Step 1: Store HTML + signal a version instead of sending full HTML**

In `extension-host.ts`, import the store and change the `HOST_WINDOW.$setHtml` handler. Current:
```typescript
$setHtml: (viewId: string, html: string) => { this.send?.('plugins:webview-html', viewId, html) },
```
Change to:
```typescript
$setHtml: (viewId: string, html: string) => {
  const version = webviewContentStore.set(viewId, html)
  this.send?.('plugins:webview-html', viewId, version)
},
```
Add `import { webviewContentStore } from './webview-content-store'` at the top. Leave `$postToWebview` unchanged (messages still flow via IPC).

- [ ] **Step 2: Typecheck + existing host tests**

`npm run typecheck:node` → ≤16. `npx vitest run src/main/plugins src/plugin-host` → green (the in-memory integration tests don't assert the `plugins:webview-html` payload shape; if any does, update it to expect a version number). 

- [ ] **Step 3: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add src/main/plugins/extension-host.ts && \
git commit -m "feat(plugins): store webview html in the content store; signal renderer with a version

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task C1-T3: Point `PluginViewPanel` at the scheme + CSP frame-src (renderer)

**Files:**
- Modify: `src/renderer/components/editor/PluginViewPanel.tsx`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Allow framing the scheme**

In `src/renderer/index.html` CSP meta, add `manifold-webview:` to `frame-src`:
```
frame-src 'self' manifold-webview: https://www.youtube.com https://www.youtube-nocookie.com
```

- [ ] **Step 2: Rework the panel to load from the scheme (with message buffering for async load)**

Read the current `PluginViewPanel.tsx`, then rework it so:
- The `plugins:webview-html` listener now receives `(viewId, version)` and sets a `version` state (number) instead of `html`.
- The iframe uses `src={`manifold-webview://view/${encodeURIComponent(viewId)}?v=${version}`}` (only when `version > 0`); keep `sandbox="allow-scripts"`.
- Because the iframe now loads asynchronously, **buffer** host→iframe messages (`plugins:webview-message`) received before the iframe's `onLoad`, then flush on load (the inline plugin script attaches its `message` listener during load). Track an `isLoadedRef`; queue messages in a ref array until loaded.
- Keep the iframe→host bridge (`window.addEventListener('message')` → guard `e.source === iframe.contentWindow` → `invoke('plugins:webview-to-host', viewId, e.data)`) unchanged.
- Keep the mount `invoke('plugins:open-view', viewId)`.

Reference implementation:

```tsx
import { useEffect, useRef, useState } from 'react'

export function PluginViewPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const viewId = api.id
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [version, setVersion] = useState(0)
  const loadedRef = useRef(false)
  const pendingRef = useRef<unknown[]>([])

  const post = (msg: unknown): void => {
    const w = iframeRef.current?.contentWindow
    if (loadedRef.current && w) w.postMessage(msg, '*')
    else pendingRef.current.push(msg)
  }

  useEffect(() => {
    const offHtml = window.electronAPI.on('plugins:webview-html', (id: string, v: number) => {
      if (id === viewId) { loadedRef.current = false; setVersion(v) }
    })
    const offMsg = window.electronAPI.on('plugins:webview-message', (id: string, msg: unknown) => {
      if (id === viewId) post(msg)
    })
    void window.electronAPI.invoke('plugins:open-view', viewId)
    return () => { offHtml?.(); offMsg?.() }
  }, [viewId])

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      if (e.source && e.source === iframeRef.current?.contentWindow) {
        void window.electronAPI.invoke('plugins:webview-to-host', viewId, e.data)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [viewId])

  const onLoad = (): void => {
    loadedRef.current = true
    const w = iframeRef.current?.contentWindow
    if (w) { for (const m of pendingRef.current) w.postMessage(m, '*'); pendingRef.current = [] }
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      src={version > 0 ? `manifold-webview://view/${encodeURIComponent(viewId)}?v=${version}` : 'about:blank'}
      onLoad={onLoad}
      style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
      title={viewId}
    />
  )
}
```
Match the current file's exact import style / prop typing / style object (read it first; preserve anything I omitted like referrerPolicy).

- [ ] **Step 3: Typecheck:web + renderer tests**

`npm run typecheck:web` → ≤37, none new in your file. `npx vitest run src/renderer` → green (if a PluginViewPanel test asserts `srcDoc`, update it to the new `src`/version behavior).

- [ ] **Step 4: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add src/renderer/components/editor/PluginViewPanel.tsx src/renderer/index.html && \
git commit -m "feat(plugins): load webview content from manifold-webview scheme (nonce CSP); buffer msgs until load

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task C1-T4: Wire the vscode-shim webview-view provider to the real impl

**Files:**
- Modify: `src/plugin-host/vscode-shim/index.ts` (and/or `window.ts`)
- Modify: `src/plugin-host/index.ts` (pass the real window api into the shim, if not already available)

- [ ] **Step 1: Replace the `registerWebviewViewProvider` stub with the real registration**

The real `registerWebviewViewProvider` lives in `window-api.ts`'s `windowApi` (already created in `plugin-host/index.ts` as `windowApi` and passed to `sharedNamespaces`). The vscode shim's `window` currently `notImplemented`s it. Make the shim's `window.registerWebviewViewProvider` delegate to the same `windowApi.registerWebviewViewProvider`. Concretely, `createVscodeShim` already receives nothing window-real today — extend `createShimWindow`/`createVscodeShim` to accept the real `windowApi` (the object with `registerWebviewViewProvider`) and use it for `registerWebviewViewProvider` (keep `createWebviewPanel` etc. as `notImplemented` for now — that's C1b).

In `src/plugin-host/index.ts`, the vscode loader calls `createVscodeShim({...})`. Add `windowApi` to its deps and thread it into `createShimWindow`. The shim `window` becomes:
```typescript
// in createShimWindow(host, windowApi):
registerWebviewViewProvider: (viewId: string, provider: unknown) => windowApi.registerWebviewViewProvider(viewId, provider as never),
// createWebviewPanel stays notImplemented('window.createWebviewPanel') — C1b
```
Update `VscodeShimDeps` and the call site + the unit test (`index.test.ts`) accordingly (add a `windowApi` stub with a `registerWebviewViewProvider: vi.fn()` and assert the shim delegates to it).

- [ ] **Step 2: Tests + typecheck**

`npx vitest run src/plugin-host/vscode-shim` → green. `npm run typecheck:node` → ≤16.

- [ ] **Step 3: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add src/plugin-host/vscode-shim/ src/plugin-host/index.ts && \
git commit -m "feat(plugins): vscode-shim window.registerWebviewViewProvider delegates to real host impl

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task C1-T5: Build + dev smoke (the Hello panel script must run)

**Files:** none (verification) + a followups note.

- [ ] **Step 1: Full gates**

`npx vitest run src/main/plugins src/plugin-host src/renderer src/shared/plugins scripts` → green.
`npm run typecheck:node` (≤16), `npm run typecheck:web` (≤37), `npm run typecheck:plugins` (0).
`npm run build` → success; `out/main/plugin-host.js` present.

- [ ] **Step 2: Dev smoke (Electron-only — record results)**

`npm run dev`, open **+ Apps → Hello (plugin)**. Confirm in the panel:
- The greeting + count render, AND the **+1 button increments** (proves the nonce'd inline `<script>` now runs — the bug is fixed).
- Active project shows and updates on project switch; greeting updates live when changed in Settings → Plugins (proves host→iframe messages flow with the new async-load buffering).
- DevTools console shows **no** `about:srcdoc … script-src` CSP error for the panel.
- `~/.manifold/debug.log` shows no host crash.

- [ ] **Step 3: Record results + close the CSP follow-up**

Append a "Phase C1 — webview nonce-CSP" result to `docs/superpowers/plans/2026-06-04-manifold-plugins-followups.md`, and note that the live `srcdoc`/`script-src` panel bug is fixed by the `manifold-webview://` scheme. Note remaining C-phase work: `createWebviewPanel` (C1b), TreeView (C2), QuickPick/InputBox (C3), StatusBar/withProgress (C4).

- [ ] **Step 4: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add docs/superpowers/plans/2026-06-04-manifold-plugins-followups.md && \
git commit -m "docs(plugins): record Phase C1 webview nonce-CSP result + remaining C-phase work

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** secure content origin + nonce CSP (T1); HTML→store→version flow (T2); iframe off srcDoc onto the scheme + async-load message buffering (T3); vscode-shim webview-view parity (T4); verify + fix-confirmation (T5). The live `script-src` bug is fixed by T1–T3.

**Security:** the scheme is `secure:true, standard:true, corsEnabled:false`; the handler emits `default-src 'none'; script-src 'nonce-…'` (fresh per serve) so only the first-party inline script runs and no external/injected scripts do; the iframe stays `sandbox="allow-scripts"` (opaque origin, no `allow-same-origin`) so it can't reach the app, cookies, or storage. This is the right posture for first-party now and the foundation for gating untrusted plugins later.

**Risks/notes:** (a) `request.url` parsing for the custom scheme — verify the `view/<id>` shape empirically and test it. (b) Async iframe load reorders messages vs the old synchronous `srcDoc`; T3's buffer-until-`onLoad` handles it (the plugin's listener attaches during load). (c) `Response`/`URL` globals in main — present on Electron 39/Node 20; add a local type only if tsc complains. (d) Cross-origin `postMessage('*')` + `e.source===contentWindow` works across the new origin (already uses `'*'`). (e) `createWebviewPanel` remains `notImplemented` (C1b) — clearly scoped out.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-04-manifold-plugins-phaseC1-webview.md`.**
