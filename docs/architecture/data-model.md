---
description: The on-disk data model under ~/.manifold — every file and directory Manifold persists, which module owns each path, and the two distinct roots (hardcoded config home vs. configurable storage root).
covers: [src/main/store, src/shared/defaults.ts]
updated: 2026-06-12
owner: see .github/CODEOWNERS
---

# On-disk data model — what Manifold persists under `~/.manifold`

Manifold keeps all persistent state under a single home directory, `~/.manifold`. There
are **two roots that happen to coincide by default**:

1. **The config home** — always `os.homedir()/.manifold`, hardcoded in each store module.
   It holds settings, the project registry, memory DBs, logs, chat history, and assorted UI
   state. This path is *not* user-configurable.
2. **The storage root** (`settings.storagePath`) — *configurable* in Settings → Storage Path,
   defaulting to `os.homedir()/.manifold` (`settings-store.ts:24`, default seed
   `defaults.ts:5`). It holds the large, generated content: managed worktrees, locally
   generated app projects, and user-installed plugins.

Because the default `storagePath` equals the config home, a stock install puts everything
in one place — but moving the storage root only relocates worktrees/projects/plugins, **not**
`config.json`, `projects.json`, `memory/`, the logs, or chat history, which stay pinned to
`os.homedir()/.manifold`. That split is the single most important thing on this page.

## Covered code

- `src/shared/defaults.ts` — `DEFAULT_SETTINGS.storagePath: ''` (`:5`); the empty default that signals "resolve me".
- `src/main/store/settings-store.ts` — `CONFIG_DIR`/`CONFIG_FILE` for `config.json` (`:8`–`:9`); `resolveDefaults()` fills `storagePath` with `os.homedir()/.manifold` when unset (`:24`).
- `src/main/store/project-registry.ts` — `projects.json` (`:10`–`:11`).
- `src/main/store/chat-store.ts` — per-session chat under `<configHome>/chat/`, legacy `chat-history.json` (`:49`–`:51`).
- `src/main/store/verdict-store.ts` — `verdicts.json` (`:6`).
- `src/main/store/view-state-store.ts`, `dock-layout-store.ts`, `search-view-store.ts`, `shell-tab-store.ts` — UI-state JSON files (`view-state.json`, `dock-layout.json`, `search-view-state.json`, `shell-tabs.json`), each pinned to `os.homedir()/.manifold` (`:6`–`:7`, `:5`–`:6`, `:9`–`:10`, `:15`–`:16`).
- `src/main/store/dismissed-agents-store.ts` — `dismissed-agents.json` (`:6`–`:7`).

Owned elsewhere, mapped here because they share the home:

- `src/main/memory/memory-store.ts` — per-project SQLite at `<configHome>/memory/<projectId>.db` (+ `-wal`/`-shm`) (`:22`, `:30`).
- `src/main/app/debug-log.ts` — `debug.log` (`:5`).
- `src/main/git/worktree-manager.ts` — `<storageRoot>/worktrees/<project>/<branch>` (`:19`, `:30`–`:34`).
- `src/main/plugins/plugin-paths.ts` / `plugin-storage-store.ts` — `<storageRoot>/plugins/` (`plugin-paths.ts:20`) and `<storageRoot>/plugin-storage/<id>.json` (`plugin-storage-store.ts:13`).
- `src/main/background-agent-host/background-agent-store.ts` — `<configHome>/background-agent/state.json` (`:17`–`:18`).
- `src/main/app/index.ts` — `<configHome>/workspaces.json` (`:67`–`:68`).
- `resources/plugins/manifold.loop/src/iteration-log.ts` — `<configHome>/loop-logs/*.jsonl` (`:8`, `:16`). Now a plugin, not main process.

## How it works

The layout, file by file. Paths are written as `<configHome>` (= `os.homedir()/.manifold`,
fixed) or `<storageRoot>` (= `settings.storagePath`, configurable, default `<configHome>`).

**`<configHome>/config.json`** — the `ManifoldSettings` object. `SettingsStore` reads it on
construction; a missing/corrupt file falls back to `DEFAULT_SETTINGS` (`settings-store.ts:74`).
`resolveDefaults()` is the migration seam: it backfills `storagePath`, deep-merges
`memory`/`search`/`editor`, reconciles built-in provisioners, and one-time-seeds
`disabledPlugins` (`settings-store.ts:22`). Every `updateSettings()` rewrites the whole file
(`:89`). `storagePath` itself is set here and consumed across the app — its `mkdirSync` on
change lives in the IPC layer, not the store (`ipc/settings-handlers.ts:18`).

**`<configHome>/projects.json`** — a flat `Project[]` array (id, name, path, baseBranch,
addedAt, kind). `ProjectRegistry` loads, sorts by name, and rewrites the file on every
add/remove/update (`project-registry.ts:40`). Note these are *registered* project paths
(pointers to repos anywhere on disk), distinct from generated projects under
`<storageRoot>/projects/`.

**`<configHome>/memory/<projectId>.db`** — one better-sqlite3 database per project,
WAL-mode (so `-wal`/`-shm` sidecars appear). `MemoryStore` lazily opens/creates each DB on
first use, applies the schema + migrations, and caches the handle
(`memory-store.ts:25`–`:36`). Deletion removes the `.db` plus both sidecars
(`memory-store.ts:208`–`:211`); pruning iterates every `*.db` in the directory
(`memory-store.ts:196`).

**`<configHome>/chat/<hash>.json`** + legacy `chat-history.json` — per-session chat
persistence. `ChatStore` writes one file per storage key under `chat/`, coalesced and
debounced, so a write serializes only the changed session (`chat-store.ts:28`–`:55`). It
migrates the old single `chat-history.json` on first run.

**`<configHome>/verdicts.json`** — per-session run records (`VerdictRecord[]`), capped at
1000 per project with FIFO eviction (`verdict-store.ts:6`, `:46`).

**`<configHome>/{view-state,dock-layout,search-view-state,shell-tabs}.json`** — renderer/UI
state persisted by the four small stores in `src/main/store`. All hardcode
`os.homedir()/.manifold` and rewrite their single JSON file on change.

**`<configHome>/dismissed-agents.json`** — `{ projectId: branch[] }` of agents the user
explicitly deleted from the sidebar, so session discovery does not resurrect a dormant
agent from leftover branch checkout state (`dismissed-agents-store.ts:7`; #679). Entries
are lifted when a session is recreated on that branch and purged on project removal.

**`<configHome>/background-agent/state.json`** — background-agent profiles, suggestions, and
feedback, keyed by project (`background-agent-store.ts:17`).

**`<configHome>/workspaces.json`** — multi-root workspace definitions
(`app/index.ts:68`).

**`<configHome>/loop-logs/<sha256(worktreePath)[:16]>.jsonl`** — one append-only JSONL file
per worktree of automated-loop iterations. Owned by the loop *plugin*
(`iteration-log.ts:8`, `:16`), not the main process; the filename is a truncated SHA-256 of
the worktree path.

**`<configHome>/debug.log`** — the global debug log. `DebugLogger` buffers lines in memory
and appends asynchronously (one `appendFile` per batch) precisely because it is on a per-PTY-
chunk hot path; a synchronous append per line previously hung the app under multiple
streaming sessions (`debug-log.ts:10`–`:25`). `flushSync()` drains on quit.

**`<storageRoot>/worktrees/<projectName>/<branch>`** — managed git worktrees.
`WorktreeManager.getWorktreeBase()` joins `storagePath` + `worktrees` + project name
(`worktree-manager.ts:19`); the branch's `/` is flattened to `-` for the leaf dir
(`worktree-manager.ts:33`). This is where session work happens; per-session meta lives inside
the worktree (see `src/main/git/worktree-meta`), which is what makes session discovery
possible.

**`<storageRoot>/projects/<repoName>`** — locally generated/provisioned app projects.
The base is computed as `storagePath + 'projects'` in several callers
(`ipc/project-handlers.ts:105`, `ipc/agent-handlers.ts:285`, `app/mode-switcher.ts:88`,
`provisioning/provisioning-dispatcher.ts:128`); the leaf is a slugified repo name.

**`<storageRoot>/plugins/`** and **`<storageRoot>/plugin-storage/<id>.json`** — user-installed
plugins (`plugin-paths.ts:20`) and per-plugin key/value JSON. `PluginStorageStore` path-checks
the id so it can't escape the directory (`plugin-storage-store.ts:13`–`:18`). Bundled plugins
ship inside the app under `resources/plugins`, not here (`plugin-paths.ts:7`).

## Key types and entry points

- `ManifoldSettings` — `src/shared/types.ts`; the shape of `config.json`. `storagePath` is the
  one field that determines the storage root.
- `DEFAULT_SETTINGS` — `defaults.ts:4`. Ships `storagePath: ''`; the empty string is the
  signal for `resolveDefaults` to substitute the config home.
- `SettingsStore.resolveDefaults()` — `settings-store.ts:22`. The only place `storagePath` is
  resolved to a concrete path. Treat this as the authoritative storage-root owner.
- `WorktreeManager.getWorktreeBase()` — `worktree-manager.ts:18`. Storage-root → worktrees.
- `getUserPluginsDir(storagePath)` — `plugin-paths.ts:19`. Storage-root → plugins.
- `MemoryStore` constructor — `memory-store.ts:21`. Config-home → memory DBs.

## Interactions

- **Wiring** (`src/main/app/index.ts`): instantiates `SettingsStore`, `ProjectRegistry`,
  `ChatStore`, `MemoryStore`, `VerdictStore`, and passes `settings.storagePath` into
  `WorktreeManager`, `BranchCheckoutManager`, and `PluginManager` (`app/index.ts:52`–`:115`).
  This file is where the config-home stores and the storage-root consumers meet.
- **Settings IPC** (`src/main/ipc/settings-handlers.ts`): on a `storagePath` change it
  `mkdirSync`s the new root before persisting (`:18`). Changing the root does not move
  existing config-home data.
- **Session / git** (`src/main/session`, `src/main/git`): worktrees under
  `<storageRoot>/worktrees` carry their own meta files; session discovery rebuilds dormant
  sessions by scanning that tree (see `docs/architecture/session.md`).
- **Memory** (`src/main/memory`): the only consumer that writes binary SQLite rather than
  JSON; `rawRetentionDays` (default 30, `defaults.ts:29`) drives pruning.
- **Loop plugin** (`resources/plugins/manifold.loop`): writes `loop-logs/*.jsonl` directly to
  the config home, bypassing `src/main/store` entirely — a plugin reaching into the same home.

## Invariants & gotchas

- **Two roots, only one is configurable.** Settings, registry, memory, logs, chat, verdicts,
  workspaces, and UI state are pinned to `os.homedir()/.manifold`. Only worktrees, generated
  projects, and plugins follow `settings.storagePath`. Changing Storage Path relocates the
  latter set and leaves the former where it is.
- **`storagePath: ''` means "unresolved", not "cwd".** `DEFAULT_SETTINGS` ships the empty
  string; `resolveDefaults` is the *only* place it becomes a real path
  (`settings-store.ts:24`). Read `storagePath` only after `SettingsStore` construction.
- **Stores fail soft to empty/default state.** Missing or wholly unparseable JSON yields
  `DEFAULT_SETTINGS` / `[]` / `{}` rather than throwing (`settings-store.ts:86`,
  `project-registry.ts:35`, `background-agent-store.ts:92`). Writes are atomic (tmp + `rename`
  via `store/atomic-write.ts`), so a crash mid-write no longer truncates a file and silently
  resets that store on next launch.
- **`projects.json` ≠ `<storageRoot>/projects/`.** The former is the registry of pointers to
  repos anywhere; the latter is the folder where Manifold *generates* new apps. Same word,
  unrelated state.
- **Memory DBs are WAL.** Each `<projectId>.db` has `-wal`/`-shm` companions; deletion must
  remove all three (`memory-store.ts:208`–`:211`).
- **`debug.log` must never be written synchronously per line.** It is on the per-PTY-chunk hot
  path; a sync append hung the app at scale (`debug-log.ts:14`–`:24`). Writes are batched +
  async, with a `flushSync` only on quit. The auto-updater rewrites the file, so all appends
  target EOF.
- **`loop-logs` filenames are opaque.** They are `sha256(worktreePath)[:16].jsonl`
  (`iteration-log.ts:11`), so you can't map a log file back to a worktree by name alone.
