# Manifold

A desktop app that orchestrates multiple CLI coding agents working in parallel on the same project. Each agent runs in its own git worktree, so agents can work on isolated branches simultaneously without conflicts.

Supports Claude Code, Codex, and Gemini CLI.

## Getting Started

```bash
npm install
npm run dev
```

On first launch, Manifold presents a welcome dialog to configure your storage location and register a project.

## Development

```bash
npm run dev          # Start Electron in dev mode (hot reload)
npm run build        # Production build
npm run dist         # Build + package macOS DMG
npm run typecheck    # Full typecheck (main + renderer)
npm test             # Run all tests
npm run test:watch   # Watch mode
```

## How It Works

1. Register a project (any local git repository)
2. Create agents — each gets its own git worktree branched from the project
3. Agents run CLI tools in isolated PTY sessions, streaming output to xterm.js terminals
4. View diffs, file changes, and agent status in a four-pane layout

Agent worktree branches are prefixed with `manifold/` (e.g., `manifold/oslo`).

## Architecture

Electron three-process model with strict context isolation:

- **Main** (`src/main/`) — Node.js runtime. Owns PTY processes, git worktrees, file system, settings.
- **Preload** (`src/preload/`) — IPC bridge. Whitelisted channels only.
- **Renderer** (`src/renderer/`) — React UI. No direct Node.js access.

### Main Process Modules

| Module | Role |
|---|---|
| `SessionManager` | Agent session lifecycle — create, resume, kill, discover dormant worktrees |
| `WorktreeManager` | Git worktree creation/removal under configurable `storagePath` |
| `PtyPool` | PTY process management via `node-pty` |
| `ProjectRegistry` | CRUD for registered projects (`~/.manifold/projects.json`) |
| `SettingsStore` | Config persistence (`~/.manifold/config.json`) |
| `StatusDetector` | Pattern-matches PTY output to detect agent status |
| `DiffProvider` | Git diff between worktree branch and base branch |
| `FileWatcher` | Watches worktree directories, pushes change events to renderer |
| `GitOperationsManager` | Commit, AI-generated commit messages, ahead/behind counts, conflict resolution |
| `PrCreator` | Creates GitHub PRs via `gh` CLI for agent worktree branches |
| `ShellTabStore` | Persists shell tab layout per worktree across app restarts |
| `ViewStateStore` | Persists per-session UI state (open files, active tab, code view mode) |
| `BranchNamer` | AI-generated branch name suggestions from task descriptions |
| `Runtimes` | Discovers available agent CLIs on the system |

### Renderer

- **`App.tsx`** — Root component, composes hooks, props drilling (no context providers)
- **Hooks** (`src/renderer/hooks/`) — Domain-specific state management (one hook per domain)
- **Components** (`src/renderer/components/`) — Presentational: sidebar, terminals, code viewer, file tree
- **Styles** — Co-located `*.styles.ts` files exporting plain objects (not CSS modules)

### Tech Stack

- Electron + electron-vite
- React 18, TypeScript
- xterm.js + node-pty for terminal emulation
- Monaco Editor for code viewing
- simple-git for worktree/diff operations
- Vitest for testing
