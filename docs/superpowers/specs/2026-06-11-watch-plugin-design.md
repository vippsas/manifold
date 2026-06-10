# Watch-as-a-Plugin — Design

**Status:** Design (standing pre-approval through PR creation). Plans to follow via `writing-plans`.
**Date:** 2026-06-11
**Precedent:** the loop conversion (Phase A #443 → B1 → B2a/B2b → C), now complete — `src/main/loop/`
is gone and `manifold.loop` is canonical.

---

## Why this exists

Watch is the last large built-in module that predates the plugin system. It already *behaves*
like a plugin — a dock panel, its own IPC namespace, its own external binaries, and a bundled
Claude skill — but lives across core: `src/main/watch/` (~2,000 LOC), `src/main/ipc/watch-handlers.ts`,
`src/renderer/components/watch/` + hooks (~1,400 LOC), `src/shared/watch-types.ts`, and
`resources/skills/watch/`. Converting it to `resources/plugins/manifold.watch/` finishes what the
loop conversion started: core owns infrastructure, features are plugins.

The loop conversion built the expensive plumbing (webview bundling, theme vars, postMessage
bridge, `PluginViewPanel`, privileged-API gating). Watch reuses all of it; only three genuine
gaps remain (below). The conversion is **three PRs**: plugin-system extensions → the plugin,
coexisting → builtin removal.

## Current architecture (verified inventory)

**Pipeline (main):** `watch:run-playlist` → `runWatchPlaylist` (`playlist-runner.ts:53`) spawns
one sibling agent per entry via `sessionManager.createSession({ projectId, runtimeId, prompt,
existingWorktreePath, groupId })` (`playlist-runner.ts:98`), runs up to 3 concurrent
`runWatchPipeline` calls (`pipeline.ts:17`): `downloader.ts` (yt-dlp or local file) →
`frame-extractor.ts` (ffprobe metadata, ffmpeg auto-fps frames) → captions (`vtt-parser.ts`) or
`transcriber.ts` (ffmpeg audio → OpenAI/Azure `gpt-4o-transcribe` via global `fetch`) →
`report.md`. Each finished pipeline waits for its sibling's TUI prompt
(`waitUntilSiblingReady`, polls `getSession(sid).status === 'waiting'`, `playlist-runner.ts:203`)
then types `/watch:watch "<workdir>" <question>` + `\r` into the PTY (`sendInput`,
`playlist-runner.ts:165-167`). Multi-entry runs prime the meta (base) agent the same way
(`primeMetaAgent`, `playlist-runner.ts:215`). State persists in `WatchRunStore`
(`~/.manifold/watch-runs.json`, work dirs under `~/.manifold/watch-runs/<runId>/`).

**Support (main):** `yt-dlp-fetcher.ts` lazily downloads the platform binary to
`~/.manifold/bin` over `node:https`; `binary-installer.ts` installs ffmpeg via brew;
`setup-detector.ts` caches a binaries/API-key status check; `peek.ts` fetches metadata +
thumbnails without downloading; `frame-reader.ts` returns sandbox-checked frame data-URLs;
`skill-installer.ts` installs `resources/skills/watch/` into `~/.claude/plugins/cache/` (and
Codex) with a version+content-hash fingerprint, called at app startup (`app-lifecycle.ts:60`).

**IPC:** 9 invoke channels + 2 push channels (`watch:*`) in `watch-handlers.ts`, whitelisted in
`src/preload/index.ts:119-127, 178-179`; types in `src/shared/watch-types.ts`.

**Renderer:** `WatchPanel` registered in `INTERNAL_PANELS`
(`src/renderer/plugins/internal-contributions.ts:39`) — the slot loop vacated in its Phase C.
Hooks: `useWatchPanel`, `useWatchPanelActions`, `useWatchUrlPreview`, `watchPanelStore`
(localStorage URL persistence + progress-event listener), `watch-preview-cache` (localStorage).
"Open agent" uses the dock's `openSiblingPanel` (`useDockLayout.ts:158`) with
`siblingPanelId()` (`agent-siblings.ts`). "Improve prompt" calls the `git:ai-generate` IPC.
`WatchActivePlayer` embeds `https://www.youtube.com/embed/<id>` in an iframe.

## What plugins already can do (no work needed)

The plugin host (`utilityProcess`) has full Node — the require interceptor
(`src/plugin-host/require-interceptor.ts`) only swaps `manifold`/`vscode`. So `fetch`
(transcriber), `node:https` (yt-dlp fetch), `child_process` (ffmpeg/yt-dlp/brew), and `fs`
(run store, skill installer, report files) all port verbatim. Webview CSP already allows
`img-src data: blob: https:` (`webview-protocol.ts:100`) — frame data-URLs and thumbnail URLs
work. Vitest already runs `resources/plugins/**` tests.

## The three gaps, and decisions made

1. **Sibling-session control.** `manifold.agents` only offers `getAgent().runTurn()`. Watch
   needs create/kill/raw-PTY-input/ready-detection/reveal. → **New builtin-only capability
   `agent:spawn`** (decided over folding into `agent:control` for granularity, and over a
   `runTurn` rework for behavior parity).
2. **YouTube embed.** Webview CSP is `default-src 'none'` with no `frame-src`. → **Manifest
   `frameSources` on view contributions**, widening `frame-src` per-view (decided over dropping
   the player and over a global CSP change).
3. **Transcription settings.** Keys live in core `settingsStore.getSettings().transcription`
   (`AiServiceSettings`), shared with verdict-recorder and prompt-summarizer, so they stay
   core. → **New builtin-only capability `transcription:read`** exposing a read-only getter
   (decided over a core transcribe RPC and over plugin-owned duplicate config).

---

## PR 1 — Plugin-system extensions (no watch changes)

All three follow the established Phase-A pattern: capability enum entry
(`src/shared/plugins/manifest.ts`) → host-side lazy-getter gate
(`src/plugin-host/gated-api.ts`) → main-side builtin re-validation at the trust boundary
(`extension-host.ts:73` style).

### 1a. `agent:spawn` capability (builtin-only)

`manifold.agents` gains, when the capability is granted:

```ts
spawnSibling(baseSessionId: string, opts?: { title?: string; groupId?: string }): Promise<AgentSession>
```

Main-side derives `projectId`/`runtimeId`/`existingWorktreePath` from the base session — the
plugin never handles raw project internals. `title` maps to the `prompt` label
(`playlist-runner.ts:101`). Spawned (and, with this capability, looked-up) `AgentSession`s gain:

- `sendText(text: string): Promise<void>` — raw `sessionManager.sendInput` passthrough. The
  plugin keeps its own typing rhythm (text, 400 ms delay, `\r`), preserving exact PTY behavior.
- `whenReady(timeoutMs?: number): Promise<boolean>` — main-side poll for
  `status === 'waiting'` (the TUI-prompt heuristic); resolves `false` on timeout (caller
  proceeds, matching today's non-fatal timeout).
- `getStatus(): Promise<'running' | 'waiting' | 'done' | 'missing'>` — liveness checks
  (base-session preflight, mid-run sibling checks).
- `kill(): Promise<void>` — best-effort `killSession`.
- `reveal(title?: string): Promise<void>` — main pushes a new `plugins:reveal-session`
  event to the renderer; `useDockLayout` listens and calls its existing
  `openSiblingPanel(sessionId, title)`. Replaces the Watch "Open agent" button's direct dock
  access.

Implementation: new `src/main/plugins/agent-spawn-service.ts` beside
`agent-control-service.ts`, wrapping `SessionManager.createSession/killSession/sendInput/
getSession`; wired into the `HOST_AGENTS` RPC service in `extension-host.ts` with
`assertBuiltin` on every method; host-side surface in `src/plugin-host/agents-api.ts` gated on
the declared capability.

### 1b. `transcription:read` capability (builtin-only)

New namespace `manifold.transcription` with one method:

```ts
get(): Promise<AiServiceSettings>   // core settingsStore.getSettings().transcription
```

No change event — watch reads per-run (`playlist-runner.ts`) and on demand for setup status;
the webview re-requests setup status on its own triggers today. PR 1 moves the
`AiServiceSettings` definition (today in `src/shared/watch-types.ts:3`) to
`src/shared/plugins/api-types.ts`; `watch-types.ts` re-exports it so every existing import
keeps working, and the deprecated `TranscriptionSettings` alias stays put until PR 3.

### 1c. Manifest `frameSources` on view contributions

`contributes.views[].frameSources?: string[]` — validated in `manifest.ts` as
`https://`-origin strings (no paths, no wildcards; reject otherwise, consistent with the
strict capability validation). Flow: scanner → manifest → plugin-manager registers view
metadata → webview content store keeps `frameSources` per viewId → `buildCsp(nonce,
frameSources?)` appends `frame-src <origins>` only when non-empty. Views without the field get
today's CSP byte-for-byte.

### PR 1 tests & docs

- `agent-spawn-service.test.ts` with a fake `SessionManager` (createSession failure cleanup,
  whenReady timeout, sendText passthrough, builtin gating).
- Gated-api tests: capability missing → `CapabilityError`; non-builtin → restricted.
- Manifest tests: valid/invalid `frameSources`.
- `webview-protocol` tests: CSP with/without frame sources.
- Docs: `docs/architecture/plugins.md` + `plugin-api.md` updated in the same PR.

---

## PR 2 — `resources/plugins/manifold.watch/` (coexists with builtin)

### Structure (mirrors `manifold.loop`)

```
resources/plugins/manifold.watch/
├── package.json
├── src/
│   ├── plugin.ts            # activate(): deps wiring, view provider, commands, skill install
│   ├── pipeline.ts ─┬─ ported ~verbatim with their tests:
│   │   downloader.ts, frame-extractor.ts, transcriber.ts, vtt-parser.ts,
│   │   yt-dlp-fetcher.ts, binary-installer.ts, peek.ts, setup-detector.ts,
│   │   frame-reader.ts, run-store.ts, skill-installer.ts, resource-path.ts, types.ts
│   ├── playlist-runner.ts   # SessionManager → manifold.agents (spawnSibling/sendText/whenReady/kill)
│   ├── webview-host.ts      # provider + HostMsg/WebviewMsg bridge (loop pattern)
│   └── webview/             # React UI ported from src/renderer/components/watch + hooks
└── out/                     # esbuild artifacts (plugin.js, webview.js) via scripts/build-plugins.mjs
```

### Manifest

- `capabilities: ["agent:spawn", "transcription:read", "lm", "workspace:read", "storage"]`
- View: `{ id: "manifold.watch.panel", title: "Watch (plugin)", launcher: true,
  frameSources: ["https://www.youtube.com"] }`
- Activation: `onView:manifold.watch.panel` + commands.

### What changes in the port (everything else is file moves + import fixes)

- **IPC → message protocol.** The 9 invoke + 2 push channels become typed `HostMsg`/`WebviewMsg`
  over the webview bridge (loop's `protocol.ts` pattern): `ready→init`, `peek`, `peekPlaylist`,
  `runPlaylist`, `stop`, `installBinaries` (+ progress stream), `readFrame`, `setupStatus`,
  `setUrl`, `revealAgent`, `improvePrompt`; pushes: `playlistProgress`, `installProgress`.
  Request/response pairs carry a correlation id (loop's single-flight pattern, generalized).
- **State.** `watchPanelStore`'s localStorage URL persistence and `watch-preview-cache` move to
  `manifold.storage.global`, delivered to the webview in `init`. `run-store.ts` keeps its
  on-disk format (`~/.manifold/watch-runs.json`, `~/.manifold/watch-runs/`) — existing run
  state survives unchanged, like loop's iteration logs.
- **"Improve prompt".** `git:ai-generate` IPC → `manifold.lm` (loop's `improveWithAi`
  precedent).
- **"Open agent".** Dock call → `AgentSession.reveal()` (1a).
- **Skill install.** Moves from app startup into `activate()` — the fingerprint check makes it
  idempotent, and runs only start from the panel, so activation always precedes need. The
  builtin's startup install keeps running during coexistence; same fingerprint → no conflict.
  The plugin reads the skill from its own bundled copy (`<pluginRoot>/skills/watch`,
  via `context.pluginUri`) — added in this PR; `resources/skills/watch/` stays untouched until
  PR 3.
- **Cancellation.** The panel-close AbortSignal becomes a `stop` message + `AbortController`
  in the plugin backend.
- **Transcription settings.** `deps.getTranscription()` → `manifold.transcription.get()`.

### Coexistence & parity

Builtin watch is untouched. Both panels appear in the launcher ("Watch" / "Watch (plugin)").
Manual parity pass before PR 3: peek + playlist preview, single video and playlist runs,
sibling spawn + `/watch:watch` typing, meta-agent priming, frames + lightbox, YouTube embed,
binary install flow, prompt improvement, run-state restore across app restart.

---

## PR 3 — Remove the builtin (loop Phase-C playbook)

**Delete:** `src/main/watch/` (entire dir), `src/main/ipc/watch-handlers.ts`,
`src/renderer/components/watch/` (entire dir), renderer hooks (`useWatchPanel`,
`useWatchPanelActions`, `useWatchUrlPreview`, `watchPanelStore`, `watch-preview-cache`,
`watch-state-equality`).

**Edit:**
- `src/main/app/index.ts` — drop `WatchRunStore` import/instantiation and the IPC dep.
- `src/main/app/ipc-handlers.ts` — drop `registerWatchHandlers`.
- `src/main/app/app-lifecycle.ts` — drop the startup skill install (now in plugin activate).
- `src/main/ipc/types.ts` — drop watch deps.
- `src/preload/index.ts` — drop the 9 `watch:*` invoke + 2 receive channels.
- `src/renderer/plugins/internal-contributions.ts` — drop the `watch` entry.
- Dock layout: drop `watch` from `PANEL_IDS`/`PANEL_TITLES`/`PANEL_RESTORE_HINTS`
  (`dock-layout-helpers.ts:13,26,41`), `StatusBar.tsx` label; verify the layout sanitizer
  drops saved `watch` panel ids (as it did for loop).
- `src/shared/watch-types.ts` — watch-only types move into the plugin;
  `AiServiceSettings`/aliases stay core (settings UI, verdict-recorder, prompt-summarizer) —
  re-homed per PR 1's type move.
- `package.json` — drop the `resources/skills/watch → skills/watch` extraResources entry
  (plugins dir is already bundled).
- Tests that enumerate panels (`internal-contributions.test.ts`,
  `dock-panels.contributions.test.tsx`) — updated expectations.

**Move:** `resources/skills/watch/` → `resources/plugins/manifold.watch/skills/watch/`
(delete the old path; `getBundledWatchSkillPath` logic lives on in the plugin's
`resource-path.ts` pointing at `context.pluginUri`).

**Retitle:** view `"Watch (plugin)"` → `"Watch"`; description updated. Watch then appears
exactly once in the launcher, served by the plugin.

**Migration:** none required. Run state (`~/.manifold/watch-runs.json`), binaries
(`~/.manifold/bin`), and installed skills (fingerprint-matched) all carry over because formats
and paths are unchanged. localStorage URL/preview cache is not migrated (cosmetic; users
re-enter a URL once).

---

## Testing strategy

- Baseline before each PR; full suite + `npm run typecheck:web` / `typecheck:node` after
  (baselines: web 53, node 21 — not zero).
- PR 1: unit tests listed above; no behavior change anywhere else.
- PR 2: ported module tests run from `resources/plugins/manifold.watch/**`; `webview-host`
  tests modeled on loop's; manual parity checklist (above).
- PR 3: full suite; grep-clean for `watch:` channels, `from '../watch/`, `WatchPanel`;
  launcher shows exactly one Watch.

## Docs (wiki rules — same PR as the code)

- PR 1: `plugins.md`, `plugin-api.md`.
- PR 2: `docs/architecture/watch.md` notes the coexisting plugin.
- PR 3: `watch.md` rewritten with `covers:` rebound to `resources/plugins/manifold.watch/`;
  `bash scripts/wiki-lint.sh` clean.

## Risks

- **PTY-typing timing now crosses the RPC boundary.** Semantics identical; RPC latency (≪ the
  250 ms ready-poll and 400 ms input delay) is noise. The `whenReady` poll moves main-side, so
  no chatty cross-process polling.
- **YouTube embed inside the sandboxed iframe** is the one thing unit tests can't prove —
  manual verification is a PR 2 gate (nested-iframe behavior under the `manifold-webview`
  scheme).
- **Webview localStorage is unavailable/unreliable** under the custom scheme — designed around
  by moving persistence to `storage.global` (loop precedent).
- **Rollback:** PR 2 is purely additive; PR 3 lands only after the parity pass.

## Out of scope

- Reworking sibling driving onto `runTurn` semantics.
- Untrusted-plugin hardening of `frameSources`/key access beyond builtin gating (revisit with
  the existing `style-src` TODO in `webview-protocol.ts:104` when third-party plugins arrive).
- Changing the transcription settings UI or `AiServiceSettings` consumers.
