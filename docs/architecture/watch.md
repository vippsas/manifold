---
description: The manifold.watch plugin — a webview Watch panel whose host-side facade downloads a video, extracts auto-scaled frames, builds a timestamped transcript, and types /watch:watch into the user's own agent.
covers: [resources/plugins/manifold.watch]
updated: 2026-06-11
owner: see .github/CODEOWNERS
---

# Watch — the video-analysis plugin

*Watch* turns a single video URL (or local file) into a markdown **report** an agent can
read: a list of auto-scaled JPEG frames with absolute timestamps plus a timestamped
transcript. Since the Phase 3 removal of the builtin (`src/main/watch` + the `watch:*`
IPC surface), Watch lives entirely in the built-in plugin `manifold.watch`: the pipeline
runs in the plugin host process behind a `WatchFacade`, the panel is a sandboxed webview
registered as `manifold.watch.panel`, and the finished report is handed to the **user's
own agent** — the run ends by typing `/watch:watch "<workDir>" <prompt>` into the base
session's PTY through the `manifold.agents` API (capability `agent:spawn`). Playlist
fan-out and sibling agents were removed; one video, one run, one agent. The heavy lifting
still uses external binaries — `yt-dlp` for download and subtitles, `ffmpeg`/`ffprobe`
for frames, audio, and metadata.

## Covered code

Plugin root: `resources/plugins/manifold.watch/` (manifest in `package.json`; compiled by
`scripts/build-plugins.mjs` to `out/plugin.js` + `out/webview.js`).

- `src/plugin.ts` — `activate()`: installs the bundled skill, builds the facade, registers the `manifold.watch.panel` webview provider, refreshes on active-session change.
- `src/facade.ts` — `createWatchFacade()`: implements `WatchFacade` over the `manifold` API; `createAgentPort()` narrows `manifold.agents` to the runner's `AgentPort` (status/sendText/whenReady only); single-key persistence via `storage.global`.
- `src/webview-host.ts` — `createWebviewHost()`: inlines the webview bundle into HTML, dispatches `WebviewMsg` → facade calls → `HostMsg` replies, owns the per-session in-flight run map (`AbortController` + last stage) so runs survive webview reloads.
- `src/webview/` — the panel UI (React, bundled as a browser IIFE): `protocol.ts` (the typed message set), `use-watch-bridge.ts` (postMessage bridge), `watch-panel-store.ts` (per-session state), `components/WatchPanel.tsx` and friends.
- `src/pipeline.ts` — `runWatchPipeline()`, the four-stage orchestrator (download → frames → transcribe → report) and the `renderReport()` markdown writer.
- `src/video-runner.ts` — `runWatchVideo()`: one pipeline run, then the `/watch:watch` command typed into the base agent through an `AgentPort`.
- `src/downloader.ts` / `frame-extractor.ts` / `transcriber.ts` / `vtt-parser.ts` / `yt-dlp-fetcher.ts` — the pipeline stages: yt-dlp fetch, ffprobe/ffmpeg frame extraction with auto-fps budgets, `gpt-4o-transcribe` audio transcription, native-caption VTT parsing, lazy yt-dlp install into `~/.manifold/bin`.
- `src/run-store.ts` — `WatchRunStore`: persists one run per session (status/frames/workDir) to `~/.manifold/watch-runs.json`, evicts old runs and their frame dirs.
- `src/peek.ts` — `peekVideo()`: pre-run metadata + thumbnail probe (no download); rejects playlist URLs.
- `src/frame-reader.ts` — `readFrameAsDataUrl()`: sandboxed frame → data-URL read for the webview.
- `src/setup-detector.ts` / `binary-installer.ts` — cached ffmpeg/yt-dlp/brew + provider check; `ffmpeg` brew install.
- `src/skill-installer.ts` / `resource-path.ts` — fingerprint-checked install of the bundled skill into `~/.claude` (and `~/.codex` when present); skill-path resolution.
- `skills/watch/` — the bundled `watch` Claude Code skill, the consumer of `report.md`.
- `src/types.ts` holds the internal pipeline types; `src/shared-types.ts` the panel-facing shapes (`WatchSessionSnapshot`, `WatchVideoRunResult`, …), `DEFAULT_WATCH_QUESTION` (shared by host fallback and the webview's prompt box), and an inlined copy of `AiServiceSettings` (the plugin cannot import app `src/` modules, `shared-types.ts:1`).

## How it works

**Activation.** `activate()` (`plugin.ts:13`) fires on `onView:manifold.watch.panel`. It
first installs the bundled skill — `installWatchSkills({ sourceDir: getBundledWatchSkillPath(context.pluginUri) })`
(`plugin.ts:16`, `resource-path.ts:4`), fingerprint-checked so it is idempotent
(`skill-installer.ts:24`) — because the user's agent must be able to run `/watch:watch`
before any run starts. It then wires `createWatchFacade(manifold)` into
`createWebviewHost` and registers the provider for `manifold.watch.panel`
(`plugin.ts:24`); `workspace.onDidChangeActiveSession` re-sends the init snapshot
(`plugin.ts:25`).

**Webview protocol.** The host inlines `out/webview.js` into a minimal HTML document
(`buildWebviewHtml`, `webview-host.ts:49`, neutralizing `</script>`) and dispatches
incoming messages through the `isWebviewMsg` runtime guard (`webview-host.ts:154`,
`webview/protocol.ts:59` — webview input is a trust boundary). `WebviewMsg`
(`protocol.ts:17`) covers `ready`/`peek`/`run`/`stop`/`installBinaries`/`readFrame`/
`setupStatus`/`setUrl`/`improvePrompt`/`persist`. Request/response pairs are
reqId-correlated `HostMsg`s (`protocol.ts:30`); run events are **sessionId-tagged**
instead — the run outlives the webview document (panel remounts on agent switches), so
`runProgress`/`runResult` carry the owning session id and the webview folds them into its
per-session store.

**Run state survives webview reloads.** Switching agents remounts the plugin iframe and
destroys all webview state. The host therefore owns the in-flight run: a
`Map<sessionId, { ctrl, lastStage }>` (`webview-host.ts:71`, `:60`) created per `run`
message (`runVideo`, `webview-host.ts:89`; second run for the same session → rejected
`runResult`). On `ready` the host posts `init` with the active session id, run-store
snapshot, setup status, persisted UI state, **and** `running`/`lastStage` for the active
session (`sendInit`, `webview-host.ts:75`) — the webview restores its busy UI from that
(`watch-panel-store.hydrateSession`, `webview/watch-panel-store.ts:99`). `stop` aborts
the active session's controller (`webview-host.ts:124`); a persisted `processing` run
without a live controller means the plugin host died mid-run and is surfaced as idle, not
a forever-spinner (`watch-panel-store.ts:99` doc comment).

**The facade.** `createWatchFacade()` (`facade.ts:59`) binds the ported pipeline modules
onto the gated `manifold` API. The run store is a lazy singleton over the same
`~/.manifold/watch-runs.json` the builtin used (`facade.ts:62-64`). Transcription settings
come from `manifold.transcription.get()` (capability `transcription:read`), with
`undefined` → `{ provider: 'none' }` (`resolveTranscription`, `facade.ts:55`). UI state
persists under ONE `storage.global` key (`PERSIST_KEY = 'watch.webview-state'`,
`facade.ts:19`) holding a record keyed by the former localStorage keys — `persist()` is
read-modify-write over that blob (`facade.ts:95`). `installBinaries` brews ffmpeg and
installs yt-dlp, clearing the setup cache around the attempt (`facade.ts:124`);
`improvePrompt` sends `IMPROVE_PROMPT_META` + draft through the first `manifold.lm` chat
model (`facade.ts:146`).

**Pipeline.** `runWatchPipeline()` (`pipeline.ts:17`) takes `PipelineOptions`, a
`TranscriptionSettings`, and `PipelineHooks` (`onLog`/`onStage`/`signal`, `pipeline.ts:11`),
picks a working dir (the caller's `workDir` or a fresh `manifold-watch-*` tmp dir it
removes in a `finally`, `pipeline.ts:24`, `:33`), clamps `maxFrames` to 1–100 (default 80,
`pipeline.ts:46`), and runs four stages:

- *Download* — `download()` (`downloader.ts:99`) branches on `isUrl()`: URLs go to `downloadUrl()` (`downloader.ts:41`), which runs yt-dlp with a `height<=720` format (`:51`), `--write-info-json`, and `--write-subs`/`--write-auto-subs` for English VTT; local paths resolve in place (`resolveLocal`, `downloader.ts:18`). `runProcess()` (`downloader.ts:132`) guards the child with a 10-minute watchdog (`DOWNLOAD_TIMEOUT_MS`, `:34`) and the abort signal. The binary comes from `ensureYtDlp()` (`yt-dlp-fetcher.ts:49`): it prefers a `yt-dlp` already on `PATH` via `findYtDlpOnPath()` (`:36`) — a brew/pip yt-dlp is a Python script that starts in ~0.5s, versus the bundled `yt-dlp_macos` PyInstaller onefile's 13–21s macOS cold start that alone can exceed `peek`'s 25s cap — and only falls back to the bundled `~/.manifold/bin/yt-dlp` (cached, or streamed from the latest release, de-duping concurrent installs via a shared `pending` promise, `:28`) when none is on `PATH`.
- *Frames* — `getMetadata()` (`frame-extractor.ts:32`) runs ffprobe; `extractWithAutoFps()` (`frame-extractor.ts:151`) picks fps from a duration→frame-budget table (`autoFps`/`autoFpsFocus`, `:74`/`:85`) clamped to `MAX_FPS = 2.0` (`:9`); `extract()` (`:106`) shells out to ffmpeg (`fps=<fps>,scale=<px>:-2`, `frame_%04d.jpg`), deriving each `timestampSeconds` as `offset + index/fps`. A second pass at `hdResolutionPx` (default 1280) writes `frames-hd/` images keyed back as `hdPath`, best-effort (`pipeline.ts:91-99`, `:111`). The downloaded video is deleted after extraction (`pipeline.ts:116`).
- *Transcript* — captions win: `parseVtt()` (`vtt-parser.ts:11`) + `filterRange()` (`:53`) produce `source: 'captions'` (`pipeline.ts:126`). Only when there are no caption segments *and* the provider isn't `'none'` does `transcribeVideo()` (`transcriber.ts:59`) extract a 16 kHz mono MP3 (`defaultExtractAudio`, `transcriber.ts:21`) and POST it to OpenAI/Azure `gpt-4o-transcribe`; the model returns a text blob, wrapped as a single `t=0` segment (`textToSegments`, `transcriber.ts:147`). Failures are non-fatal — the pipeline proceeds frames-only with `source: 'none'` (`pipeline.ts:120`). `audio.mp3` is removed afterwards (`pipeline.ts:149`).
- *Report* — `renderReport()` (`pipeline.ts:205`) writes `report.md`: metadata header, an explicit "Read each frame path below with the Read tool" instruction with `t=MM:SS` timestamps (`:247`), a fenced transcript from `formatTranscript()` (`vtt-parser.ts:64`), and a sparse-coverage warning for unfocused videos over 10 minutes (`pipeline.ts:234`).

**The video run.** `runWatchVideo()` (`video-runner.ts:55`) drives everything through
`AgentPort` (`video-runner.ts:19`) — the narrow status/sendText/whenReady port that
`createAgentPort()` (`facade.ts:35`) implements over `manifold.agents` (main-side this
lands on the builtin-only `agent:spawn` capability service,
`src/main/plugins/agent-spawn-service.ts`). The runner checks the base session is live,
creates the run's work dir (`~/.manifold/watch-runs/<runId>`), records the run, and runs
the pipeline with the host's abort signal forwarded. When the pipeline finishes, it waits
for the base agent's TUI prompt (`whenReady`, 30 s non-fatal timeout,
`video-runner.ts:100`), types `/watch:watch "<workDir>" <prompt>` (`:96`) — the prompt is
the user's edited text from the panel, falling back to `DEFAULT_WATCH_QUESTION`
(`shared-types.ts:28`) when blank — waits 400 ms, sends `\r` (`:102-103`), and marks the
run ready (`:104`). A failed pipeline marks the run errored instead (`:108`).

## Key types and entry points

- `activate(context)` — `plugin.ts:13`. The plugin entry; everything hangs off it.
- `WatchFacade` / `RunVideoRequest` — `webview-host.ts:29` / `:18`. The host↔pipeline contract; implemented by `createWatchFacade()` (`facade.ts:59`), faked in tests.
- `WebviewMsg` / `HostMsg` — `webview/protocol.ts:17` / `:30`. The complete panel protocol; `isWebviewMsg` (`:59`) is the trust-boundary guard.
- `runWatchPipeline()` — `pipeline.ts:17`. Single-video orchestrator; returns `PipelineResult` (`types.ts:54`).
- `runWatchVideo()` — `video-runner.ts:55`. Pipeline + agent hand-off; `AgentPort`/`RunVideoDeps`/`RunVideoOptions` (`video-runner.ts:19`, `:28`, `:34`).
- `WatchRunStore` — `run-store.ts:69`. `getSnapshot`/`setUrl`/`startRun`/`markFrames`/`markReady`/`markError`; `WATCH_RUNS_ROOT` (`run-store.ts:28`).
- `readFrameAsDataUrl()` — `frame-reader.ts:11`. Sandboxed frame read behind the `readFrame` message.
- `installWatchSkills()` — `skill-installer.ts:24`. Fingerprint-matched skill install into `~/.claude` (+ `~/.codex/skills/watch` when codex is detected, `:39`).

## Interactions

- **Plugin host** (`src/main/plugins`, `docs/architecture/plugins.md`): the plugin runs in the forked plugin host; its manifest capabilities are `agent:spawn`, `transcription:read`, `lm`, `workspace:read`, `storage` (`package.json`). The webview is served over the plugin webview protocol; `frameSources: ["https://www.youtube.com"]` whitelists the embedded player. Each panel remount re-resolves the view; the plugin host replaces the view's listener set per resolve (`src/plugin-host/window-api.ts:66`) so remounts never double-handle messages.
- **Agents** (`manifold.agents` → `src/main/plugins/agent-spawn-service.ts`): `getStatus`/`sendText`/`whenReady` back the `/watch:watch` hand-off into the user's own session.
- **Transcription settings** (`manifold.transcription` ← app settings `transcription`): selects captions-vs-transcription and supplies provider keys; the settings UI lives in the app (`src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx`).
- **Language models** (`manifold.lm`): `improvePrompt` rewrites the user's prompt through the default runtime's chat model (`facade.ts:146`).
- **Storage** (`manifold.storage.global`): the panel's persisted UI state, one blob under `watch.webview-state` (`facade.ts:19`).
- **External binaries**: `yt-dlp` (download + captions + peek), `ffmpeg`/`ffprobe` (frames, audio, metadata), `brew` (`binary-installer.ts`, `setup-detector.ts`).
- **The bundled `watch` skill** (`skills/watch/`): the consumer of `report.md`. The pipeline produces the report; the skill (run by the user's agent via `/watch:watch`) reads it and the frame images.

## Invariants & gotchas

- **The host owns the run, not the webview.** The webview document dies on every panel remount; the in-flight `AbortController`, last stage, and the persisted run record all live host-side and are restored through `init.running`/`init.lastStage`/`init.snapshot` (`webview-host.ts:75`). Webview-side `busy` is derived state, never the source of truth.
- **Run events route by sessionId, not reqId.** `runProgress`/`runResult` carry the owning session id (`protocol.ts:30`); the per-session store applies them even when another session is active (`watch-panel-store.ts:128`, `:136`).
- **One run per session.** A `run` message while the session already has a live controller is rejected with a `runResult` error (`webview-host.ts:92-95`).
- **Webview input is guarded, not trusted.** Every message from the sandboxed webview passes `isWebviewMsg` before dispatch (`webview-host.ts:154`); don't cast `unknown` to `WebviewMsg`.
- **The prompt is user-visible.** The panel pre-fills the prompt box with `DEFAULT_WATCH_QUESTION` and sends exactly what the user sees (`use-watch-url-preview.ts:47`); the host only falls back to the default when the prompt is blank (`video-runner.ts:77`).
- **Playlists are rejected, not expanded.** `/playlist` URLs error in the webview (`use-watch-url-preview.ts:20`), and `peekVideo` rejects a playlist dump (`peek.ts:37`); `--no-playlist` resolves `watch?v=…&list=…` URLs to the single video.
- **Frame reads are sandboxed.** `readFrameAsDataUrl()` only serves `.jpg/.jpeg/.png` under the `manifold-watch-` tmp prefix or `WATCH_RUNS_ROOT`, throwing `FramePathError` otherwise (`frame-reader.ts:6`, `:9`) — the webview can't read arbitrary paths.
- **Captions win over transcription.** Transcription only runs when caption segments are empty *and* the provider isn't `'none'` (`pipeline.ts:133`); a video with native subs never hits the paid API. `gpt-4o-transcribe` loses timing — one `t=0` segment (`transcriber.ts:147`).
- **Transcript failure is non-fatal; download/frame failure is not.** Caption-parse and transcription errors downgrade to `source: 'none'`; a failed download or extraction rejects the whole pipeline.
- **fps is hard-capped at 2.0.** Even `fpsOverride` is clamped to `MAX_FPS` (`frame-extractor.ts:170`); frame timestamps are derived (`offset + index/fps`), never probed from the JPEGs.
- **Typing into the agent waits for its prompt.** The runner waits for status `waiting` (30 s, non-fatal) and inserts a 400 ms delay before `\r` so the command isn't swallowed by the welcome banner or mid-turn output (`video-runner.ts:100-103`).
- **Run retention is bounded and destructive.** `WatchRunStore` keeps at most `MAX_RETAINED_RUNS = 20` runs; eviction `rmSync`s the run's frame dir (`run-store.ts:32`, `:161-179`) and never evicts a session's active run. An unreadable state file flips the store read-only; a corrupt one is renamed `.corrupt.<ts>` before resetting (`run-store.ts:226`, `:246`). Runs written by the retired playlist format are dropped (with their frame dirs) on load (`run-store.ts:233-241`).
- **Persisted state shares the builtin's disk.** The plugin reuses `~/.manifold/watch-runs.json`, `~/.manifold/bin`, and the fingerprint-matched skill installs. Saved dock layouts containing the old `watch` panel id are sanitized away by the app (`src/renderer/hooks/dock-layout/dock-layout-sanitize.ts`).
- **The plugin is self-contained.** It cannot import app `src/` modules — shared shapes are inlined in `shared-types.ts`; the skill ships inside the plugin (`skills/watch/`), not in app resources.
