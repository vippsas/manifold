# Manifold

A macOS desktop app that orchestrates multiple CLI coding agents working in parallel on the same project. Each agent runs in its own git worktree, so agents can work on isolated branches simultaneously without conflicts.

Supports **Claude Code**, **Codex**, **Copilot**, and **Gemini CLI** — plus local models via **Ollama**.

![Manifold](manifold.jpg)

Agents run in a native terminal — no wrapping, no abstractions. You get the full CLI experience exactly as if you ran the agent yourself.

## Install

Download the latest `.dmg` from [GitHub Releases](https://github.com/svenmalvik/manifold/releases), open it, and drag Manifold to your Applications folder.

### Prerequisites

You need at least one agent CLI installed:

| Agent | Install |
|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code` |
| Codex | `npm install -g @openai/codex` |
| Copilot | `npm install -g @githubnext/github-copilot-cli` |
| Gemini CLI | `npm install -g @anthropic-ai/gemini-cli` |

Git must be installed. For creating PRs from within Manifold, install the [GitHub CLI](https://cli.github.com/) (`gh`).

## Two modes

Manifold ships with two UI modes you can switch between at any time.

### Developer view

The full multi-agent workspace for developers. A resizable panel layout with six panes, each toggleable via keyboard shortcuts (Cmd+1 through Cmd+6):

- **Projects panel** — Repository browser with multi-project support
- **Agent terminal** — Live PTY output from the agent CLI. Type into the terminal at any time to steer the agent mid-flight.
- **Code viewer** — File diffs or full file contents as the agent makes changes. Powered by Monaco Editor.
- **File tree** — Browse all files in the agent's worktree. Modified files are marked with a dot.
- **Modified files** — Quick access to git-tracked changes.
- **Shell tabs** — Multi-tab terminal for the agent's worktree or the project root.
- **Web preview** — Opens automatically when the agent starts a dev server.

Status badges show each agent's state: **running**, **waiting** (for user input), **done**, or **error**.

### Simple view

A streamlined mode for quickly building web apps through chat. Describe what you want, and an AI agent scaffolds a React + TypeScript + Vite app with IndexedDB persistence, then starts a dev server so you can preview it immediately.

- **Dashboard** — See all your apps in a grid. Click "New App" to start.
- **Chat pane** — Send messages to iterate on the app. Agent responses render as markdown.
- **Live preview** — An embedded webview shows the running app, auto-reloading when the agent finishes a change.
- **Status banner** — Visual feedback on the current state (building, previewing, error).

You can switch to developer view at any time to access the full terminal, file tree, and git tools for the same project.

## Usage

### First launch

On first launch, Manifold shows a welcome screen where you:

1. **Configure storage** — Choose where agent worktrees are stored (defaults to `~/.manifold/`)
2. **Register a repository** — Add a local git repository or clone one from GitHub

### Creating agents

1. Click **New Agent** in the sidebar
2. Pick a **runtime** (Claude Code, Codex, Copilot, Gemini CLI, or a custom binary)
3. Give the agent a **prompt** describing what to do
4. Optionally edit the **branch name** (auto-generated, always prefixed `manifold/`)
5. Click **Launch**

Each agent gets its own git worktree branched from the project's main branch. Agents work in fully isolated copies of the codebase, so they never step on each other.

### Git operations

- **AI-assisted commits** — Auto-generate commit messages from diffs, or write your own
- **Create PR** — When an agent finishes, open a pull request with an AI-generated title and description via the GitHub CLI
- **Conflict detection** — Real-time polling alerts you when merge conflicts appear, with AI-powered resolution suggestions
- **Ahead/behind tracking** — See sync status between worktree branches and the base branch

### Key features

- **Parallel agents** — Run multiple agents on the same project simultaneously, each in an isolated worktree
- **Agent-agnostic** — Works with Claude Code, Codex, Copilot, Gemini CLI, Ollama, or any custom CLI binary
- **Two UI modes** — Full developer workspace or simplified app-builder chat
- **Web preview** — Embedded browser that auto-detects dev server URLs from agent output
- **AI-assisted git** — Auto-generated commit messages, PR descriptions, and branch names
- **Conflict detection** — Alerts and AI suggestions when merge conflicts appear
- **Persistent sessions** — Agent state, shell tabs, panel layout, and open files survive app restarts
- **50+ themes** — Includes custom Manifold themes plus popular community themes like Dracula, Nord, Monokai, and Solarized
- **Auto-updates** — Checks for new versions on launch and installs automatically

## Themes

Manifold ships with 50+ editor themes including two custom Manifold themes and popular community favorites like Dracula, Nord, Monokai, and Solarized. Browse themes with live preview, filter by dark/light, and search by name in **Settings**.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, project structure, code conventions, and pull request workflow.

## Architecture

Electron three-process model with strict context isolation:

- **Main** (`src/main/`) — Node.js runtime. Owns PTY processes, git worktrees, file system, settings.
- **Preload** (`src/preload/`) — IPC bridge. Whitelisted channels only.
- **Renderer — Developer** (`src/renderer/`) — React UI for the developer view. No direct Node.js access.
- **Renderer — Simple** (`src/renderer-simple/`) — React UI for the simple app-builder view.

### Main process modules

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
| `DevServerManager` | Spawns dev servers and detects preview URLs for simple mode |
| `ModeSwitcher` | Handles transitions between developer and simple views |

### Tech stack

| Layer | Technology |
|---|---|
| App framework | Electron |
| Frontend | React, TypeScript |
| Terminal | xterm.js + node-pty |
| Code viewer | Monaco Editor |
| Git operations | simple-git |
| Panel layout | Dockview |
| Build | electron-vite + electron-builder |
| Testing | Vitest |
