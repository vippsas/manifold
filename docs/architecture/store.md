---
description: How Manifold persists app and user state on disk — settings/config, the project registry, per-session view/chat/verdict state — and which JSON file owns which slice.
covers: [src/main/store]
updated: 2026-06-08
owner: see .github/CODEOWNERS
---

# Store — on-disk persistence of app and user state

Every long-lived piece of Manifold state that must survive a restart lives in one of
these stores. Each store is a small class that owns exactly one JSON file under
`~/.manifold/` (or a subdirectory of it), loads it eagerly in its constructor, keeps an
in-memory copy, and writes the whole file back on mutation. There is no database and no
shared persistence layer — every store opens, parses, and serializes its own file
independently. They are instantiated once at startup in `src/main/app/index.ts` and reached
through IPC handlers.

## Covered code

- `src/main/store/settings-store.ts` — `SettingsStore`: app/user settings in `~/.manifold/config.json`, merged over `DEFAULT_SETTINGS` with field-level defaulting.
- `src/main/store/project-registry.ts` — `ProjectRegistry`: the project list (`projects.json`), with git-kind/base-branch detection and the cached `slashCommands` per project.
- `src/main/store/verdict-store.ts` — `VerdictStore`: per-session run verdicts (`verdicts.json`), keyed by `sessionId`, evicted per project past a cap.
- `src/main/store/chat-store.ts` — `ChatStore`: per-session chat history as one file per session under `~/.manifold/chat/`, with debounced async writes and a sync flush on quit.
- `src/main/store/view-state-store.ts` — `ViewStateStore`: editor/explorer view state per session (`view-state.json`).
- `src/main/store/dock-layout-store.ts` — `DockLayoutStore`: opaque dockview layout per session (`dock-layout.json`).
- `src/main/store/search-view-store.ts` — `SearchViewStore`: recent/saved searches per project (`search-view-state.json`).
- `src/main/store/shell-tab-store.ts` — `ShellTabStore`: saved terminal tabs per agent (`shell-tabs.json`).
- `src/main/store/prompt-summarizer.ts` — `summarizeMiddle()`: a stateless helper (no file) that compresses the middle of long task prompts for the verdict recorder.

Not a store but co-located here. `prompt-summarizer.ts` persists nothing; it is the
LLM-summarization helper wired into `VerdictRecorder` (`app/index.ts:110`).

## How it works

**One file, one store, loaded once.** Every store resolves its file path at module load
from `path.join(os.homedir(), '.manifold')` and a fixed filename (e.g.
`settings-store.ts:8`, `project-registry.ts:10`, `view-state-store.ts:6`). The constructor
calls a private `loadFromDisk()` that returns an empty value when the file is missing,
unparseable, or the wrong shape — a missing file is never an error, just an empty start
(`project-registry.ts:24`, `settings-store.ts:73`). Mutations update the in-memory copy and
then call `writeToDisk()`, which `mkdirSync`s the config dir and writes the whole structure
back with `JSON.stringify(..., null, 2)` (`settings-store.ts:89`, `project-registry.ts:40`).
The Map-backed stores (view-state, dock-layout, search-view, shell-tab) serialize via
`Object.fromEntries(this.state)` and rehydrate via `new Map(Object.entries(parsed))`
(`view-state-store.ts:38`, `:30`).

**Settings — merge then default.** `SettingsStore.loadFromDisk()` spreads the parsed file
over `{ ...DEFAULT_SETTINGS }` so unknown/missing top-level keys fall back, then runs
`resolveDefaults()` for the fields that need deeper merging (`settings-store.ts:22`):
`storagePath` defaults to `~/.manifold` when blank; `memory`, `search.ai`, and `editor`
are merged field-by-field over their defaults; the `provisioning.provisioners` list is
reconciled so stale builtins are dropped and missing builtins re-added; and
`disabledPlugins` is seeded once with the default-disabled set, guarded by a
`pluginDefaultsSeeded` flag so a user-enabled plugin is not re-disabled on next launch
(`settings-store.ts:42`, `:65`). `updateSettings(partial)` shallow-merges, writes, and
clears the Watch setup cache when `transcription` changed (`settings-store.ts:98`).
`getSettings()` returns a shallow copy.

**Project registry.** `addProject()` resolves the absolute path, returns any existing
entry with the same path, otherwise detects `kind` (`git` when
`git rev-parse --is-inside-work-tree` is true, else `folder`) and, for git projects, a
`baseBranch` — preferring `main`, then `master`, then the current/unborn branch
(`project-registry.ts:49`, `:58`). New projects get a `uuidv4()` id, the basename as `name`,
and an ISO `addedAt`; the list is sorted by name and written (`project-registry.ts:88`).
`updateProject()` mutates in place via `Object.assign`, re-sorts, and writes; this is how
`slashCommands` is cached: when Claude's `system/init` reports slash-command/skill names,
`SessionManager` and the dev-server manager call `updateProject(id, { slashCommands })`
(`session-manager.ts:284`, `dev-server-manager.ts:254`) so the chat `/` autocomplete is
warm before the next session's first message (`shared/types.ts:55`).

**Verdict store.** `VerdictStore` holds a flat `VerdictRecord[]` in `verdicts.json`,
keyed implicitly by `sessionId`. `upsert()` replaces a record with a matching `sessionId`
in place, or appends and then evicts the oldest records for that `projectId` past
`MAX_PER_PROJECT` (1000) before writing (`verdict-store.ts:35`, `:46`). Reads are
`getBySessionId()` and `listByProject(projectId, limit?)` (last-N slice). Its file path is
constructor-injectable (default `~/.manifold/verdicts.json`) so tests can point it
elsewhere (`verdict-store.ts:13`).

**Chat store — the one that is not whole-file.** `ChatStore` deliberately breaks the
whole-file pattern. Each storage key gets its own file under `~/.manifold/chat/`, named by
the first 32 hex chars of `sha256(storageKey)` (`chat-store.ts:144`), so a write serializes
only the session that changed. `set()` caps messages to the trailing 200, marks the key
dirty, and schedules a debounced flush (500 ms default); the timer is `unref`'d so it never
holds the process open (`chat-store.ts:63`, `:136`). Writes go through a tmp-file +
`rename` for atomicity (`chat-store.ts:163`). `flush()` is async for the hot path;
`flushSync()` is the quit-path guarantee, called from `app-lifecycle.ts:87` in `before-quit`.
On construction it migrates a legacy single `chat-history.json` (only the v2,
storageKey-scoped format is carried; older project-keyed data is discarded) and renames the
legacy file to `.bak` so the migration never re-runs and history is never deleted
(`chat-store.ts:213`). This per-file design replaced the previous full synchronous rewrite
on every message that caused the multi-session hang.

**View / dock / search / shell stores.** Four near-identical `Map<string, T>` stores keyed
by session id (view, dock), project id (search), or agent key (shell). They deep-copy on
`get`/`set` so callers cannot mutate the cached state through a returned reference
(`view-state-store.ts:42`, `search-view-store.ts:55`, `shell-tab-store.ts:51`).
`DockLayoutStore` stores the layout as opaque `unknown` — the dockview JSON is round-tripped
verbatim, never inspected (`dock-layout-store.ts:9`).

## Key types and entry points

- `SettingsStore` — `settings-store.ts:11`. `getSettings()`, `updateSettings(partial)`. Owns `config.json`. Source of `storagePath`, which seeds `WorktreeManager`, `PluginManager`, simple-mode `projects/` base, etc. (`app/index.ts:55`, `:115`).
- `ProjectRegistry` — `project-registry.ts:13`. `listProjects`, `addProject`, `removeProject`, `getProject`, `updateProject`. Owns `projects.json`. `Project` type at `shared/types.ts:46`.
- `VerdictStore` — `verdict-store.ts:9`. `upsert`, `getBySessionId`, `listByProject`. Owns `verdicts.json`. `VerdictRecord` at `shared/verdict-types.ts`.
- `ChatStore` — `chat-store.ts:38`. `get`, `set`, `delete`, `deleteByProject`, `flush`, `flushSync`. Owns `~/.manifold/chat/<hash>.json`.
- `ViewStateStore` / `DockLayoutStore` / `SearchViewStore` / `ShellTabStore` — `get`/`set`(/`delete`). Own `view-state.json`, `dock-layout.json`, `search-view-state.json`, `shell-tabs.json`.
- `summarizeMiddle(middle, settings, fetchImpl?)` — `prompt-summarizer.ts:17`. OpenAI/Azure chat completion with a 10 s timeout; falls back to `[middle omitted — N chars]` on any error or `provider: 'none'`.

## Interactions

- **App bootstrap** (`src/main/app/index.ts`): constructs every store as a singleton (`:52`–`:104`) and threads them into the IPC dependency bundle and the managers that need them.
- **IPC** (`src/main/ipc`): `settings:get`/`settings:update` front `SettingsStore` (`settings-handlers.ts:12`, and additionally `mkdirSync` a newly chosen `storagePath`); project, agent, and search handlers front the registry and the view/chat/search stores.
- **Session** (`src/main/session`): `SessionManager`/dev-server cache `slashCommands` into `ProjectRegistry`; `VerdictRecorder` writes through `VerdictStore` and uses `summarizeMiddle` to compress long task prompts; `ChatAdapter` reads/writes `ChatStore`.
- **Storage root consumers** (`src/main/git`, `src/main/plugins`, `src/main/provisioning`): `settings.storagePath` is the root for worktrees (`worktree-manager.ts:19`), plugins (`plugin-paths.ts:20`), and simple-mode `projects/` — these stores define where state lives; those subsystems live inside it.
- **Quit** (`src/main/app/app-lifecycle.ts:87`): `chatStore.flushSync()` is the only store flushed on `before-quit`; all others write synchronously on every mutation and need no flush.

## Invariants & gotchas

- **Whole-file rewrite is the norm; chat is the exception.** Every store except `ChatStore` serializes its entire structure on each mutation. That is fine for small registries but is exactly why chat history was split into per-session files (`chat-store.ts:28`) — keep large/high-frequency state out of the whole-file stores.
- **Corrupt or wrong-shaped files load as empty, silently.** All `loadFromDisk()` paths catch and return the empty default; a malformed `projects.json` therefore looks like "no projects", not an error (`project-registry.ts:35`). The next write overwrites it.
- **Defaulting is two-layered for settings only.** A top-level spread over `DEFAULT_SETTINGS` plus `resolveDefaults()` for nested fields. A new nested settings field needs a corresponding merge in `resolveDefaults()` or it will be lost when an old config is loaded (`settings-store.ts:22`).
- **`storagePath` blank means `~/.manifold`.** `DEFAULT_SETTINGS.storagePath` is `''`; it is resolved to the home `.manifold` dir at load (`settings-store.ts:23`, `defaults.ts:4`). Downstream code reads `settings.storagePath` directly and assumes it is non-empty.
- **Chat writes are debounced and timer-`unref`'d.** Pending chat writes are lost on a hard crash; only the `before-quit` `flushSync()` guarantees durability. The unref'd timer means the flush never keeps the app alive on its own (`chat-store.ts:138`).
- **`getSettings()` returns a copy, not a live reference.** Callers that cache it (e.g. `WorktreeManager` taking `storagePath` once at startup, `app/index.ts:55`) will not see later `storagePath` changes without re-reading.
- **Verdict eviction is per project, on insert only.** Updates to an existing `sessionId` never evict; only appends do, and only that project's records are pruned (`verdict-store.ts:46`).
