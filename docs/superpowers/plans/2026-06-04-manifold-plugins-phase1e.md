# Manifold Plugins — Phase 1e Plan (`workspace` read API)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Add `manifold.workspace` (read-only): `activeProject`/`activeSession` + `onDidChange*`, capability-gated by `workspace:read`. The renderer (which owns "active" state) pushes context changes → main → host; the host caches them and serves plugins.

**Scope note:** This phase delivers `workspace` (read). **`manifold.configuration` is deferred to Phase 1f** — it needs a settings-integration design (contributed defaults vs. user overrides + a settings UI); a stub adds surface without value, and plugins can use `manifold.storage` for their own config today.

**Verification:** the host workspace-context holder, gating, and the `$setActiveContext` round-trip are unit/in-memory tested. The renderer→main push + real process are Electron-only (build + dev smoke). Gates: `typecheck:node` ≤ 16, `typecheck:web` ≤ 37, no error names a new file.

## Data flow
```
App.tsx active project/session change → invoke('plugins:set-active-context', {project, session})
  → PluginManager.setActiveContext → ExtensionHost.setActiveContext → host PLUGIN_WORKSPACE.$setActiveContext
  → workspaceContext.setActiveContext (host singleton) → fires onDidChange listeners
plugin reads manifold.workspace.activeProject / subscribes onDidChangeActiveProject (gated by workspace:read)
```

## File Structure
**Create:** `src/plugin-host/workspace-api.ts` (+ `workspace-api.test.ts`).
**Modify:** `src/shared/plugins/rpc.ts` (+`PLUGIN_WORKSPACE`), `src/shared/plugins/api-types.ts` (+`ProjectInfo`,`SessionInfo`,`workspace`), `src/plugin-host/gated-api.ts` (factories map + `workspace` gate) + its test, `src/plugin-host/index.ts` (workspace context + `PLUGIN_WORKSPACE` + factories), `src/main/plugins/extension-host-integration.test.ts` (workspace round-trip), `src/main/plugins/extension-host.ts` (`setActiveContext`), `src/main/plugins/plugin-manager.ts` (`setActiveContext`), `src/main/ipc/plugin-handlers.ts` (+channel), `src/preload/index.ts` (+channel), `src/renderer/App.tsx` (push effect), `resources/plugins/hello/{package.json,out/plugin.js}`.

---

### Task 1 (G1): Host workspace API + gating refactor + integration test

- [ ] **Step 1:** `src/shared/plugins/rpc.ts` — add `export const PLUGIN_WORKSPACE = 'PluginWorkspace'`.
- [ ] **Step 2:** `src/shared/plugins/api-types.ts` — add:
```ts
export interface ProjectInfo { id: string; name: string; path: string }
export interface SessionInfo { id: string; status: string; branchName?: string }
```
and add to `ManifoldApi`:
```ts
  workspace: {
    readonly activeProject: ProjectInfo | undefined
    readonly activeSession: SessionInfo | undefined
    onDidChangeActiveProject(listener: (project: ProjectInfo | undefined) => void): Disposable
    onDidChangeActiveSession(listener: (session: SessionInfo | undefined) => void): Disposable
  }
```
- [ ] **Step 3:** Create `src/plugin-host/workspace-api.ts`:
```ts
// src/plugin-host/workspace-api.ts
import type { Disposable, ProjectInfo, SessionInfo, ManifoldApi } from '../shared/plugins/api-types'

export interface ActiveContext { project?: ProjectInfo; session?: SessionInfo }

/** Host-side singleton holding the latest active context pushed from the renderer
 *  and notifying subscribers. Shared across all plugins (one workspace). */
export class WorkspaceContext {
  private context: ActiveContext = {}
  private readonly projectListeners = new Set<(p: ProjectInfo | undefined) => void>()
  private readonly sessionListeners = new Set<(s: SessionInfo | undefined) => void>()

  setActiveContext(next: ActiveContext): void {
    const projectChanged = next.project?.id !== this.context.project?.id
    const sessionChanged = next.session?.id !== this.context.session?.id
    this.context = next
    if (projectChanged) for (const l of this.projectListeners) l(next.project)
    if (sessionChanged) for (const l of this.sessionListeners) l(next.session)
  }

  /** Per-plugin workspace namespace reading this shared context. */
  makeApi(): ManifoldApi['workspace'] {
    const self = this
    return {
      get activeProject(): ProjectInfo | undefined { return self.context.project },
      get activeSession(): SessionInfo | undefined { return self.context.session },
      onDidChangeActiveProject(listener): Disposable {
        self.projectListeners.add(listener)
        return { dispose: () => self.projectListeners.delete(listener) }
      },
      onDidChangeActiveSession(listener): Disposable {
        self.sessionListeners.add(listener)
        return { dispose: () => self.sessionListeners.delete(listener) }
      },
    }
  }
}
```
- [ ] **Step 4:** `src/plugin-host/gated-api.ts` — change `buildGatedApi` to take a factories map (this updates the 1d signature):
```ts
import type { ManifoldApi } from '../shared/plugins/api-types'

export class CapabilityError extends Error {
  constructor(capability: string) {
    super(`Missing capability: "${capability}". Declare it in your plugin manifest's "capabilities".`)
    this.name = 'CapabilityError'
  }
}

export interface GatedFactories {
  storage: () => ManifoldApi['storage']
  workspace: () => ManifoldApi['workspace']
}

export function buildGatedApi(
  capabilities: string[],
  shared: Pick<ManifoldApi, 'commands' | 'window'>,
  factories: GatedFactories,
): ManifoldApi {
  const caps = new Set(capabilities)
  return {
    commands: shared.commands,
    window: shared.window,
    get storage(): ManifoldApi['storage'] {
      if (!caps.has('storage')) throw new CapabilityError('storage')
      return factories.storage()
    },
    get workspace(): ManifoldApi['workspace'] {
      if (!caps.has('workspace:read')) throw new CapabilityError('workspace:read')
      return factories.workspace()
    },
  }
}
```
- [ ] **Step 5:** Update `src/plugin-host/gated-api.test.ts` — the `buildGatedApi` calls now pass a factories object `{ storage: () => (...), workspace: () => (...) }`. Add cases: `workspace` throws `CapabilityError` without `workspace:read`; present with it. Update the existing storage cases to the new signature.
- [ ] **Step 6:** `src/plugin-host/index.ts` — create the workspace context, register `PLUGIN_WORKSPACE`, and pass both factories to `buildGatedApi`:
```ts
import { WorkspaceContext } from './workspace-api'
import { PLUGIN_WORKSPACE } from '../shared/plugins/rpc' // add to existing import
// ...
const workspaceContext = new WorkspaceContext()
// in the activator's loadModule, build with factories:
currentApi = buildGatedApi(t.capabilities ?? [], sharedNamespaces, {
  storage: () => createStorageApi(endpoint, t.id),
  workspace: () => workspaceContext.makeApi(),
})
// and the initial currentApi default likewise (capabilities []).
// register the service:
endpoint.registerService(PLUGIN_WORKSPACE, {
  $setActiveContext: (ctx: { project?: unknown; session?: unknown }) => workspaceContext.setActiveContext(ctx as never),
})
```
- [ ] **Step 7:** `src/plugin-host/workspace-api.test.ts`: `setActiveContext` updates `activeProject`/`activeSession`; `onDidChangeActiveProject` fires only when the project id changes (not on session-only change); disposing a listener stops it.
- [ ] **Step 8:** Extend `extension-host-integration.test.ts`: wire `PLUGIN_WORKSPACE` host service + a main proxy; build a gated api with `['workspace:read']` using a `WorkspaceContext`; assert that after `pluginWorkspace.$setActiveContext({ project: { id:'p', name:'P', path:'/p' } })` (await settle), `api.workspace.activeProject?.id === 'p'` and a registered `onDidChangeActiveProject` listener fired; assert `buildGatedApi([], ...)` → `.workspace` throws `CapabilityError`.
- [ ] **Step 9:** `npx vitest run src/plugin-host src/main/plugins/extension-host-integration.test.ts src/shared/plugins` → pass. `typecheck:node` ≤ 16. Commit `feat(plugins): add workspace (read) host API + capability gating`.

---

### Task 2 (G2): Main wiring + renderer active-context push

- [ ] **Step 1:** `src/main/plugins/extension-host.ts` — import `PLUGIN_WORKSPACE`; add:
```ts
setActiveContext(context: { project?: unknown; session?: unknown }): void {
  const { endpoint } = this.ensure()
  void endpoint.getProxy<{ $setActiveContext(ctx: unknown): Promise<void> }>(PLUGIN_WORKSPACE).$setActiveContext(context)
}
```
- [ ] **Step 2:** `src/main/plugins/plugin-manager.ts` — add `setActiveContext(context: { project?: unknown; session?: unknown }): void { this.host.setActiveContext(context) }`.
- [ ] **Step 3:** `src/main/ipc/plugin-handlers.ts` — add `ipcMain.handle('plugins:set-active-context', (_e, context: unknown) => { deps.pluginManager.setActiveContext((context ?? {}) as never); return true })`.
- [ ] **Step 4:** `src/preload/index.ts` — add `'plugins:set-active-context'` to `ALLOWED_INVOKE_CHANNELS`.
- [ ] **Step 5:** `src/renderer/App.tsx` — `activeProject` is computed at ~line 131 (`projects.find(p => p.id === activeProjectId) ?? null`); `activeSession` comes from `useAgentSession` (line 43). Read `src/shared/types.ts` for `Project` (has `id`, `name`, `path`) and `AgentSession` (has `id`, `status`, `branchName`) field names. Add an effect (after those are in scope) that pushes minimal info when they change:
```ts
useEffect(() => {
  void window.electronAPI.invoke('plugins:set-active-context', {
    project: activeProject ? { id: activeProject.id, name: activeProject.name, path: activeProject.path } : undefined,
    session: activeSession ? { id: activeSession.id, status: activeSession.status, branchName: activeSession.branchName } : undefined,
  })
}, [activeProject?.id, activeProject?.name, activeProject?.path, activeSession?.id, activeSession?.status, activeSession?.branchName])
```
  Confirm the exact field names against `shared/types.ts` and adjust if needed.
- [ ] **Step 6:** `typecheck:node` ≤ 16; `typecheck:web` ≤ 37; `npm run build` OK; `out/main/plugin-host.js` exists. Commit `feat(plugins): push active workspace context renderer→host`.

---

### Task 3 (G3): Reference plugin shows active project + build + smoke

- [ ] **Step 1:** `resources/plugins/hello/package.json` — change `capabilities` to `["storage", "workspace:read"]`.
- [ ] **Step 2:** `resources/plugins/hello/out/plugin.js` — in `resolveWebviewView`, read `manifold.workspace.activeProject`, show its name, and update on `onDidChangeActiveProject`. Keep the counter + ping. Add to the existing HTML a `<p>Active project: <b id="proj">…</b></p>` and:
```js
        const sendProject = (p) => view.webview.postMessage({ type: 'project', name: p ? p.name : '(none)' })
        sendProject(manifold.workspace.activeProject)
        context.subscriptions.push(manifold.workspace.onDidChangeActiveProject((p) => sendProject(p)))
```
  and in the webview `<script>`, handle `e.data.type === 'project'` → set `#proj` text. (Keep it valid CJS; `git add -f` the out file.)
- [ ] **Step 3:** `node --check resources/plugins/hello/out/plugin.js && echo "syntax ok"`; `npm run build` OK; typechecks at baseline. Commit `feat(plugins): Hello plugin shows the active project via manifold.workspace`.
- [ ] **Step 4 (dev smoke — NOT CI):** `npm run dev` → "+ Apps" → Hello (plugin); confirm "Active project" shows the selected repo and updates when you switch projects (proves renderer→host context push + onDidChange). Record the result.

---

## Self-Review (this plan)
- **Spec coverage (design spec §6.7 workspace):** workspace context holder + gating (Task 1), renderer→main→host push (Task 2), reference plugin (Task 3). `configuration` deferred to Phase 1f (rationale above).
- **Verifiability:** `WorkspaceContext` + gating unit-tested; `$setActiveContext` round-trip in the in-memory integration test. Renderer push + process are build + dev-smoke.
- **Type consistency:** `PLUGIN_WORKSPACE` (Task 1) used by `index.ts` + `extension-host`; `ProjectInfo`/`SessionInfo`/`workspace` (Task 1) implemented by `WorkspaceContext.makeApi` + consumed by the reference plugin; `buildGatedApi` factories signature updated consistently in `gated-api`, its test, the integration test, and `index.ts`.
- **Refactor note:** `buildGatedApi` signature changes from `(caps, shared, makeStorage)` to `(caps, shared, { storage, workspace })` — Task 1 Steps 4–6 + 8 update every call site/test together.
