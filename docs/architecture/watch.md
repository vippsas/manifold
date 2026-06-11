---
description: The manifold.watch plugin — a webview Watch panel whose host-side facade downloads a video, extracts auto-scaled frames, builds a timestamped transcript, and fans the resulting reports out to sibling agents.
covers: [resources/plugins/manifold.watch]
updated: 2026-06-11
owner: see .github/CODEOWNERS
---

# Watch — the video-analysis plugin

*Watch* turns a video URL (or local file) into a markdown **report** an agent can read:
a list of auto-scaled JPEG frames with absolute timestamps plus a timestamped transcript.
Since the Phase 3 removal of the builtin (`src/main/watch` + the `watch:*` IPC surface),
Watch lives entirely in the built-in plugin `manifold.watch`: the pipeline runs in the
plugin host process behind a `WatchFacade`, the panel is a sandboxed webview registered
as `manifold.watch.panel`, and agent fan-out goes through the `manifold.agents` API
(capability `agent:spawn`) instead of `SessionManager`. The heavy lifting still uses
external binaries — `yt-dlp` for download and subtitles, `ffmpeg`/`ffprobe` for frames,
audio, and metadata.

## Covered code

Plugin root: `resources/plugins/manifold.watch/` (manifest in `package.json`; compiled by
`scripts/build-plugins.mjs` to `out/plugin.js` + `out/webview.js`).

- `src/plugin.ts` — `activate()`: installs the bundled skill, builds the facade, registers the `manifold.watch.panel` webview provider, refreshes on active-session change.
- `src/facade.ts` — `createWatchFacade()`: implements `WatchFacade` over the `manifold` API; `createAgentPort()` narrows `manifold.agents` to the runner's `AgentPort`; single-key persistence via `storage.global`.
- `src/webview-host.ts` — `createWebviewHost()`: inlines the webview bundle into HTML, dispatches `WebviewMsg` → facade calls → `HostMsg` replies, owns the per-run `AbortController`.
- `src/webview/` — the panel UI (React, bundled as a browser IIFE): `protocol.ts` (the typed message set), `use-watch-bridge.ts` (postMessage bridge), `components/WatchPanel.tsx` and friends, ported stores/caches.
- `src/pipeline.ts` — `runWatchPipeline()`, the four-stage orchestrator (download → frames → transcribe → report) and the `renderReport()` markdown writer.
- `src/playlist-runner.ts` — `runWatchPlaylist()`: per-entry pipelines fanned out across sibling agents through an `AgentPort`, plus the meta-agent primer.
- `src/downloader.ts` / `frame-extractor.ts` / `transcriber.ts` / `vtt-parser.ts` / `yt-dlp-fetcher.ts` — the pipeline stages: yt-dlp fetch, ffprobe/ffmpeg frame extraction with auto-fps budgets, `gpt-4o-transcribe` audio transcription, native-caption VTT parsing, lazy yt-dlp install into `~/.manifold/bin`.
- `src/run-store.ts` — `WatchRunStore`: persists per-session run/entry state to `~/.manifold/watch-runs.json`, evicts old runs and their frame dirs.
- `src/peek.ts` — `peekVideo()`/`peekPlaylist()`: pre-run metadata + thumbnail probe (no download).
- `src/frame-reader.ts` — `readFrameAsDataUrl()`: sandboxed frame → data-URL read for the webview.
- `src/setup-detector.ts` / `binary-installer.ts` — cached ffmpeg/yt-dlp/brew + provider check; `ffmpeg` brew install.
- `src/skill-installer.ts` / `resource-path.ts` / `runner.ts` — fingerprint-checked install of the bundled skill into `~/.claude` (and `~/.codex` when present); skill-path resolution; `DEFAULT_WATCH_QUESTION`.
- `skills/watch/` — the bundled `watch` Claude Code skill, the consumer of `report.md`.
- `src/types.ts` holds the internal pipeline types; `src/shared-types.ts` the panel-facing shapes (`WatchSessionSnapshot`, `WatchPlaylistRunResult`, …) plus an inlined copy of `AiServiceSettings` (the plugin cannot import app `src/` modules, `shared-types.ts:1`).

## How it works

**Activation.** `activate()` (`plugin.ts:13`) fires on `onView:manifold.watch.panel`. It
first installs the bundled skill — `installWatchSkills({ sourceDir: getBundledWatchSkillPath(context.pluginUri) })`
(`plugin.ts:16`, `resource-path.ts:4`), fingerprint-checked so it is idempotent
(`skill-installer.ts:35`, `:73`) — because a sibling agent must be able to run
`/watch:watch` before any run starts. It then wires `createWatchFacade(manifold)` into
`createWebviewHost` and registers the provider for `manifold.watch.panel`
(`plugin.ts:24`); `workspace.onDidChangeActiveSession` re-sends the init snapshot
(`plugin.ts:25`).

**Webview protocol.** The host inlines `out/webview.js` into a minimal HTML document
(`buildWebviewHtml`, `webview-host.ts:49`, neutralizing `</script>`) and dispatches
incoming messages through the `isWebviewMsg` runtime guard (`webview-host.ts:136`,
`webview/protocol.ts:51` — webview input is a trust boundary). `WebviewMsg`
(`protocol.ts:17`) covers `ready`/`peek`/`peekPlaylist`/`runPlaylist`/`stop`/
`installBinaries`/`readFrame`/`setupStatus`/`setUrl`/`revealAgent`/`improvePrompt`/
`persist`; replies are reqId-correlated `HostMsg`s (`protocol.ts:32`). On `ready` the host
posts an `init` message with the active session id, run-store snapshot, setup status, and
persisted UI state (`webview-host.ts:70`). The host — not the facade — owns run
cancellation: `runPlaylist` creates an `AbortController` per run (`webview-host.ts:82`)
and `stop` aborts it (`:109`); the facade only ever sees the signal.

**The facade.** `createWatchFacade()` (`facade.ts:68`) binds the ported pipeline modules
onto the gated `manifold` API. The run store is a lazy singleton over the same
`~/.manifold/watch-runs.json` the builtin used (`facade.ts:73`); snapshots are filtered by
live sessions via `manifold.agents.getAgent` (`facade.ts:95`). Transcription settings come
from `manifold.transcription.get()` (capability `transcription:read`), with `undefined` →
`{ provider: 'none' }` (`resolveTranscription`, `facade.ts:64`). UI state persists under
ONE `storage.global` key (`PERSIST_KEY = 'watch.webview-state'`, `facade.ts:19`) holding a
record keyed by the former localStorage keys — `persist()` is read-modify-write over that
blob (`facade.ts:104`). `installBinaries` brews ffmpeg and installs yt-dlp, clearing the
setup cache around the attempt (`facade.ts:137`); `improvePrompt` sends
`IMPROVE_PROMPT_META` + draft through the first `manifold.lm` chat model (`facade.ts:163`).

**Pipeline.** `runWatchPipeline()` (`pipeline.ts:17`) takes `PipelineOptions`, a
`TranscriptionSettings`, and `PipelineHooks` (`onLog`/`onStage`/`signal`, `pipeline.ts:11`),
picks a working dir (the caller's `workDir` or a fresh `manifold-watch-*` tmp dir it
removes in a `finally`, `pipeline.ts:24`, `:33`), clamps `maxFrames` to 1–100 (default 80,
`pipeline.ts:46`), and runs four stages:

- *Download* — `download()` (`downloader.ts:99`) branches on `isUrl()`: URLs go to `downloadUrl()` (`downloader.ts:41`), which runs yt-dlp with a `height<=720` format (`:51`), `--write-info-json`, and `--write-subs`/`--write-auto-subs` for English VTT; local paths resolve in place (`resolveLocal`, `downloader.ts:18`). `runProcess()` (`downloader.ts:132`) guards the child with a 10-minute watchdog (`DOWNLOAD_TIMEOUT_MS`, `:34`) and the abort signal. The binary comes from `ensureYtDlp()` (`yt-dlp-fetcher.ts:49`): it prefers a `yt-dlp` already on `PATH` via `findYtDlpOnPath()` (`:36`) — a brew/pip yt-dlp is a Python script that starts in ~0.5s, versus the bundled `yt-dlp_macos` PyInstaller onefile's 13–21s macOS cold start that alone can exceed `peek`'s 25s cap — and only falls back to the bundled `~/.manifold/bin/yt-dlp` (cached, or streamed from the latest release, de-duping concurrent installs via a shared `pending` promise, `:28`) when none is on `PATH`.
- *Frames* — `getMetadata()` (`frame-extractor.ts:32`) runs ffprobe; `extractWithAutoFps()` (`frame-extractor.ts:151`) picks fps from a duration→frame-budget table (`autoFps`/`autoFpsFocus`, `:74`/`:85`) clamped to `MAX_FPS = 2.0` (`:9`); `extract()` (`:106`) shells out to ffmpeg (`fps=<fps>,scale=<px>:-2`, `frame_%04d.jpg`), deriving each `timestampSeconds` as `offset + index/fps`. A second pass at `hdResolutionPx` (default 1280) writes `frames-hd/` images keyed back as `hdPath`, best-effort (`pipeline.ts:91-99`, `:111`). The downloaded video is deleted after extraction (`pipeline.ts:116`).
- *Transcript* — captions win: `parseVtt()` (`vtt-parser.ts:11`) + `filterRange()` (`:53`) produce `source: 'captions'` (`pipeline.ts:126`). Only when there are no caption segments *and* the provider isn't `'none'` does `transcribeVideo()` (`transcriber.ts:59`) extract a 16 kHz mono MP3 (`defaultExtractAudio`, `transcriber.ts:21`) and POST it to OpenAI/Azure `gpt-4o-transcribe`; the model returns a text blob, wrapped as a single `t=0` segment (`textToSegments`, `transcriber.ts:147`). Failures are non-fatal — the pipeline proceeds frames-only with `source: 'none'` (`pipeline.ts:120`). `audio.mp3` is removed afterwards (`pipeline.ts:149`).
- *Report* — `renderReport()` (`pipeline.ts:205`) writes `report.md`: metadata header, an explicit "Read each frame path below with the Read tool" instruction with `t=MM:SS` timestamps (`:247`), a fenced transcript from `formatTranscript()` (`vtt-parser.ts:64`), and a sparse-coverage warning for unfocused videos over 10 minutes (`pipeline.ts:234`).

**Playlist fan-out.** `runWatchPlaylist()` (`playlist-runner.ts:76`) drives everything
through `AgentPort` (`playlist-runner.ts:23`) — the narrow spawn/status/sendText/whenReady
port that `createAgentPort()` (`facade.ts:35`) implements over `manifold.agents` (main-side
this lands on the builtin-only `agent:spawn` capability service,
`src/main/plugins/agent-spawn-service.ts`). The runner checks the base session is live
(`:84`), creates the run's aggregate + work dirs (`~/.manifold/watch-aggregates/<runId>`,
`~/.manifold/watch-runs/<runId>`, `:92-97`), records the run (`:106`), then spawns one
sibling per entry up front (`:120`), killing already-spawned siblings if a spawn fails
mid-loop (`:131`). Multi-entry runs prime the base "meta" agent with where sibling answers
will land (`primeMetaAgent`, `:225`; skipped for single entries, `:144`). Entry pipelines
run through a worker pool capped at `PIPELINE_CONCURRENCY = 3` (`:15`, `:157`), with the
host's abort signal forwarded into each pipeline (`:167`). As each pipeline finishes, the
runner waits for the sibling's TUI prompt (`whenReady`, 30 s timeout, `:191`), types
`/watch:watch "<workDir>" <question>` augmented with a "save your answer to
`sibling-N.md`" instruction (`:184-187`), waits 400 ms, sends `\r` (`:193-194`), and only
then exposes the sibling to the UI (`markEntrySpawned`/`onEntrySpawned`, `:197-199`). A
failed pipeline kills its never-primed sibling (`:212`).

## Key types and entry points

- `activate(context)` — `plugin.ts:13`. The plugin entry; everything hangs off it.
- `WatchFacade` — `webview-host.ts:27`. The host↔pipeline contract; implemented by `createWatchFacade()` (`facade.ts:68`), faked in tests.
- `WebviewMsg` / `HostMsg` — `webview/protocol.ts:17` / `:32`. The complete panel protocol; `isWebviewMsg` (`:51`) is the trust-boundary guard.
- `runWatchPipeline()` — `pipeline.ts:17`. Single-video orchestrator; returns `PipelineResult` (`types.ts:54`).
- `runWatchPlaylist()` — `playlist-runner.ts:76`. Multi-entry fan-out; `AgentPort`/`SiblingHandle`/`RunPlaylistDeps`/`RunPlaylistOptions` (`playlist-runner.ts:23`, `:34`, `:41`, `:47`).
- `WatchRunStore` — `run-store.ts:68`. `getSnapshot`/`setUrl`/`startRun`/`markEntry*`; `WATCH_RUNS_ROOT` (`run-store.ts:29`).
- `readFrameAsDataUrl()` — `frame-reader.ts:11`. Sandboxed frame read behind the `readFrame` message.
- `installWatchSkills()` — `skill-installer.ts:24`. Fingerprint-matched skill install into `~/.claude` (+ `~/.codex/skills/watch` when codex is detected, `:39`).

## Interactions

- **Plugin host** (`src/main/plugins`, `docs/architecture/plugins.md`): the plugin runs in the forked plugin host; its manifest capabilities are `agent:spawn`, `transcription:read`, `lm`, `workspace:read`, `storage` (`package.json`). The webview is served over the plugin webview protocol; `frameSources: ["https://www.youtube.com"]` whitelists the embedded player.
- **Agents** (`manifold.agents` → `src/main/plugins/agent-spawn-service.ts`): `spawnSibling`/`sendText`/`whenReady`/`getStatus`/`kill` back the playlist fan-out; `reveal` (used by `revealAgent`, `facade.ts:159`) asks the app to open the sibling's dock tab.
- **Transcription settings** (`manifold.transcription` ← app settings `transcription`): selects captions-vs-transcription and supplies provider keys; the settings UI lives in the app (`src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx`).
- **Language models** (`manifold.lm`): `improvePrompt` rewrites the user's question through the default runtime's chat model (`facade.ts:163`).
- **Storage** (`manifold.storage.global`): the panel's persisted UI state, one blob under `watch.webview-state` (`facade.ts:19`).
- **External binaries**: `yt-dlp` (download + captions + peek), `ffmpeg`/`ffprobe` (frames, audio, metadata), `brew` (`binary-installer.ts`, `setup-detector.ts`).
- **The bundled `watch` skill** (`skills/watch/`): the consumer of `report.md`. The pipeline produces the report; the skill (run by each sibling via `/watch:watch`) reads it and the frame images.

## Invariants & gotchas

- **The host owns cancellation.** `webview-host.ts` creates one `AbortController` per run and `stop` aborts it (`webview-host.ts:82`, `:109`); the facade and pipeline only consume the signal. Closing the panel must not orphan a yt-dlp child.
- **Webview input is guarded, not trusted.** Every message from the sandboxed webview passes `isWebviewMsg` before dispatch (`webview-host.ts:136`); don't cast `unknown` to `WebviewMsg`.
- **Frame reads are sandboxed.** `readFrameAsDataUrl()` only serves `.jpg/.jpeg/.png` under the `manifold-watch-` tmp prefix or `WATCH_RUNS_ROOT`, throwing `FramePathError` otherwise (`frame-reader.ts:6`, `:9`) — the webview can't read arbitrary paths.
- **Captions win over transcription.** Transcription only runs when caption segments are empty *and* the provider isn't `'none'` (`pipeline.ts:133`); a video with native subs never hits the paid API. `gpt-4o-transcribe` loses timing — one `t=0` segment (`transcriber.ts:147`).
- **Transcript failure is non-fatal; download/frame failure is not.** Caption-parse and transcription errors downgrade to `source: 'none'`; a failed download or extraction rejects the whole pipeline.
- **fps is hard-capped at 2.0.** Even `fpsOverride` is clamped to `MAX_FPS` (`frame-extractor.ts:170`); frame timestamps are derived (`offset + index/fps`), never probed from the JPEGs.
- **Siblings stay hidden until primed.** `onEntrySpawned` fires only after the `/watch:watch` command has been queued (`playlist-runner.ts:197-199`) — revealing the "Open agent" button earlier would let the user talk to an agent with no watch context. Ready-waits time out non-fatally (30 s) and a 400 ms delay precedes `\r` so input isn't swallowed by the welcome banner (`:16-17`, `:191-194`).
- **Run retention is bounded and destructive.** `WatchRunStore` keeps at most `MAX_RETAINED_RUNS = 20` runs; eviction `rmSync`s the run's frame and aggregate dirs (`run-store.ts:33`, `:185-195`) and never evicts a session's active run. An unreadable state file flips the store read-only; a corrupt one is renamed `.corrupt.<ts>` before resetting (`run-store.ts:259`, `:270`).
- **Persisted state shares the builtin's disk.** The plugin reuses `~/.manifold/watch-runs.json`, `~/.manifold/bin`, and the fingerprint-matched skill installs, so upgrading from the builtin needs no migration. Saved dock layouts containing the old `watch` panel id are sanitized away by the app (`src/renderer/hooks/dock-layout/dock-layout-sanitize.ts`).
- **The plugin is self-contained.** It cannot import app `src/` modules — shared shapes are inlined in `shared-types.ts`; the skill ships inside the plugin (`skills/watch/`), not in app resources.
