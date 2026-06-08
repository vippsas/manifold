# Manifold documentation — doc map

This is the **contributor/agent entry point** to Manifold's documentation. The
top-level [`README.md`](../README.md) is the user-facing front door; this map is for
people (and agents) working *on* the code.

It is organized around the pattern in [`docs/llm-wiki.md`](llm-wiki.md): an
LLM-maintained **living reference layer** under [`architecture/`](architecture) that is
kept in sync with the code, kept distinct from the frozen, point-in-time specs under
[`superpowers/`](superpowers), [`planning/`](planning), and [`research/`](research).

## How this layer works (the short version)

- Every living page declares a **`covers:`** path in its frontmatter — the code it is
  the documentation *for*. Code is ground truth; pages are verified against current
  code, never against sibling docs.
- A page is **stale** when commits have hit its `covers:` path since the page's
  `updated:` date. This is measurable from git, so drift is detectable, not guessed:

  ```bash
  # Is a page stale? (commits to covered code since the page was last touched)
  doc=docs/architecture/session.md; cov=src/main/session
  doc_hash=$(git log -1 --format=%h -- "$doc")
  git rev-list --count ${doc_hash}..HEAD -- $cov   # > threshold ⇒ stale
  ```

- The full schema (covers, staleness, lint, writer-≠-verifier, living-vs-frozen) lives
  in [`CLAUDE.md`](../CLAUDE.md) (which `AGENTS.md` symlinks to). The append-only run
  record is [`log.md`](../log.md) at the repo root.

## Architecture wiki

The living, code-tracking reference layer. One page per main-process subsystem, plus a
handful of cross-cutting pages. `covers:` is the code each page is bound to.

### Main process — `src/main/*`

| Page | `covers:` | What it documents |
| --- | --- | --- |
| [Session](architecture/session.md) | `src/main/session` | Agent session lifecycle — create, run, stop, resume, and rediscover sessions from on-disk worktrees |
| [Git & worktrees](architecture/git.md) | `src/main/git` | Worktree create/list/remove, branch/PR checkout, durable worktree meta, and raw git/gh exec |
| [Workspace](architecture/workspace.md) | `src/main/workspace` | Multi-repo Workspaces: one agent across several repos via per-runtime `--add-dir` worktrees |
| [Agent (runtimes & PTY)](architecture/agent.md) | `src/main/agent` | AI runtime registry, interactive vs print-mode command building, theme/ANSI sync, and the PtyPool process boundary |
| [Background agent host](architecture/background-agent-host.md) | `src/main/background-agent-host` | Runs off-session "Ideas" research jobs (profile→research→synthesize→rank) with pause/resume and snapshot polling |
| [Watch](architecture/watch.md) | `src/main/watch` | Video → auto-scaled ffmpeg frames + timestamped transcript → markdown report for the Watch skill/panel |
| [Memory](architecture/memory.md) | `src/main/memory` | Per-project SQLite session memory: capture interactions, compress to observations/summaries, search |
| [Search](architecture/search.md) | `src/main/search` | Cross-session code/file/memory search with literal-vs-regex matching and an optional AI rerank/answer layer |
| [Provisioning](architecture/provisioning.md) | `src/main/provisioning` | Main-process host that spawns provisioner CLIs over stdin/stdout and turns results into projects |
| [Plugins (host)](architecture/plugins.md) | `src/main/plugins`, `src/plugin-host` | How the main process discovers, loads, capability-gates, and tears down plugins via a forked host |
| [Store](architecture/store.md) | `src/main/store` | Per-file JSON persistence for settings, project registry, verdicts, chat, and view state under `~/.manifold` |
| [Filesystem](architecture/fs.md) | `src/main/fs` | Polls worktrees for git/tree changes and serves file read/write/list/import to the editor |
| [App (shell & lifecycle)](architecture/app.md) | `src/main/app` | Electron main-process entry, boot sequence, lifecycle, windows, menu, auto-updater, mode switch & dev-server preview |
| [IPC](architecture/ipc.md) | `src/main/ipc` | Channel-namespaced `ipcMain.handle` handlers exposing main-process managers to the renderer |

### Cross-cutting

| Page | `covers:` | What it documents |
| --- | --- | --- |
| [Preload bridge](architecture/preload.md) | `src/preload` | The contextBridge whitelist exposing `window.electronAPI`; keeps Node/fs out of the renderer |
| [Plugin API](architecture/plugin-api.md) | `src/shared/plugins` | The `manifold` runtime module contract — namespaces, manifest, capabilities, and contributes for plugins |
| [On-disk data model](architecture/data-model.md) | `src/main/store`, `src/shared/defaults.ts` | Every file/dir Manifold persists under `~/.manifold`, and the config-home vs configurable storage-root split |

### Renderer

| Page | `covers:` | What it documents |
| --- | --- | --- |
| [Renderer](architecture/renderer.md) | `src/renderer` | React workspace UI: dockview panel layout, modules, and the `window.electronAPI`-only main boundary |

### Build & release

| Page | `covers:` | What it documents |
| --- | --- | --- |
| [Build & release](architecture/build.md) | `package.json` | npm scripts, electron-vite bundling, better-sqlite3 ABI rebuilds, plugin esbuild, and the tag-driven `.dmg` release |

## Other living docs

These predate the architecture wiki but are already code-tracking in spirit — keep them
in sync the same way.

- [External provisioners](external-provisioners.md) — the provisioner CLI protocol, bound to `src/shared/provisioning-types.ts`. Author-facing companion to the [Provisioning](architecture/provisioning.md) host page.
- [Plugin authoring guide](plugins/authoring.md) — the long-form guide for built-in plugins. Concise code-bound companion: [Plugin API](architecture/plugin-api.md).

## Frozen specs (raw historical evidence — do not "freshen")

Point-in-time artifacts. They record a decision at a moment and should keep reading as
they did then. The wiki distills from them, then leaves them frozen; never cite a
superseded spec as if it were current truth.

- [`superpowers/`](superpowers) — specs, plans, and designs
- [`planning/`](planning) — planning notes
- [`research/`](research) — research notes
- [`devcon/`](devcon)

## Maintaining this layer

- **Pattern & rationale:** [`docs/llm-wiki.md`](llm-wiki.md)
- **Schema & conventions:** [`CLAUDE.md`](../CLAUDE.md) / `AGENTS.md`
- **Run log:** [`log.md`](../log.md)
- **Lint:** `bash scripts/wiki-lint.sh` — runs the drift checks over every tracked page.

When a PR changes code under a `covers:` path, update the matching page(s) in the same
PR and bump their `updated:` date. New `src/main/*` subsystem ⇒ new page here.

The user-facing [`README.md`](../README.md) is tracked too: it carries a
`<!-- wiki-covers: … -->` comment binding it to the runtime registry, `package.json`
scripts, and storage defaults, so the lint flags it when those drift. It's editorial,
though — a stale flag is a prompt to review the front-door copy, not always to edit.
