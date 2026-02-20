# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Manifold?

Manifold is an Electron desktop app that orchestrates multiple CLI coding agents (Claude Code, Codex, Gemini CLI) working in parallel on the same project. Each agent runs in its own git worktree so agents can work on isolated branches simultaneously without conflicts.

## Commands

```bash
npm run dev          # Start Electron in dev mode (hot reload)
npm run build        # Production build
npm run typecheck    # Full typecheck (runs both tsconfig.node.json and tsconfig.web.json)
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npx vitest run src/main/pty-pool.test.ts  # Run a single test file
```

## Architecture

### Process Boundary (Electron)

The app follows the standard Electron three-process model with strict context isolation:

- **Main process** (`src/main/`) — Node.js runtime. Owns all system resources: PTY processes, git worktrees, file system, settings. All business logic lives here.
- **Preload** (`src/preload/index.ts`) — Bridge layer. Exposes a whitelist of IPC channels via `contextBridge`. Both invoke channels (request/response) and listen channels (push from main) are explicitly enumerated.
- **Renderer** (`src/renderer/`) — React UI. No direct Node.js access. Communicates exclusively through `window.electronAPI.invoke()` and `window.electronAPI.on()`.

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
| `FileWatcher` | Watches worktree directories via chokidar, pushes `files:changed` events to renderer. |

### Data Flow

1. User clicks "New Agent" → renderer invokes `agent:spawn` IPC
2. `SessionManager.createSession()` → `WorktreeManager.createWorktree()` → `PtyPool.spawn()` → writes initial prompt to PTY stdin
3. PTY output streams back via `agent:output` push channel → rendered in xterm.js terminal
4. `StatusDetector` pattern-matches output to update agent status → pushed via `agent:status`

### Renderer Structure

- **`App.tsx`** — Root component. Composes all hooks and passes props down. No context providers; pure props drilling.
- **Hooks** (`src/renderer/hooks/`) — All state management. Each hook handles one domain (projects, sessions, settings, terminal, etc.).
- **Components** (`src/renderer/components/`) — Presentational. `MainPanes` handles the four-pane resizable layout (agent terminal | code viewer | file tree | shell terminal).

### IPC Channel Convention

- Invoke (request/response): `domain:action` — e.g., `agent:spawn`, `files:read`, `settings:get`
- Listen (push from main): `domain:event` — e.g., `agent:output`, `agent:status`, `files:changed`

Adding a new IPC channel requires updating three places: `ipc-handlers.ts` (handler), `preload/index.ts` (whitelist), and the renderer hook that calls it.

### Key Conventions

- Agent worktree branches are always prefixed with `manifold/` (e.g., `manifold/oslo`). `WorktreeManager.listWorktrees()` filters on this prefix.
- Settings config lives at `~/.manifold/config.json`. Agent worktrees stored under the user-configurable `storagePath` (defaults to `~/.manifold/`).
- `src/shared/` contains types and defaults imported by both main and renderer. Must stay free of Node.js-specific imports (resolved at runtime in main process only).
- Tests are co-located with source files (`*.test.ts` / `*.test.tsx`).
- Path alias: `@shared`, `@main`, `@renderer` available in vitest (defined in `vitest.config.ts`). Not available in the Electron build itself.
- The `preload/index.ts` `on()` method returns an unsubscribe function — renderer hooks must call it in effect cleanup to avoid EventEmitter memory leaks.
