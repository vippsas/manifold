# Manifold Plugins — Phase 1c Plan (Webview Panels + `window` API)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Selecting a plugin view in "+ Apps" opens a dock panel that renders the plugin's own UI in a sandboxed iframe, and the plugin's `WebviewViewProvider` (in the host) exchanges `postMessage` with that UI.

**Design (decided):** Render `webview.html` via `<iframe sandbox="allow-scripts" srcdoc={html}>` — **not** `<webview>` (Manifold's `will-attach-webview` strips webview preloads + forces localhost; it does NOT apply to iframes). Messaging via `window.postMessage`. **No asset server / `asWebviewUri` / multi-file assets in the MVP** (deferred). Panels are keyed by **viewId only**; the main process resolves the owning plugin from the viewId (PluginManager has all descriptors), so there is **no dependency on dockview `params`**.

**Verification reality:** the host `window` API logic is unit-tested in-memory (extending the 1b integration test). The iframe rendering + real `utilityProcess` are Electron-only → `npm run build` + dev smoke (stated per task). Gates: `typecheck:node` ≤ 16, `typecheck:web` ≤ 38, no error names a new file; `npx vitest run`; inline eslint-disable for `any`.

## Data flow
```
"+ Apps" → onOpenPluginView(viewId,title) → dock addPanel({id:viewId, component:'pluginView'})
PluginViewPanel mount → invoke('plugins:open-view', viewId)
  main PluginManager.openView → find owner → ExtensionHost.resolveView(target, viewId)
  host PLUGIN_WEBVIEW.$resolveView → provider.resolveWebviewView(view)
    view.webview.html = '<...>'  → HOST_WINDOW.$setHtml → main send 'plugins:webview-html' → renderer <iframe srcdoc>
iframe → parent.postMessage → renderer 'message' → invoke('plugins:webview-to-host', viewId, data)
  → ExtensionHost.deliverWebviewMessage → host PLUGIN_WEBVIEW.$deliverMessage → provider onDidReceiveMessage
plugin → view.webview.postMessage → HOST_WINDOW.$postToWebview → main send 'plugins:webview-message' → renderer → iframe.contentWindow.postMessage
```

## File Structure
**Create:** `src/plugin-host/window-api.ts` (+ extend the 1b in-memory test), `src/renderer/components/editor/PluginViewPanel.tsx`.
**Modify:** `src/shared/plugins/rpc.ts` (+`HOST_WINDOW`,`PLUGIN_WEBVIEW`), `src/shared/plugins/api-types.ts` (+`window` on `ManifoldApi`), `src/plugin-host/index.ts` (compose window api + register `PLUGIN_WEBVIEW`), `src/main/plugins/extension-host.ts` (+`HOST_WINDOW` service, `resolveView`, `deliverWebviewMessage`, `setSend`), `src/main/plugins/plugin-manager.ts` (+`openView`, `deliverWebviewMessage`, `setMainWindow`), `src/main/ipc/plugin-handlers.ts` (+2 invoke channels), `src/preload/index.ts` (+invoke + listen channels), the `wireMainWindow` site (call `pluginManager.setMainWindow(win)`), `src/renderer/components/editor/dock-panels.tsx` (+`pluginView`), `src/renderer/hooks/useDockLayout.ts` (+`openPluginView`), `src/renderer/components/editor/dock-panel-types.ts` (`DockAppState.onOpenPluginView`), `src/renderer/App.tsx` (wire it), `src/renderer/components/editor/ModuleLauncher.tsx` (open plugin views), `resources/plugins/hello/out/plugin.js` (add provider).

---

### Task 1 (G1): Host `window` API + PLUGIN_WEBVIEW + RPC constants + types

- [ ] **Step 1:** In `src/shared/plugins/rpc.ts` add two constants near the others:
```ts
export const HOST_WINDOW = 'HostWindow'        // main, called by host
export const PLUGIN_WEBVIEW = 'PluginWebview'  // host, called by main
```
- [ ] **Step 2:** In `src/shared/plugins/api-types.ts` add the window surface to `ManifoldApi`:
```ts
export interface WebviewView {
  webview: {
    html: string
    postMessage(message: unknown): void
    onDidReceiveMessage(listener: (message: unknown) => void): Disposable
  }
}
export interface WebviewViewProvider {
  resolveWebviewView(view: WebviewView): void | Promise<void>
}
```
and add to the `ManifoldApi` interface:
```ts
  window: {
    registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable
  }
```
- [ ] **Step 3:** Create `src/plugin-host/window-api.ts`:
```ts
// src/plugin-host/window-api.ts
import { HOST_WINDOW, type RpcEndpoint } from '../shared/plugins/rpc'
import type { Disposable, WebviewView, WebviewViewProvider } from '../shared/plugins/api-types'

interface HostWindowProxy {
  $setHtml(viewId: string, html: string): Promise<void>
  $postToWebview(viewId: string, message: unknown): Promise<void>
}

/** Builds the `manifold.window` API and the host-side view-resolution logic. */
export function createWindowApi(endpoint: RpcEndpoint): {
  windowApi: { registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable }
  resolveView(viewId: string): Promise<void>
  deliverMessage(viewId: string, message: unknown): void
} {
  const host = endpoint.getProxy<HostWindowProxy>(HOST_WINDOW)
  const providers = new Map<string, WebviewViewProvider>()
  const listeners = new Map<string, Set<(m: unknown) => void>>()

  const windowApi = {
    registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable {
      providers.set(viewId, provider)
      return { dispose: () => { providers.delete(viewId); listeners.delete(viewId) } }
    },
  }

  async function resolveView(viewId: string): Promise<void> {
    const provider = providers.get(viewId)
    if (!provider) return
    const viewListeners = new Set<(m: unknown) => void>()
    listeners.set(viewId, viewListeners)
    let html = ''
    const view: WebviewView = {
      webview: {
        get html() { return html },
        set html(value: string) { html = value; void host.$setHtml(viewId, value) },
        postMessage(message: unknown) { void host.$postToWebview(viewId, message) },
        onDidReceiveMessage(listener) { viewListeners.add(listener); return { dispose: () => viewListeners.delete(listener) } },
      },
    }
    await provider.resolveWebviewView(view)
  }

  function deliverMessage(viewId: string, message: unknown): void {
    const set = listeners.get(viewId)
    if (!set) return
    for (const listener of set) listener(message)
  }

  return { windowApi, resolveView, deliverMessage }
}
```
- [ ] **Step 4:** In `src/plugin-host/index.ts`, compose the window API and register `PLUGIN_WEBVIEW`. Change the api construction to:
```ts
import { createWindowApi } from './window-api'
import { PLUGIN_WEBVIEW } from '../shared/plugins/rpc' // add to existing import
// ...
const { api: commandsApi, invokeLocalCommand } = createApi(endpoint)
const { windowApi, resolveView, deliverMessage } = createWindowApi(endpoint)
const api = { ...commandsApi, window: windowApi }
installManifoldRequire(api)
// ... existing PLUGIN_ACTIVATION + PLUGIN_COMMANDS registrations, then:
endpoint.registerService(PLUGIN_WEBVIEW, {
  $resolveView: (viewId: string) => resolveView(viewId),
  $deliverMessage: (viewId: string, message: unknown) => deliverMessage(viewId, message),
})
```
  (`createApi` returns `{ api: {commands}, invokeLocalCommand }`; spreading keeps `commands` and adds `window`.)
- [ ] **Step 5: Extend the in-memory integration test** `src/main/plugins/extension-host-integration.test.ts` — add a `describe` that wires `createWindowApi` (host) ↔ a fake `HOST_WINDOW` service (main) capturing `$setHtml`, registers `PLUGIN_WEBVIEW` `{ $resolveView, $deliverMessage }`, then: register a provider that sets `view.webview.html='X'` and echoes received messages; call the main-side `pluginWebview.$resolveView(viewId)`; assert captured html === 'X'; call `$deliverMessage` and assert the provider's `postMessage` reached `$postToWebview`. (Mirror the wiring in the existing file.)
- [ ] **Step 6:** `npx vitest run src/main/plugins/extension-host-integration.test.ts src/shared/plugins` → pass. `typecheck:node` ≤ 16. Commit `feat(plugins): add host window API (webview view provider)`.

---

### Task 2 (G2): Main ExtensionHost window service + PluginManager.openView + IPC + main-window wiring

- [ ] **Step 1:** In `src/main/plugins/extension-host.ts`:
  - import `HOST_WINDOW, PLUGIN_WEBVIEW`.
  - add field `private send: ((channel: string, ...args: unknown[]) => void) | null = null` and `setSend(fn: (channel: string, ...args: unknown[]) => void): void { this.send = fn }`.
  - in `ensure()`, after the `HOST_COMMANDS` registration, add:
```ts
endpoint.registerService(HOST_WINDOW, {
  $setHtml: (viewId: string, html: string) => { this.send?.('plugins:webview-html', viewId, html) },
  $postToWebview: (viewId: string, message: unknown) => { this.send?.('plugins:webview-message', viewId, message) },
})
```
  - add methods:
```ts
async resolveView(target: ActivationTarget, viewId: string): Promise<void> {
  const { endpoint } = this.ensure()
  await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
  await endpoint.getProxy<{ $resolveView(viewId: string): Promise<void> }>(PLUGIN_WEBVIEW).$resolveView(viewId)
}
deliverWebviewMessage(viewId: string, message: unknown): void {
  const { endpoint } = this.ensure()
  void endpoint.getProxy<{ $deliverMessage(viewId: string, message: unknown): Promise<void> }>(PLUGIN_WEBVIEW).$deliverMessage(viewId, message)
}
```
- [ ] **Step 2:** In `src/main/plugins/plugin-manager.ts` add (import `BrowserWindow` type from electron):
```ts
setMainWindow(win: import('electron').BrowserWindow): void {
  this.host.setSend((channel, ...args) => { if (!win.isDestroyed()) win.webContents.send(channel, ...args) })
}
async openView(viewId: string): Promise<void> {
  const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
  if (!plugin || !plugin.manifest.main) return
  await this.host.resolveView({ id: plugin.id, root: plugin.root, main: plugin.manifest.main }, viewId)
}
deliverWebviewMessage(viewId: string, message: unknown): void {
  this.host.deliverWebviewMessage(viewId, message)
}
```
- [ ] **Step 3:** IPC — in `src/main/ipc/plugin-handlers.ts` add:
```ts
  ipcMain.handle('plugins:open-view', (_e, viewId: string) => deps.pluginManager.openView(viewId))
  ipcMain.handle('plugins:webview-to-host', (_e, viewId: string, message: unknown) => {
    deps.pluginManager.deliverWebviewMessage(viewId, message); return true
  })
```
- [ ] **Step 4:** Preload `src/preload/index.ts` — add `'plugins:open-view'`, `'plugins:webview-to-host'` to `ALLOWED_INVOKE_CHANNELS`; add `'plugins:webview-html'`, `'plugins:webview-message'` to `ALLOWED_LISTEN_CHANNELS`.
- [ ] **Step 5:** Main-window wiring — find the `wireMainWindow` closure (grep `setMainWindow` in `src/main/app/`; it's where `sessionManager.setMainWindow(w)` / `fileWatcher.setMainWindow(w)` are called) and add `deps.pluginManager.setMainWindow(w)` (or `pluginManager.setMainWindow(w)` if in closure scope). `pluginManager` is in `ipcDeps`/index scope.
- [ ] **Step 6:** `typecheck:node` ≤ 16; `npm run build` succeeds; `out/main/plugin-host.js` exists. Commit `feat(plugins): wire webview view resolution through ExtensionHost + IPC`.

---

### Task 3 (G3): Renderer PluginViewPanel + dock open path

- [ ] **Step 1:** Create `src/renderer/components/editor/PluginViewPanel.tsx`:
```tsx
import React, { useEffect, useRef, useState } from 'react'

/** Renders a plugin-contributed view as a sandboxed iframe. The panel id IS the
 *  plugin view id; main resolves the owning plugin. */
export function PluginViewPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const viewId = api.id
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [html, setHtml] = useState('')

  useEffect(() => {
    const offHtml = window.electronAPI.on('plugins:webview-html', (id: unknown, h: unknown) => {
      if (id === viewId) setHtml(h as string)
    })
    const offMsg = window.electronAPI.on('plugins:webview-message', (id: unknown, msg: unknown) => {
      if (id === viewId) iframeRef.current?.contentWindow?.postMessage(msg, '*')
    })
    void window.electronAPI.invoke('plugins:open-view', viewId)
    return () => { offHtml(); offMsg() }
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

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={html}
      title={viewId}
      style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
    />
  )
}
```
- [ ] **Step 2:** In `src/renderer/components/editor/dock-panels.tsx`, import `PluginViewPanel` and add `pluginView: PluginViewPanel,` to `PANEL_COMPONENTS` (a static entry — do NOT route it through `getPanelComponents()`).
- [ ] **Step 3:** In `src/renderer/hooks/useDockLayout.ts`, add an `openPluginView` callback (model on the sibling-open in `useAgentSiblingDockTabs.ts`) and return it:
```ts
const openPluginView = useCallback((viewId: string, title: string): void => {
  const api = apiRef.current
  if (!api) return
  const existing = api.getPanel(viewId)
  if (existing) { existing.api.setActive(); return }
  const referencePanelId = findTopLeftWorkspaceReferencePanel(api) ?? 'agent'
  api.addPanel({ id: viewId, component: 'pluginView', title, position: { referencePanel: referencePanelId, direction: 'within' } })
  bumpVersion()
}, [/* apiRef, bumpVersion — match existing deps style */])
```
  Add `openPluginView` to the hook's returned object and to its result type/interface. (`findTopLeftWorkspaceReferencePanel` is already imported in the dock-layout helpers; import if needed.)
- [ ] **Step 4:** In `src/renderer/components/editor/dock-panel-types.ts`, add to `DockAppState`:
```ts
  /** Open a plugin-contributed view as a dock panel. */
  onOpenPluginView: (viewId: string, title: string) => void
```
- [ ] **Step 5:** In `src/renderer/App.tsx`, in the `DockAppState` object, add `onOpenPluginView: dockLayout.openPluginView,` (near `onOpenModule`).
- [ ] **Step 6:** In `src/renderer/components/editor/ModuleLauncher.tsx`, change the plugin branch from the 1a no-op to:
```tsx
    if (c.source === 'plugin') {
      return { id: c.id, label: c.title, description: c.description, action: () => state.onOpenPluginView(c.id, c.title) }
    }
```
- [ ] **Step 7:** `typecheck:web` ≤ 38 (paste; no error names PluginViewPanel/useDockLayout/ModuleLauncher/dock-panel-types/App). Re-run `npx vitest run src/renderer/plugins src/renderer/components/editor/dock-panels.contributions.test.tsx` → pass. Commit `feat(plugins): render plugin views as sandboxed iframe dock panels`.

---

### Task 4 (G4): Sample plugin webview + build + dev smoke

- [ ] **Step 1:** Update `resources/plugins/hello/out/plugin.js` to register a webview provider (keep the existing ping command):
```js
const manifold = require('manifold')

exports.activate = (context) => {
  context.subscriptions.push(
    manifold.commands.registerCommand('manifold.hello.ping', (name) => `pong:${name ?? 'world'}`),
  )
  context.subscriptions.push(
    manifold.window.registerWebviewViewProvider('manifold.hello.panel', {
      resolveWebviewView(view) {
        view.webview.html = `<!doctype html><html><body style="font-family:system-ui;padding:14px;color:#ddd;background:#1e1e1e">
          <h3 style="margin-top:0">Hello from a Manifold plugin 👋</h3>
          <button id="ping">Ping host</button>
          <pre id="out" style="white-space:pre-wrap"></pre>
          <script>
            const out = document.getElementById('out')
            document.getElementById('ping').addEventListener('click', () => parent.postMessage({ type: 'ping', at: Date.now() }, '*'))
            window.addEventListener('message', (e) => { out.textContent = 'host → ' + JSON.stringify(e.data) })
          </script></body></html>`
        view.webview.onDidReceiveMessage((msg) => { view.webview.postMessage({ type: 'pong', echo: msg }) })
      },
    }),
  )
}
exports.deactivate = () => {}
```
  (Force-add if needed: `git add -f resources/plugins/hello/out/plugin.js` — the root `.gitignore` ignores `out/`.)
- [ ] **Step 2:** `npm run build` succeeds; `out/main/plugin-host.js` exists. `typecheck:node`/`typecheck:web` at baseline. Commit `feat(plugins): Hello plugin contributes a webview panel`.
- [ ] **Step 3 (dev smoke — NOT CI):** `npm run dev`; open **"+ Apps" → "Hello (plugin)"**; confirm the iframe renders "Hello from a Manifold plugin"; click **Ping host** and confirm `host → {"type":"pong",...}` appears (round-trip renderer→host→provider→renderer). Record the result.

---

## Self-Review (this plan)
- **Spec coverage (design spec §6.8 / Phase 1c):** host window API + provider (Task 1), main resolution + IPC + wiring (Task 2), renderer iframe panel + dock open (Task 3), sample webview + smoke (Task 4).
- **Verifiability honesty:** window API logic unit-tested in-memory; iframe + process round-trip are build + dev-smoke only.
- **Type consistency:** `HOST_WINDOW`/`PLUGIN_WEBVIEW` (Task 1) used by `window-api`, `index.ts`, `extension-host`; `WebviewView`/`WebviewViewProvider`/`ManifoldApi.window` (Task 1) used by `window-api` + sample plugin; `onOpenPluginView` (Task 3 Steps 4–6) consistent across `DockAppState`, `App.tsx`, `ModuleLauncher`; `openPluginView` added to `useDockLayout` result + type.
- **Decisions:** iframe `srcdoc` (not `<webview>`); viewId-only panels (no dockview params); main resolves owner; no asset server in MVP.
- **Deferred (noted):** multi-file assets/`asWebviewUri`, plugin-panel layout restore robustness, per-plugin webview isolation hardening.
