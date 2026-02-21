# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Manifold?

Manifold is an Electron desktop app that orchestrates multiple CLI coding agents (Claude Code, Codex, Gemini CLI) working in parallel on the same project. Each agent runs in its own git worktree so agents can work on isolated branches simultaneously without conflicts.

## Commands

```bash
npm run dev          # Start Electron in dev mode (hot reload via electron-vite)
npm run build        # Production build
npm run dist         # Build + package macOS DMG
npm run typecheck    # Full typecheck (delegates to tsconfig.node.json + tsconfig.web.json via project references)
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npx vitest run src/main/pty-pool.test.ts  # Run a single test file
```

## Architecture

### Process Boundary (Electron)

The app follows the standard Electron three-process model with strict context isolation:

- **Main process** (`src/main/`) — Node.js runtime. Owns all system resources: PTY processes, git worktrees, file system, settings. All business logic lives here.
- **Preload** (`src/preload/index.ts`) — Bridge layer. Exposes a whitelist of IPC channels via `contextBridge`. Three channel types: invoke (request/response), send (renderer→main fire-and-forget), and listen (main→renderer push).
- **Renderer** (`src/renderer/`) — React UI. No direct Node.js access. Communicates exclusively through `window.electronAPI.invoke()`, `window.electronAPI.send()`, and `window.electronAPI.on()`.

### Main Process Modules

All instantiated in `src/main/index.ts` and wired together via dependency injection into `registerIpcHandlers()`:

| Module | Responsibility |
|---|---|
| `SessionManager` | Lifecycle of agent sessions — create, resume, kill, discover dormant worktrees. Owns the `Map<string, InternalSession>`. |
| `WorktreeManager` | Creates/removes git worktrees. Uses a configurable `storagePath` (default `~/.manifold/worktrees/<projectName>/`). |
| `PtyPool` | Spawns and manages PTY processes via `node-pty`. Provides data/exit event subscriptions per PTY. |
| `ProjectRegistry` | CRUD for registered projects (stored in `~/.manifold/projects.json`). |
| `SettingsStore` | Reads/writes `~/.manifold/config.json`. Resolves defaults at load time (empty `storagePath` → `~/.manifold`). |
| `StatusDetector` | Pattern-matches agent PTY output to detect `running`/`waiting`/`done`/`error` status. |
| `DiffProvider` | Git diff between worktree branch and project base branch. |
| `FileWatcher` | Watches worktree directories via chokidar, pushes `files:changed` events to renderer. Also polls `git status` for conflict detection (`agent:conflicts`). |
| `GitOperationsManager` | Commit, AI-generated commit messages, ahead/behind counts, conflict resolution, PR context extraction. |
| `PrCreator` | Creates GitHub PRs via `gh` CLI for agent worktree branches. |
| `ShellTabStore` | Persists user's shell tab layout per worktree path across app restarts (stored in `~/.manifold/shell-tabs.json`). |
| `ViewStateStore` | Persists per-session UI state (open files, active tab, code view mode) across restarts. |
| `BranchNamer` | AI-generated branch name suggestions from task descriptions (calls Claude API via CLI). |
| `Runtimes` | Discovers available agent CLIs on the system (`listRuntimes`, `getRuntimeById`). |

### Data Flow

1. User clicks "New Agent" → renderer invokes `agent:spawn` IPC
2. `SessionManager.createSession()` → `WorktreeManager.createWorktree()` → `PtyPool.spawn()` → writes initial prompt to PTY stdin
3. PTY output streams back via `agent:output` push channel → rendered in xterm.js terminal
4. `StatusDetector` pattern-matches output to update agent status → pushed via `agent:status`

### Renderer Structure

- **`App.tsx`** — Root component. Composes all hooks and passes props down. No context providers; pure props drilling.
- **Hooks** (`src/renderer/hooks/`) — All state management. Each hook handles one domain (projects, sessions, settings, terminal, git, etc.).
- **Components** (`src/renderer/components/`) — Presentational. `MainPanes` handles the four-pane resizable layout (agent terminal | code viewer | file tree | shell terminal).
- **Styles** — Component styles are co-located in `*.styles.ts` files exporting plain objects (not CSS modules).

### IPC Channel Convention

- Invoke (request/response): `domain:action` — e.g., `agent:spawn`, `files:read`, `settings:get`
- Send (renderer→main, fire-and-forget): `domain:event` — e.g., `theme:changed`
- Listen (main→renderer push): `domain:event` — e.g., `agent:output`, `agent:status`, `files:changed`

Adding a new IPC channel requires updating three places: `ipc-handlers.ts` (handler), `preload/index.ts` (whitelist), and the renderer hook that calls it.

### TypeScript Configuration

Two tsconfig project references via root `tsconfig.json`:
- `tsconfig.node.json` — covers `src/main/`, `src/preload/`, `src/shared/`, and `electron.vite.config.ts`
- `tsconfig.web.json` — covers `src/renderer/` and `src/shared/`

Both target ES2022 with strict mode. The `npm run typecheck` command checks both via project references. To check a single side: `npm run typecheck:node` or `npm run typecheck:web`.

### Key Conventions

- Agent worktree branches are always prefixed with `manifold/` (e.g., `manifold/oslo`). `WorktreeManager.listWorktrees()` filters on this prefix.
- Settings config lives at `~/.manifold/config.json`. Agent worktrees stored under the user-configurable `storagePath` (defaults to `~/.manifold/`).
- `src/shared/` contains types and defaults imported by both main and renderer. Must stay free of Node.js-specific imports (resolved at runtime in main process only).
- Tests are co-located with source files (`*.test.ts` / `*.test.tsx`).
- Path aliases `@shared`, `@main`, `@renderer` are available in vitest (defined in `vitest.config.ts`). Not available in the Electron build itself — use relative imports in production code.
- The `preload/index.ts` `on()` method returns an unsubscribe function — renderer hooks must call it in effect cleanup to avoid EventEmitter memory leaks.
- On macOS, the main process resolves the user's shell `PATH` at startup (`loadShellPath()`) and appends common binary directories (`~/.local/bin`, `/opt/homebrew/bin`, etc.) to ensure spawned agent CLIs are discoverable.
- Debug logs are written to `~/.manifold/debug.log`.
