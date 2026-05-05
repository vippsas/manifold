# Watch Tab — Design Spec

**Date:** 2026-05-05
**Status:** Approved (pre-implementation)
**Owner:** Sven Malvik

## Summary

Add a **"Watch"** tab to manifold's main tab strip (alongside Agent, Editor, Search, Ideas, Loop). The tab is a launcher that fires `/watch <url> <question>` into the *currently active* agent session. The `/watch` skill (the `claude-video` plugin from `bradautomates/claude-video`) ships bundled inside manifold's app resources and auto-installs into the user's CLI agent skill directories on first launch. The Settings dialog gains a new **Transcription** section for OpenAI or Azure OpenAI Whisper credentials.

## Goals

- Users can launch a video analysis from inside manifold without leaving the app or hand-installing a plugin.
- The skill is bundled by default — no `/plugin marketplace add` step.
- API keys for Whisper (OpenAI or Azure OpenAI) live in a single place: manifold's Settings dialog.
- All actual analysis happens inside the active agent session — manifold itself does not run ffmpeg/yt-dlp/Whisper.

## Non-goals

- History of past analyses, saved boards, or batch/scheduled runs.
- Per-worktree skill copies (we install once, globally per CLI runtime).
- Replacing the host agent's analysis step with a separate `claude -p` call.
- Skill discovery or a generic "Skills" tab — Watch is the only bundled skill in this iteration.

## Approaches considered

| Option | Description | Trade-off |
|---|---|---|
| **1. Global skill install + launcher tab** *(chosen)* | Bundle `/watch` in manifold's app resources. On first launch, copy into `~/.claude/plugins/watch/` (and `~/.codex/skills/watch/` if Codex is present). Tab types `/watch <url> <q>` into the active agent's PTY. | Skill installed once; works in every project. Minimal manifold-side code. Skill stays self-contained and upgradable. |
| 2. Per-worktree skill install | Copy skill into each new worktree's `.claude/skills/`. | Heavier, duplicated files, but isolated per-project. |
| 3. Manifold-direct execution | Manifold runs the pipeline itself, pipes result into the agent. | Sidesteps skill install — but contradicts the chosen scenario where analysis runs inside the agent session. |

## Architecture

### Tab system

The new tab is a dock panel registered alongside the existing `agent`, `editor`, `search`, `backgroundAgent` (Ideas), and `loop` panels.

**Edits to existing files:**
- `src/renderer/hooks/dock-layout-helpers.ts` — add `'watch'` to `PANEL_IDS`; `PANEL_TITLES.watch = 'Watch'`; `PANEL_RESTORE_HINTS.watch = [{ ref: 'editor', dir: 'within' }, { ref: 'agent', dir: 'within' }, { ref: 'loop', dir: 'within' }]`.
- `src/renderer/components/editor/dock-panels.tsx` — register `<WatchPanel />` for the `watch` panel id.
- `src/renderer/hooks/dock-layout-builders.ts` — include `watch` in the default layout (within the main tab group, after `loop`).
- `src/renderer/components/git/StatusBar.tsx` — add `watch: 'Watch'` mapping.

### New renderer components

- **`src/renderer/components/watch/WatchPanel.tsx`** — top-level form:
  - URL/path input (single line)
  - Optional question textarea (multiline, ~3 rows)
  - **Run** button (disabled when no active session, session not running, or URL empty)
  - Footer status row: 4 dots for `ffmpeg`, `yt-dlp`, default agent CLI, transcription key. Hover for hint.
- **`src/renderer/components/watch/WatchPanel.styles.ts`** — co-located styles (project convention).
- **`src/renderer/hooks/useWatchPanel.ts`** — wraps the new IPC: `runWatch(url, q)` and a `setupStatus` value refreshed on tab focus and after settings change.

### IPC channels (new)

Three places must be updated for each channel: `src/main/ipc-handlers.ts` (handler), `src/preload/index.ts` (whitelist), and the renderer hook that calls it.

| Channel | Type | Signature | Purpose |
|---|---|---|---|
| `watch:run` | invoke | `(sessionId: string, url: string, question?: string) => { ok: true } \| { ok: false; error: string }` | Validates inputs, looks up the session's PTY via `PtyPool`, writes `/watch <url> <question>\n` to stdin. |
| `watch:setup-status` | invoke | `() => { ffmpeg: boolean; ytdlp: boolean; claudeCli: boolean; apiKeyKind: 'openai' \| 'azure' \| null }` | Used by the tab footer. |
| `watch:install-skills` | invoke (called once at app start, idempotent) | `() => { installed: string[]; skipped: string[]; errors: string[] }` | Copies bundled skill into user's skill dirs if missing or version-bumped. |

### Main process modules (new)

| File | Responsibility |
|---|---|
| `src/main/watch-skill-installer.ts` | Reads bundled `resources/skills/watch/`, copies into `~/.claude/plugins/watch/` (always) and `~/.codex/skills/watch/` (if `which codex` succeeds). Writes `.manifold-version` marker. Idempotent: skips when the marker matches the bundled version. |
| `src/main/watch-runner.ts` | `runWatch(sessionId, url, question)`: validates the URL/path string, looks up the PTY via `PtyPool`, writes the slash command and a newline to stdin. Returns `{ ok }` or an error string. |
| `src/main/watch-setup-detector.ts` | Probes `which ffmpeg`, `which yt-dlp`, `which claude`. Reads key presence from `~/.config/watch/.env`. Cached for 5 seconds to avoid spamming on tab refocus. |

### Bundled skill resource

- **`resources/skills/watch/`** — vendored copy of the `claude-video` plugin (`commands/`, `scripts/`, `hooks/`, `SKILL.md`, `plugin.json`). Single source of truth — bumped via a one-shot `npm run sync-watch-skill` script that copies from a configurable upstream path (default: `../claude-video/`). The `electron-vite` config must include `resources/` in the production build's extraResources.
- The vendored copy preserves the original `whisper.py` (OpenAI + Groq clients, stdlib HTTP) — no edits needed since users provide the key via Settings, which writes to `~/.config/watch/.env`.
- Azure OpenAI support: the original `whisper.py` only knows OpenAI and Groq. We add an Azure branch in the same file (still stdlib HTTP) — see "Azure OpenAI implementation" below.

### Settings extension

- **`src/shared/settings.ts`** — extend `Settings` type:
  ```ts
  transcription: {
    provider: 'openai' | 'azure' | 'none';
    openaiApiKey?: string;
    azureApiKey?: string;
    azureEndpoint?: string;
    azureDeployment?: string;
  }
  ```
  Default: `{ provider: 'none' }`.
- **`src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx`** (new) — radio for provider plus conditional fields (one set for OpenAI, three for Azure). Wired into `SettingsModal`.
- **`src/main/settings-store.ts`** — on save of the `transcription` block, also write `~/.config/watch/.env` (chmod 0600), where the bundled skill expects them. Format:
  ```
  OPENAI_API_KEY=…
  AZURE_OPENAI_API_KEY=…
  AZURE_OPENAI_ENDPOINT=…
  AZURE_OPENAI_DEPLOYMENT=…
  ```
  Empty/absent keys are omitted.

### Azure OpenAI implementation

The bundled `scripts/whisper.py` ships with OpenAI + Groq clients only. We add an Azure branch:

- Endpoint: `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/audio/transcriptions?api-version=2024-06-01`
- Auth header: `api-key: ${AZURE_OPENAI_API_KEY}`
- Same multipart-form payload as OpenAI Whisper (file + model fields).
- Provider selection precedence in `whisper.py`: `AZURE_OPENAI_API_KEY` → Azure path; else `OPENAI_API_KEY` → OpenAI path; else `GROQ_API_KEY` → Groq path; else fail with "no transcription provider configured".

This change lives inside `resources/skills/watch/scripts/whisper.py` and is part of the vendored copy, not the upstream `claude-video` repo.

### Note on "use `claude -p` for the AI part"

The original `/watch` only calls OpenAI for **Whisper transcription** — the analysis step is handled by the host agent natively (no separate API call). Since the launcher sends `/watch` into the *active agent's PTY*, that agent already serves as the AI engine. No `-p` invocation is needed because the agent is already running interactively. Transcription stays on OpenAI/Azure per the explicit requirement.

If we later want the skill itself to shell out to a separate `claude -p` call for analysis (decoupling from the host agent's vision), we add a `--analyzer` flag to `watch.py`. Out of scope for this iteration.

## Data flow

1. User types URL + (optional) question in Watch tab → clicks **Run**.
2. Renderer invokes `watch:run(activeSessionId, url, q)`.
3. Main process validates inputs, looks up PTY via `PtyPool`, writes `/watch <url> <q>\n` to stdin.
4. The active agent (Claude Code, Codex, or Gemini) sees its `/watch` slash command (installed globally during app startup), runs the bundled `scripts/watch.py`.
5. Script: yt-dlp download → ffmpeg keyframe extraction → captions OR Whisper transcription (OpenAI/Azure key from `~/.config/watch/.env`) → markdown output with frame paths + timestamped transcript.
6. The host agent reads the markdown and answers in its own terminal — user follows along in the Agent tab.

## Error handling

- **`watch:run`** fails fast (and surfaces a toast) when:
  - No active session
  - Active session not in `running` state
  - URL field empty or whitespace-only
  - PTY write throws
- **`watch:setup-status`** returns missing tools as red dots in the tab footer with a one-line install hint (mirrors `setup.py`'s UX). Examples:
  - ffmpeg missing → "Install ffmpeg via Homebrew"
  - yt-dlp missing → "Install yt-dlp via Homebrew"
  - claude CLI missing → "Install Claude Code"
  - No transcription key → "Captions-only mode (no Whisper fallback)" (warning, not error)
- **Skill installer** logs failures to `~/.manifold/debug.log` and surfaces a non-blocking banner in the Watch tab footer. Does not block app startup.
- **Settings save** that writes `~/.config/watch/.env` and fails (e.g., perms) shows an error in the Settings modal; the in-memory settings still save.

## Testing

### Unit
- `watch-skill-installer.test.ts` — idempotency, version bump, missing target dir creation, Codex skipped when CLI absent.
- `watch-runner.test.ts` — PTY write mocking, validation rejections, command formatting (URL with spaces, empty question).
- `watch-setup-detector.test.ts` — caching, all-present, all-missing cases.
- `TranscriptionSettingsSection.test.tsx` — radio toggling, conditional field visibility, `.env` write payload.
- `dock-layout-helpers.test.ts` — extend the existing tests to cover the new `'watch'` panel id.

### Integration
- Spawn a fake session, invoke `watch:run`, assert the PTY received `/watch <url> <q>\n`.
- Boot the main process, assert `~/.claude/plugins/watch/SKILL.md` exists after `watch:install-skills`.

### Manual
- Full pipeline against a real YouTube URL with OpenAI key.
- Same with Azure OpenAI key (using a real Azure deployment).
- Captions-only path with `provider: 'none'`.
- Tab footer correctly reflects missing ffmpeg / yt-dlp / claude CLI.

## Open questions

None at design time. The `--analyzer` flag question is parked as out-of-scope.

## File-change summary

**New:**
- `src/renderer/components/watch/WatchPanel.tsx`
- `src/renderer/components/watch/WatchPanel.styles.ts`
- `src/renderer/hooks/useWatchPanel.ts`
- `src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx`
- `src/main/watch-skill-installer.ts`
- `src/main/watch-runner.ts`
- `src/main/watch-setup-detector.ts`
- `resources/skills/watch/` (vendored claude-video plugin + Azure patch)
- Test files co-located with each.

**Edited:**
- `src/renderer/hooks/dock-layout-helpers.ts`
- `src/renderer/hooks/dock-layout-builders.ts`
- `src/renderer/components/editor/dock-panels.tsx`
- `src/renderer/components/git/StatusBar.tsx`
- `src/renderer/components/modals/SettingsModal.tsx` (mount the new section)
- `src/shared/settings.ts` (extend type + defaults)
- `src/main/settings-store.ts` (write `.env` on save)
- `src/main/ipc-handlers.ts` (three new handlers)
- `src/preload/index.ts` (three new whitelist entries)
- `src/main/index.ts` (call `installWatchSkills()` on app ready)
- `electron.vite.config.ts` (extraResources for `resources/`)
- `package.json` (add `sync-watch-skill` script)
