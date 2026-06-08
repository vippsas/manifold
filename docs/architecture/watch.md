---
description: How Manifold's Watch feature downloads a video, extracts auto-scaled frames, builds a timestamped transcript, and assembles the markdown report the Watch panel/skill reads.
covers: [src/main/watch]
updated: 2026-06-08
owner: see .github/CODEOWNERS
---

# Watch — video → frames + transcript → report

*Watch* turns a video URL (or local file) into a markdown **report** an agent can read:
a list of auto-scaled JPEG frames with absolute timestamps plus a timestamped transcript.
The heavy lifting runs in the main process via external binaries — `yt-dlp` for download
and subtitles, `ffmpeg`/`ffprobe` for frames, audio, and metadata — orchestrated by a
linear pipeline. A separate playlist runner fans the pipeline out across sibling agents.
The report is consumed by the bundled `watch` Claude Code skill and the Watch panel; this
subsystem produces it, it does not read it.

## Covered code

- `src/main/watch/pipeline.ts` — `runWatchPipeline()`, the four-stage orchestrator (download → frames → transcribe → report) and the `renderReport()` markdown writer.
- `src/main/watch/downloader.ts` — `download()`/`downloadUrl()`/`resolveLocal()`: yt-dlp fetch (video + info.json + VTT subs) or local-file passthrough.
- `src/main/watch/frame-extractor.ts` — `getMetadata()` (ffprobe), `autoFps`/`autoFpsFocus` budgets, `extract()`/`extractWithAutoFps()` (ffmpeg), and `formatTime()`.
- `src/main/watch/transcriber.ts` — `transcribeVideo()`: extract mono MP3 with ffmpeg, POST to OpenAI/Azure `gpt-4o-transcribe`.
- `src/main/watch/vtt-parser.ts` — `parseVtt()`, `filterRange()`, `formatTranscript()`: native-caption path.
- `src/main/watch/yt-dlp-fetcher.ts` — `ensureYtDlp()`: lazily downloads the platform yt-dlp binary into `~/.manifold/bin`.
- `src/main/watch/playlist-runner.ts` — `runWatchPlaylist()`: per-entry pipelines across sibling agents with a concurrency cap, plus the meta-agent primer.
- `src/main/watch/run-store.ts` — `WatchRunStore`: persists per-session run/entry state to `~/.manifold/watch-runs.json`, evicts old runs and their frame dirs.
- `src/main/watch/peek.ts` — `peekVideo()`/`peekPlaylist()`: pre-run metadata + thumbnail probe (no download).
- `src/main/watch/frame-reader.ts` — `readFrameAsDataUrl()`: sandboxed frame → data-URL read for the renderer.
- `src/main/watch/setup-detector.ts` — `detectWatchSetup()`: cached check for ffmpeg/yt-dlp/brew + transcription provider.
- `src/main/watch/binary-installer.ts` / `skill-installer.ts` / `resource-path.ts` / `runner.ts` — `ffmpeg` brew install, bundled-skill install, skill-path resolution, and `DEFAULT_WATCH_QUESTION`.

`types.ts` holds the internal pipeline types; the IPC-facing shapes live in `src/shared/watch-types.ts`.

## How it works

`runWatchPipeline()` (`pipeline.ts:16`) is the single-video entry point. It takes
`PipelineOptions`, a `TranscriptionSettings`, and optional `PipelineHooks` (`onLog`,
`onStage`), picks a working dir (the caller's `workDir` or a fresh
`manifold-watch-*` tmp dir), clamps `maxFrames` to 1–100, and runs four stages.

**Download.** `download()` (`downloader.ts:96`) branches on `isUrl()`: a URL goes to
`downloadUrl()` (`downloader.ts:38`), which invokes yt-dlp with a `height<=720` format,
`--merge-output-format mp4`, `--write-info-json`, and `--write-subs`/`--write-auto-subs`
for English VTT captions, then picks the produced video and subtitle files
(`pickVideo`/`pickSubtitle`). A non-URL source is resolved in place by `resolveLocal()`
(`downloader.ts:18`) with `subtitlePath: null`. The yt-dlp binary itself is resolved by
`ensureYtDlp()` (`yt-dlp-fetcher.ts:29`), which returns the cached binary at
`~/.manifold/bin/yt-dlp` or streams the platform asset from the yt-dlp latest release,
de-duping concurrent installs via a shared `pending` promise.

**Frames.** `getMetadata()` (`frame-extractor.ts:32`) runs `ffprobe` for duration,
dimensions, codec, and audio presence. `runWatchPipeline` then validates the optional
`startSeconds`/`endSeconds` focus range and calls `extractWithAutoFps()`
(`frame-extractor.ts:151`). The fps is chosen by `autoFps()` (full video) or
`autoFpsFocus()` (a focus range) from a duration→frame-budget table, divided by duration
and clamped to `MAX_FPS = 2.0` (`frame-extractor.ts:9`, `:68`); an explicit `fpsOverride`
bypasses the table. `extract()` (`frame-extractor.ts:106`) shells out to ffmpeg with
`-vf fps=<fps>,scale=<resolutionPx>:-2` (width-locked, even-height auto-scale), `-frames:v`
capped at `maxFrames`, writing `frame_%04d.jpg`; each frame's `timestampSeconds` is computed
as `offset + index/fps`. When `hdResolutionPx > resolutionPx`, a second `extract()` pass at
the same fps produces higher-res `frames-hd` images keyed back onto each frame as `hdPath`
(best-effort — failure only logs) (`pipeline.ts:72`).

**Transcript.** If yt-dlp produced subtitles, `parseVtt()` (`vtt-parser.ts:11`) parses the
VTT cues (stripping tags, de-duplicating rolling-caption repeats) and, for a focus range,
`filterRange()` (`vtt-parser.ts:53`) keeps overlapping segments; source is `'captions'`. If
there are no caption segments and the provider isn't `'none'`, `transcribeVideo()`
(`transcriber.ts:59`) extracts a 16 kHz mono MP3 via ffmpeg (`defaultExtractAudio`,
`transcriber.ts:21`) and POSTs it to OpenAI or Azure `gpt-4o-transcribe`. Because that model
returns only a text blob, `textToSegments()` (`transcriber.ts:147`) wraps the whole text as
a single `t=0` segment. Any transcript failure is caught and logged; the pipeline proceeds
frames-only with `source: 'none'`.

**Report.** `renderReport()` (`pipeline.ts:178`) writes `report.md` into the work dir: a
metadata header (source, title, duration, focus range, frame count/fps/size, transcript
source), an explicit instruction to **Read each listed frame path** with `t=MM:SS` absolute
timestamps, and a fenced transcript block from `formatTranscript()` (`vtt-parser.ts:64`).
For unfocused videos over 10 minutes it injects a sparse-coverage accuracy warning. The
function returns a `PipelineResult` carrying `reportPath`, `framesDir`, enriched `frames`,
`metadata`, `transcript`, and the focus window.

**Playlist fan-out.** `runWatchPlaylist()` (`playlist-runner.ts:51`) spawns one sibling
agent per entry up front (sharing the base session's worktree), optionally primes the base
"meta" agent with where sibling answers will land (`primeMetaAgent`, `playlist-runner.ts:203`),
then runs the entry pipelines through a worker pool capped at `PIPELINE_CONCURRENCY = 3`
(`playlist-runner.ts:16`, `:127`). As each pipeline finishes it waits for the sibling's TUI
prompt (`waitUntilSiblingReady`, `:192`), types a `/watch:watch "<workDir>" <question>` slash
command (the question defaults to `DEFAULT_WATCH_QUESTION`, `runner.ts:1`) augmented with a
"save your answer to `sibling-N.md`" instruction, and records progress in the run store.

## Key types and entry points

- `runWatchPipeline()` — `pipeline.ts:16`. Single-video orchestrator; returns `PipelineResult` (`types.ts:54`).
- `PipelineOptions` / `PipelineHooks` — `types.ts:43` / `pipeline.ts:11`. Source, focus range, frame budget, resolution; `onLog`/`onStage` callbacks.
- `download()` — `downloader.ts:96`. URL → yt-dlp, local path → passthrough; yields `DownloadResult` (`types.ts:9`).
- `extractWithAutoFps()` — `frame-extractor.ts:151`. Auto-fps decision + ffmpeg extraction → `FrameExtractionResult` (`types.ts:36`).
- `transcribeVideo()` — `transcriber.ts:59`. Audio extraction + provider POST; `TranscriberError`/`MissingKeyError` for failure modes.
- `runWatchPlaylist()` — `playlist-runner.ts:51`. Multi-entry fan-out; `RunPlaylistDeps`/`RunPlaylistOptions` (`playlist-runner.ts:22`, `:28`).
- `WatchRunStore` — `run-store.ts:54`. `getSnapshot`/`setUrl`/`startRun`/`markEntry*`; `WATCH_RUNS_ROOT` (`run-store.ts:15`).
- `readFrameAsDataUrl()` — `frame-reader.ts:11`. Sandboxed frame read for `watch:read-frame`.

## Interactions

- **IPC** (`src/main/ipc/watch-handlers.ts`): `watch:setup-status` → `detectWatchSetup`, `watch:install-binaries` → `ensureBinaries` + `ensureYtDlp` (`:87`), `watch:install-skills` → `installWatchSkills`, `watch:read-frame` → `readFrameAsDataUrl`, `watch:peek`/`watch:peek-playlist` → `peek.ts`, `watch:state-get`/`watch:state-set-url` → `WatchRunStore`, and `watch:run-playlist` → `runWatchPlaylist` (`:51`), which streams `watch:playlist-progress` events (`log`/`stage`/`frames`/`sibling`) to the renderer.
- **Sessions** (`src/main/session`): the playlist runner is a heavy consumer of `SessionManager` — `createSession()` for siblings, `getSession`/`hasSession` for liveness, and `sendInput()` to type the slash command into a sibling PTY.
- **External binaries**: `yt-dlp` (download + captions + `peek` metadata), `ffmpeg` (frames in `frame-extractor.ts`, audio in `transcriber.ts`), `ffprobe` (`getMetadata`), and `brew` (`binary-installer.ts`, `setup-detector.ts`).
- **Settings** (`src/main/store`): `settingsStore.getSettings().transcription` supplies the `AiServiceSettings`/`TranscriptionSettings` (`src/shared/watch-types.ts:3`) that select captions-vs-transcription and the provider keys.
- **App lifecycle** (`src/main/app`): `app-lifecycle.ts:57` installs the bundled `watch` skill on startup via `installWatchSkills` + `getBundledWatchSkillPath`; `app/index.ts:82` constructs the singleton `WatchRunStore`.
- **The `watch` skill** (`resources/skills/watch`): the consumer of `report.md`. The pipeline produces the report; the skill (and Watch panel) reads it and the frame images.

## Invariants & gotchas

- **Frame timestamps are derived, not probed.** `extract()` computes `timestampSeconds` as `offset + index/fps` (`frame-extractor.ts:146`), so they assume ffmpeg emits exactly one frame per `1/fps` interval from the seek point. They are not read back from the JPEGs.
- **fps is hard-capped at 2.0.** Even an `fpsOverride` is clamped to `MAX_FPS` (`frame-extractor.ts:170`); high-fps requests silently saturate. The duration→budget tables also cap total frames well under the 100 ceiling for long videos.
- **Captions win over transcription.** Transcription only runs when caption segments are empty *and* the provider isn't `'none'` (`pipeline.ts:109`); a video with native subs never hits the paid API.
- **gpt-4o-transcribe loses timing.** The provider returns one text blob, surfaced as a single `t=0` segment (`transcriber.ts:147`) — so `[00:00]` is the only timestamp in a transcribed (vs captioned) report.
- **Transcript failure is non-fatal; download/frame failure is not.** Subtitle-parse and transcription errors are caught and downgraded to `source: 'none'` (`pipeline.ts:104`, `:119`), but a failed download or frame extraction rejects the whole pipeline.
- **Frame reads are sandboxed.** `readFrameAsDataUrl()` only serves `.jpg/.jpeg/.png` under the `manifold-watch-` tmp prefix or `WATCH_RUNS_ROOT`, throwing `FramePathError` otherwise (`frame-reader.ts:28`) — the renderer can't read arbitrary paths.
- **Run retention is bounded and destructive.** `WatchRunStore` keeps at most `MAX_RETAINED_RUNS = 20` runs, and evicting a run `rmSync`s its frame and aggregate directories (`run-store.ts:163`); it never evicts a session's active run.
- **Store reads fail safe.** An unreadable state file flips the store `readOnly` (writes skipped, no clobber); a corrupt one is renamed to `.corrupt.<ts>` before resetting (`run-store.ts:236`).
- **Siblings are typed into, with timing slack.** The runner waits up to 30 s for a sibling's prompt then proceeds anyway, and inserts a 400 ms delay before sending `\r` so the command isn't swallowed by the welcome banner (`playlist-runner.ts:156`, `:194`).
