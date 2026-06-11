# Watch-as-a-Plugin — Phase 2: The `manifold.watch` Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the builtin watch module to `resources/plugins/manifold.watch/`, coexisting with the builtin as "Watch (plugin)".

**Architecture:** Mirrors `manifold.loop`: a node-side plugin entry (`plugin.ts`) wires ported pipeline modules to `manifold.agents` (spawn surface from PR 1), `manifold.transcription`, `manifold.lm`, and a webview host that serves a bundled React UI over a typed postMessage protocol. The builtin watch is untouched.

**Tech Stack:** TypeScript, esbuild (via `scripts/build-plugins.mjs`, zero config changes — it auto-builds any plugin with `src/` + manifest `main`, and bundles `src/webview/index.tsx` when present), vitest (already includes `resources/plugins/**`).

**Spec:** `docs/superpowers/specs/2026-06-11-watch-plugin-design.md` (PR 2 section).
**Branch:** `watch-plugin/phase-2-plugin` (stacked on `watch-plugin/phase-1-api-extensions`, PR #629).

**Run tests with `npm test -- <path>` (never raw vitest).** Typecheck baselines: web 37 / node 12. Plugin sources are type-checked by `tsconfig.plugins.json` (`npm run typecheck:plugins` if present — verify with `grep typecheck package.json`).

---

### Task 1: Plugin scaffold — manifest + bundled skill copy

**Files:**
- Create: `resources/plugins/manifold.watch/package.json`
- Create: `resources/plugins/manifold.watch/skills/watch/**` (copy of `resources/skills/watch/`)

- [ ] **Step 1: Write the manifest**

```json
{
  "name": "watch",
  "publisher": "manifold",
  "version": "0.0.1",
  "displayName": "Watch (plugin)",
  "description": "Watch videos with sibling analysis agents, as a plugin.",
  "engines": { "manifold": "^0.3.0" },
  "main": "./out/plugin.js",
  "activationEvents": ["onView:manifold.watch.panel"],
  "capabilities": ["agent:spawn", "transcription:read", "lm", "workspace:read", "storage"],
  "contributes": {
    "views": [
      {
        "id": "manifold.watch.panel",
        "title": "Watch (plugin)",
        "description": "Watch videos with sibling analysis agents.",
        "launcher": true,
        "frameSources": ["https://www.youtube.com"]
      }
    ]
  }
}
```

- [ ] **Step 2: Copy the bundled skill** (`resources/skills/watch/` stays untouched until Phase 3)

```bash
cp -R resources/skills/watch resources/plugins/manifold.watch/skills/
```

- [ ] **Step 3: Commit**

---

### Task 2: Port the shared types + pure pipeline modules (with tests)

**Files (create under `resources/plugins/manifold.watch/src/`, porting from the cited sources):**

| Plugin file | Ported from | Changes |
|---|---|---|
| `shared-types.ts` | `src/shared/watch-types.ts` | Inline `AiServiceProvider`/`AiServiceSettings` definitions (plugin can't import app `src/`); keep all `Watch*` types verbatim; keep `TranscriptionSettings` alias |
| `types.ts` | `src/main/watch/types.ts` | import path → `./shared-types` |
| `runner.ts` | `src/main/watch/runner.ts` | none (2 lines) |
| `vtt-parser.ts` + test | `src/main/watch/vtt-parser.ts` | none |
| `frame-reader.ts` + test | `src/main/watch/frame-reader.ts` | none |
| `setup-detector.ts` + test | `src/main/watch/setup-detector.ts` | types → `./shared-types` |
| `yt-dlp-fetcher.ts` + test | `src/main/watch/yt-dlp-fetcher.ts` | none |
| `binary-installer.ts` | `src/main/watch/binary-installer.ts` | none |
| `downloader.ts` | `src/main/watch/downloader.ts` | none |
| `frame-extractor.ts` + test | `src/main/watch/frame-extractor.ts` | none |
| `transcriber.ts` + test | `src/main/watch/transcriber.ts` | types → `./shared-types` |
| `peek.ts` | `src/main/watch/peek.ts` | types → `./shared-types` |
| `pipeline.ts` | `src/main/watch/pipeline.ts` | types → `./shared-types` |
| `run-store.ts` + test | `src/main/watch/run-store.ts` | session param: takes `{ id, projectId? }`-shaped info instead of importing app session types — check actual imports and decouple minimally |
| `skill-installer.ts` + test | `src/main/watch/skill-installer.ts` | none |
| `resource-path.ts` | new, 5 lines | `getBundledWatchSkillPath(pluginUri)` → `join(pluginUri, 'skills', 'watch')` |

- [ ] **Step 1: Copy each file + its test; fix imports per the table.** All `node:*` imports work as-is (plugin host has full Node). Tests import from the plugin-local paths.
- [ ] **Step 2: Run the ported tests**: `npm test -- resources/plugins/manifold.watch` → all pass.
- [ ] **Step 3: Commit.**

---

### Task 3: `playlist-runner.ts` rewrite onto the agent-spawn surface

**Files:**
- Create: `resources/plugins/manifold.watch/src/playlist-runner.ts` (ported from `src/main/watch/playlist-runner.ts`)
- Create: `resources/plugins/manifold.watch/src/playlist-runner.test.ts` (ported from `src/main/watch/playlist-runner.test.ts`)

The `RunPlaylistDeps.sessionManager: SessionManager` dependency becomes a narrow injected port (filled by `plugin.ts` from `manifold.agents`):

```ts
export interface AgentPort {
  /** Spawn a sibling next to the base session; returns the sibling handle. */
  spawnSibling(baseSessionId: string, opts: { title?: string; groupId?: string }): Promise<SiblingHandle>
  /** Status of any session ('missing' when gone). */
  getStatus(sessionId: string): Promise<'running' | 'waiting' | 'done' | 'error' | 'missing'>
  /** Raw PTY input to any session (used for the meta-agent primer). */
  sendText(sessionId: string, text: string): Promise<void>
  /** Wait until a session's TUI prompt is up (status 'waiting'); false = timed out (non-fatal). */
  whenReady(sessionId: string, timeoutMs?: number): Promise<boolean>
}
export interface SiblingHandle {
  sessionId: string
  sendText(text: string): Promise<void>
  whenReady(timeoutMs?: number): Promise<boolean>
  kill(): Promise<void>
}
```

Mappings from the builtin (`src/main/watch/playlist-runner.ts`):
- `deps.sessionManager.getSession(opts.sessionId)` preflight (`:61-64`) → `await agents.getStatus(opts.sessionId)` must be `'running' | 'waiting'`.
- `createSession({...})` (`:98`) → `agents.spawnSibling(opts.sessionId, { title, groupId: runId })` (project/runtime/worktree derivation is main-side now).
- `waitUntilSiblingReady` (`:203`) → `handle.whenReady(SIBLING_READY_TIMEOUT_MS)` (main-side poll; same 30s timeout, same proceed-on-timeout semantics).
- `sendInput(siblingId, command)` + 400ms + `'\r'` (`:164-167`) → `handle.sendText(command)`, same delay, `handle.sendText('\r')`.
- `primeMetaAgent` (`:215`) → same flow via `agents.whenReady(metaSessionId)` + `agents.sendText(metaSessionId, primer)` + delay + `'\r'`.
- `killSession` cleanup (`:109,185`) → `handle.kill().catch(() => {})`.
- `getTranscription: () => TranscriptionSettings` stays an injected function (plugin.ts wires `manifold.transcription.get()` — note it becomes async; resolve it ONCE at run start: `const transcription = await deps.getTranscription()`).

The test port replaces the fake `SessionManager` with a fake `AgentPort` (same scenarios: spawn failure cleanup, ready-timeout proceed, command typed after frames ready, primer only for multi-entry).

- [ ] Steps: port + adapt tests first (red), then the runner (green), commit.

---

### Task 4: Webview message protocol + webview host (with tests)

**Files:**
- Create: `resources/plugins/manifold.watch/src/webview/protocol.ts`
- Create: `resources/plugins/manifold.watch/src/webview-host.ts` + `webview-host.test.ts`

**Protocol** (consolidates the 9 invoke + 2 push `watch:*` channels; request/response pairs carry `reqId`):

```ts
// Webview → Host
export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'peek'; reqId: number; url: string }
  | { type: 'peekPlaylist'; reqId: number; url: string }
  | { type: 'runPlaylist'; entries: WatchPlaylistEntryInput[]; sourceUrl?: string }
  | { type: 'stop' }
  | { type: 'installBinaries'; reqId: number }
  | { type: 'readFrame'; reqId: number; framePath: string }
  | { type: 'setupStatus'; reqId: number }
  | { type: 'setUrl'; url: string }
  | { type: 'revealAgent'; sessionId: string; title?: string }
  | { type: 'improvePrompt'; reqId: number; draft: string }
  | { type: 'persist'; key: string; value: unknown }

// Host → Webview
export type HostMsg =
  | { type: 'init'; sessionId: string | null; snapshot: WatchSessionSnapshot | null; setup: WatchSetupStatus; persisted: Record<string, unknown> }
  | { type: 'peekResult'; reqId: number; result: WatchPeekResult }
  | { type: 'peekPlaylistResult'; reqId: number; result: WatchPlaylistPeekResult }
  | { type: 'runResult'; result: WatchPlaylistRunResult }
  | { type: 'playlistProgress'; entryIndex: number; kind: 'log' | 'stage' | 'frames' | 'sibling'; payload: unknown }
  | { type: 'installProgress'; line: string }
  | { type: 'installResult'; reqId: number; ok: boolean; error?: string }
  | { type: 'frameData'; reqId: number; dataUrl?: string; error?: string }
  | { type: 'setupStatusResult'; reqId: number; status: WatchSetupStatus }
  | { type: 'improveResult'; reqId: number; ok: boolean; text?: string; error?: string }
```

plus `isWebviewMsg()` guard (loop `protocol.ts` pattern).

**Webview host** (loop `webview-host.ts` pattern — injected facade, no `manifold` import, testable):
- `WatchFacade` interface over: `peek`, `peekPlaylist`, `runPlaylist` (with progress hooks → `playlistProgress` posts), `stop` (aborts in-flight run via AbortController), `installBinaries` (progress lines → `installProgress`), `readFrame`, `setupStatus`, `setUrl`, `revealAgent`, `improvePrompt`, `getSnapshot`, `getPersisted`/`persist`.
- `ready` → posts `init` (active sessionId + snapshot + setup + persisted blob). `refresh()` re-posts init on active-session change.
- `buildWebviewHtml` copied from loop (escape `</script>`).
- Tests mirror `manifold.loop/src/webview-host.test.ts`: ready→init, message dispatch per type, emit-before-resolve no-op, stop aborts.

- [ ] Steps: protocol + failing host tests, then host implementation, commit.

---

### Task 5: `plugin.ts` — activation wiring

**Files:**
- Create: `resources/plugins/manifold.watch/src/plugin.ts`

```ts
// resources/plugins/manifold.watch/src/plugin.ts
import type { ManifoldContext } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createWebviewHost } from './webview-host'
import { createWatchFacade } from './facade'
import { installWatchSkills } from './skill-installer'

export function activate(context: ManifoldContext): void {
  // Idempotent (fingerprint-checked); the skill must exist before any sibling
  // agent is asked to run /watch:watch, and runs only start from this panel.
  try { installWatchSkills({ sourceDir: join(context.pluginUri, 'skills', 'watch') }) }
  catch (err) { console.error('[watch-plugin] skill install failed:', err) }

  const facade = createWatchFacade(manifold)
  const host = createWebviewHost({ facade, readBundle: () => readFileSync(join(context.pluginUri, 'out', 'webview.js'), 'utf8') })
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.watch.panel', host.provider))
  context.subscriptions.push(manifold.workspace.onDidChangeActiveSession(() => host.refresh()))
}

export function deactivate(): void {}
```

plus `src/facade.ts`: implements `WatchFacade` by wiring the ported modules — `AgentPort` from `manifold.agents` (spawnSibling/getAgent(...).sendText/whenReady/getStatus), `getTranscription` from `manifold.transcription.get`, `improvePrompt` via `manifold.lm` (loop `improveWithAi` pattern; instruction text ported from what `useWatchPanelActions` sends to `git:ai-generate` — read that hook for the exact prompt), `revealAgent` via `manifold.agents.getAgent(sessionId)?.reveal(title)`, persistence via `manifold.storage.global`, snapshot via the ported `WatchRunStore` (singleton in the plugin process; same `~/.manifold/watch-runs.json`), active session via `manifold.agents.activeAgent?.sessionId ?? null`.

- [ ] Steps: facade (+ small unit test with a fake `manifold`), plugin.ts, `npm run build:plugins` (or the pretest hook) builds `manifold.watch` cleanly, commit.

---

### Task 6: Webview UI port

**Files:**
- Create: `resources/plugins/manifold.watch/src/webview/index.tsx` (entry: render `<WatchPanel/>`, theme-var handling comes free from `PluginViewPanel`)
- Create: `resources/plugins/manifold.watch/src/webview/use-watch-bridge.ts` — the loop `use-loop-bridge.ts` pattern: state reducer over `HostMsg`, action dispatchers posting `WebviewMsg`, reqId correlation for peek/install/frame/improve round-trips
- Create: `resources/plugins/manifold.watch/src/webview/components/*` + `styles/*` — ported from `src/renderer/components/watch/*` (WatchPanel, WatchHeader, WatchActivePlayer, WatchPlayerSlot, WatchPlaylistPreview, WatchSetupStatusBar, FrameThumbnailStrip, FrameLightbox, watch-format) and the state logic of `src/renderer/hooks/{useWatchPanel,useWatchPanelActions,useWatchUrlPreview,watchPanelStore,watch-preview-cache,watch-state-equality}.ts`

Port rules:
- Every `window.electronAPI.invoke('watch:*', …)` → bridge action over the protocol; every `window.electronAPI.on('watch:*', …)` → `HostMsg` case in the reducer.
- `useDockState()` session context → `init.sessionId` from the host (re-inited on session change via `refresh()`).
- "Open agent" (`dock.onOpenSibling`/`agent-siblings`) → `{ type: 'revealAgent', sessionId, title }`.
- localStorage (`watchPanelStore` STORAGE_KEY, `watch-preview-cache`) → `persist` messages + `init.persisted` (same data shapes, key per former localStorage key).
- `git:ai-generate` improve-prompt → `{ type: 'improvePrompt', … }`.
- Keep visual structure/styles as-is (inline styles port directly; design tokens `var(--…)` are injected by `PluginViewPanel` theme plumbing).
- The YouTube iframe in `WatchActivePlayer` ports verbatim — the manifest `frameSources` (Task 1) admits it.
- Port `watch-format.test.ts` and any pure-logic tests (state equality, preview-cache pruning) as plugin webview tests (remember: `import React` explicitly; no jest-dom matchers — built-ins only).

- [ ] Steps: bridge + reducer first with tests for reqId correlation and progress accumulation, then components, then `npm run build:plugins` produces `out/webview.js`, commit.

---

### Task 7: Verification + PR

- [ ] `npm test` full suite — only the 4 known pdf.worker?url local failures; all `resources/plugins/manifold.watch/**` tests green.
- [ ] `npm run typecheck:web` ≤ 37, `typecheck:node` ≤ 12; plugin tsconfig check if wired.
- [ ] Manual smoke (best-effort in this environment): `npm run build:plugins` builds 4 plugins (hello, hello-tree, manifold.loop, manifold.watch).
- [ ] Update `docs/architecture/watch.md`: note the coexisting plugin (one paragraph + covers unchanged), bump `updated:`.
- [ ] Commit, push `watch-plugin/phase-2-plugin`, `gh pr create` with base `watch-plugin/phase-1-api-extensions`.

## Self-review notes
- The builtin watch is untouched in this PR — any diff under `src/main/watch` or `src/renderer/components/watch` is a plan violation.
- `run-store.ts` port: check its actual import of session types before assuming; decouple with a minimal local shape.
- Parity checklist (manual, gates Phase 3): peek + playlist preview, single + multi-entry runs, sibling spawn + `/watch:watch` typed, meta priming, frames + lightbox, YouTube embed, binary install, improve prompt, state restore across restart.
