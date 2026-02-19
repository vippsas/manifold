# Manifold v1 - Specification

## Summary

**Manifold** is a Mac desktop app that orchestrates multiple CLI-based coding agents in parallel. Each agent runs in its own git worktree with a dedicated PTY, enabling fully isolated concurrent development sessions. The key differentiator over existing tools (e.g., Conductor) is **mid-session prompting** — users can type directly into any running agent's terminal at any time, steering agents mid-flight without interrupting others. Manifold is **agent-agnostic**: it works with Claude Code, Codex, Gemini CLI, or any custom CLI binary.

## Tech Stack

| Layer | Technology |
|-------|------------|
| App framework | Electron |
| Main process | Node.js |
| PTY management | node-pty |
| Git operations | simple-git |
| Renderer | React |
| Terminal rendering | xterm.js |
| PR creation | gh CLI |
| Package manager | TBD (npm / pnpm) |

## Core Features (MVP)

### 1. Spawn Agents in Worktrees

Each agent session creates an isolated git worktree and spawns a CLI agent process inside it.

**Flow:**
1. User clicks "New Agent" from an already-onboarded repo (see [Repository Onboarding](#repository-onboarding))
2. App creates a git worktree from the current base branch
3. Branch name is auto-generated from a Norwegian city name (e.g., `manifold/bergen`, `manifold/tromsø`) — user can rename before or after launch
4. App spawns the selected agent runtime in a PTY rooted at the worktree path
5. Agent receives the initial prompt via stdin

**Worktree management:**
- Created via `git worktree add` (using simple-git)
- Located in a `.manifold/worktrees/` directory relative to the project root
- Fully isolated — no shared state between agents
- Persisted across app restarts (worktree directories survive, sessions do not)
- Cleaned up manually by user or via a "Remove" action in the UI

**Branch naming (auto-generated from Norwegian cities):**
- Pick a random Norwegian city name from a built-in list
- Prefix: `manifold/<city-name>`
- Handle collisions by picking the next unused city or appending a numeric suffix
- User can rename the branch via the panel header (click to edit)
- Examples:
  - `manifold/bergen`
  - `manifold/tromsø`
  - `manifold/stavanger`
  - `manifold/bodø`
  - `manifold/narvik`

**City name pool (built-in, ~100 names):**
- Includes major and minor Norwegian cities: Oslo, Bergen, Trondheim, Stavanger, Tromsø, Bodø, Narvik, Hammerfest, Kristiansand, Drammen, Fredrikstad, Ålesund, Haugesund, Molde, Lillehammer, Gjøvik, Harstad, Alta, Kirkenes, Vadsø, Honningsvåg, Leknes, Svolvær, Sortland, Finnsnes, etc.
- Names are lowercased and slugified for branch compatibility (e.g., `tromsø` → `tromso`)

### 2. Mid-Session Prompting

Users type directly into the xterm.js terminal — input is written to the agent's PTY stdin in real-time, just like a native terminal.

**How it works:**
- Each agent panel is a fully interactive xterm.js instance
- Keyboard input in the focused panel writes to that agent's PTY stdin
- No special prompt bar — the terminal IS the input
- Non-blocking: typing into one panel doesn't affect other agents
- Works during any agent state (thinking, waiting for input, idle)

### 3. Live Terminal Output

Each agent's PTY stdout streams into its xterm.js instance in real-time.

**Requirements:**
- Full ANSI/color support (xterm.js handles this natively)
- Scrollback buffer (configurable, default 5000 lines)
- No noticeable lag — stream data as it arrives via IPC events
- Support for agent-specific terminal features (progress bars, spinners, etc.)

### 4. Agent Status Detection

Parse each agent's terminal output to determine its current state and display a status badge.

**Status states:**

| Status | Detection | Badge |
|--------|-----------|-------|
| Running | Agent process is alive and producing output | Blue, pulsing |
| Waiting for Input | Agent output contains input prompt pattern | Yellow |
| Done | Agent process exited with code 0 | Green |
| Error | Agent process exited with non-zero code | Red |

**Per-runtime output patterns:**

| Runtime | Waiting pattern | Notes |
|---------|----------------|-------|
| Claude Code | `❯` prompt, permission prompts | Also detects tool use vs thinking |
| Codex | Input prompt | TBD — needs investigation |
| Gemini CLI | Input prompt | TBD — needs investigation |
| Custom | Configurable regex | User provides pattern in settings |

## Agent Runtimes

### Supported Runtimes (v1)

| Runtime | Binary | Notes |
|---------|--------|-------|
| Claude Code | `claude` | Primary target, best-tested |
| OpenAI Codex CLI | `codex` | |
| Gemini CLI | `gemini` | |
| Custom | User-specified path | Any CLI binary that accepts stdin |

### Runtime Configuration

```typescript
interface AgentRuntime {
  id: string;
  name: string;           // Display name
  binary: string;         // Binary name or absolute path
  args?: string[];        // Default CLI arguments
  waitingPattern?: RegExp; // Regex to detect "waiting for input"
  env?: Record<string, string>; // Additional environment variables
}
```

**Built-in runtimes** are pre-configured for Claude Code, Codex, and Gemini CLI. Users can add custom runtimes via settings.

## UI Design

### Layout: Three-Pane (Terminal + Code Viewer + File Tree)

The UI focuses on **one agent at a time** with a three-pane layout. Agent switching happens via tabs or the agent list.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Manifold                                              [⚙]  [—] [□] [×] │
├──────────┬───────────────────────────────────────────────────────────────┤
│ PROJECTS │  my-app (main)  [New Agent]                                   │
│          ├──────────────────────────────────────────────────┬────────────┤
│ ● my-app │  ● bergen (Claude) [Running] │ tromsø (Codex)   │ FILE TREE │
│   api    ├──────────────────────────────┬───────────────────┤           │
│   docs   │                              │                   │ ▼ src/    │
│          │  TERMINAL                    │  CODE VIEWER      │   app.ts  │
│ [+ Add]  │                              │                   │   auth.ts │
│ [Clone]  │  $ claude                    │  src/auth.ts      │ ● login.ts│
│          │  > Analyzing auth flow...    │  ──────────────── │   utils/  │
│          │  > Found issue in login.ts   │   17  function    │ ▼ tests/  │
│          │  > Reading src/auth.ts...    │   18    login() { │   auth.   │
│          │  > Fixing login validation   │ - 19    validate()│   test.ts │
│          │  > ...                       │ + 19    if (!tok){ │           │
│          │  >                           │ + 20      throw.. │           │
│          │  > _                         │   21    }         │           │
│          │                              │                   │           │
│          ├──────────────────────────────┴───────────────────┴────────────┤
│          │ bergen: Running | 3 files changed | base: main                │
└──────────┴───────────────────────────────────────────────────────────────┘
```

**Three panes:**

| Pane | Content | Behavior |
|------|---------|----------|
| **Terminal** (left) | xterm.js — the focused agent's live terminal | Fully interactive: type directly to send input to PTY. Scrollback buffer. |
| **Code Viewer** (center) | Diff view or file content | Shows changes the agent is making in real-time. Switches between diff mode (changed files) and file mode (click a file to view). Read-only. |
| **File Tree** (right) | Worktree directory structure | Browsable file tree of the agent's worktree. Click a file to open it in the Code Viewer. Changed files are marked (● dot or color). |

**Pane resizing:**
- All three panes are resizable via draggable dividers
- Double-click a divider to reset to default proportions (40% / 40% / 20%)

### Agent Tabs

When multiple agents are running, they appear as tabs above the three-pane area:
- Each tab shows: status badge + branch name (city) + runtime icon
- Click a tab to switch the entire three-pane view to that agent
- Right-click tab for context menu (kill, restart, remove, create PR, rename branch)
- Active tab is highlighted

### Project Sidebar (Left)

- Lists all onboarded repositories
- Click to select active project
- "+ Add" button — onboard a local repo via file dialog
- "Clone" button — onboard via git clone
- Active project is highlighted
- Shows agent count badge per project

### Top Bar

- Active project name and base branch
- "New Agent" button (disabled if no project selected) — opens a quick-launch popover:
  - Agent runtime selector (dropdown, defaults to user preference)
  - Branch name (pre-filled with Norwegian city, editable)
  - Initial prompt (text input)
  - "Launch" button
- Settings gear icon

### Code Viewer Modes

**Diff mode (default when agent is working):**
- Shows a unified diff of all changes the agent has made vs the base branch
- Updates live as the agent modifies files
- File-by-file collapsible sections
- Syntax-highlighted with green/red for additions/deletions

**File mode (when user clicks a file in the tree):**
- Shows the full file content with syntax highlighting
- If the file has changes, highlights modified lines inline
- Read-only — the agent is the one making edits

### File Tree Behavior

- Mirrors the agent's worktree directory structure
- Auto-refreshes when files change (watch via `fs.watch` or polling)
- Changed files are marked with a colored dot (● orange for modified, ● green for added, ● red for deleted)
- Click a file to view it in the Code Viewer (file mode)
- Click "Changes" header to switch Code Viewer back to diff mode
- Collapsible directories, remembers expand/collapse state per agent

### Status Bar (Bottom)

- Active agent: branch name + status
- Files changed count
- Base branch name

## Repository Onboarding

Repos must be onboarded to Manifold before agents can be spawned. This is a one-time setup per repo that registers it in Manifold's project list.

### Onboard a Local Repository

1. User clicks "Add Repository" in the project sidebar
2. File dialog or drag-and-drop to select a local git repository
3. App validates it's a git repo (checks for `.git`)
4. App registers the repo in `~/.manifold/projects.json`
5. Repo appears in the project list — user can now select it and spawn agents

### Onboard via Clone

1. User clicks "Clone Repository" in the project sidebar
2. User provides a GitHub/Git URL
3. App clones the repo to a user-selected location
4. App registers the cloned repo in `~/.manifold/projects.json`
5. Repo appears in the project list

### Project Registry

Stored in `~/.manifold/projects.json`:

```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "my-app",
      "path": "/Users/sven/git/my-app",
      "baseBranch": "main",
      "addedAt": "2026-02-19T12:00:00Z"
    }
  ]
}
```

### Project Sidebar

The app shows a persistent project list on the left:
- All onboarded repos listed by name
- Click a repo to select it as the active project
- "New Agent" button is only enabled when a repo is selected
- Right-click repo for context menu: remove from Manifold, open in Finder, change base branch

## Completion Flow (PR Creation)

When an agent finishes (process exits with code 0):

1. Agent panel shows "Done" status badge
2. User right-clicks or clicks a "Review" button on the panel
3. App shows a **diff summary** overlay:
   - Files changed, insertions, deletions
   - Scrollable unified diff view
4. User clicks "Create PR"
5. App pushes the worktree branch to the remote
6. App creates a PR via `gh pr create` with:
   - Title: auto-generated from the branch name
   - Body: summary of changes + "Created with Manifold"
7. App shows the PR URL as a clickable link

**User confirms before any push or PR creation.** Nothing goes to GitHub without explicit approval.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Agent process crashes | Terminal stays open with error output visible. Status badge turns red. User can review output, restart, or remove. |
| Agent exits non-zero | Same as crash — terminal persists, red badge. |
| Git worktree creation fails | Show error notification. Do not spawn agent. |
| Clone fails | Show error with details (auth, network, invalid URL). |
| `gh` CLI not found | Show setup instructions for GitHub CLI. |
| `gh` auth not configured | Prompt user to run `gh auth login`. |
| Binary not found | Show error: "Runtime binary 'X' not found in PATH". |
| Worktree directory conflict | Append numeric suffix to worktree path. |

## Settings / Preferences

Stored in `~/.manifold/config.json` (or Electron's `app.getPath('userData')`).

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `defaultRuntime` | string | `"claude"` | Default agent runtime for new sessions |
| `theme` | `"dark" \| "light"` | `"dark"` | UI and terminal color theme |
| `githubAuth` | object | `{}` | GitHub CLI auth configuration/status |
| `scrollbackLines` | number | `5000` | Terminal scrollback buffer size |
| `defaultBaseBranch` | string | `"main"` | Branch to create worktrees from |

## Persistence

**What persists across app restarts:**
- Onboarded project registry (`~/.manifold/projects.json`)
- Worktree directories on disk (they're just git worktrees)
- Settings / preferences

**What does NOT persist:**
- Agent PTY sessions (processes are killed on app exit)
- Terminal scrollback history
- Agent status state

**On app restart:**
- App detects existing worktrees in `.manifold/worktrees/`
- Shows them in a "Previous Worktrees" view
- User can clean up (delete) or re-launch agents in existing worktrees

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Electron App                        │
│                                                      │
│  ┌──────────────────┐    ┌────────────────────────┐  │
│  │  Renderer Process │    │    Main Process        │  │
│  │  (React)          │    │    (Node.js)           │  │
│  │                   │    │                        │  │
│  │  ┌─────────────┐  │    │  ┌──────────────────┐  │  │
│  │  │ Terminal     │  │◄──►│  │  SessionManager  │  │  │
│  │  │ (xterm.js)   │  │IPC │  │                  │  │  │
│  │  └─────────────┘  │    │  │  ┌────────────┐   │  │  │
│  │  ┌─────────────┐  │    │  │  │ PTY Pool   │   │  │  │
│  │  │ CodeViewer   │  │    │  │  │ (node-pty) │   │  │  │
│  │  └─────────────┘  │    │  │  └────────────┘   │  │  │
│  │  ┌─────────────┐  │    │  │                  │  │  │
│  │  │ FileTree     │  │    │  │  ┌────────────┐   │  │  │
│  │  └─────────────┘  │    │  │  │ Worktree   │   │  │  │
│  │  ┌─────────────┐  │    │  │  │ Manager    │   │  │  │
│  │  │ AgentTabs    │  │    │  │  │(simple-git)│   │  │  │
│  │  └─────────────┘  │    │  │  └────────────┘   │  │  │
│  │  ┌─────────────┐  │    │  │                  │  │  │
│  │  │ StatusBar    │  │    │  │  ┌────────────┐   │  │  │
│  │  └─────────────┘  │    │  │  │ PR Creator │   │  │  │
│  │                    │    │  │  │ (gh CLI)   │   │  │  │
│  └──────────────────┘    │  │  └────────────┘   │  │  │
│                          │  └──────────────────┘  │  │
│                          └────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Main Process Modules

| Module | Responsibility |
|--------|---------------|
| `SessionManager` | Lifecycle of agent sessions (create, kill, restart) |
| `PTYPool` | Spawn and manage node-pty instances, pipe data via IPC |
| `WorktreeManager` | Create/delete git worktrees, auto-name branches |
| `FileWatcher` | Watch worktree for file changes, emit events to renderer |
| `DiffProvider` | Compute git diff between worktree branch and base branch |
| `PRCreator` | Push branches, create PRs via `gh` CLI |
| `ProjectRegistry` | Onboarded repos CRUD, project list persistence |
| `BranchNamer` | Norwegian city name pool, collision handling |
| `SettingsStore` | Read/write user preferences |

### Renderer Components

| Component | Responsibility |
|-----------|---------------|
| `App` | Top-level layout, routing |
| `ProjectSidebar` | Onboarded repo list, add/clone actions |
| `AgentTabs` | Tab bar for switching between agents |
| `TerminalPane` | xterm.js terminal for the active agent |
| `CodeViewer` | Diff view or file content with syntax highlighting |
| `FileTree` | Worktree directory browser, file change indicators |
| `NewAgentPopover` | Quick-launch form for new agents |
| `SettingsModal` | User preferences editor |
| `StatusBar` | Active agent info, file change count |

### IPC Events

| Channel | Direction | Payload |
|---------|-----------|---------|
| `project:list` | Renderer → Main | `{}` |
| `project:add` | Renderer → Main | `{ path }` |
| `project:clone` | Renderer → Main | `{ url, destPath }` |
| `project:remove` | Renderer → Main | `{ projectId }` |
| `agent:spawn` | Renderer → Main | `{ projectId, runtime, prompt }` |
| `agent:input` | Renderer → Main | `{ agentId, data }` |
| `agent:kill` | Renderer → Main | `{ agentId }` |
| `agent:output` | Main → Renderer | `{ agentId, data }` |
| `agent:status` | Main → Renderer | `{ agentId, status }` |
| `agent:exit` | Main → Renderer | `{ agentId, code }` |
| `files:tree` | Renderer → Main | `{ agentId }` |
| `files:tree:result` | Main → Renderer | `{ agentId, tree }` |
| `files:read` | Renderer → Main | `{ agentId, filePath }` |
| `files:read:result` | Main → Renderer | `{ agentId, filePath, content }` |
| `files:changed` | Main → Renderer | `{ agentId, changes[] }` |
| `diff:get` | Renderer → Main | `{ agentId }` |
| `diff:result` | Main → Renderer | `{ agentId, diff }` |
| `pr:create` | Renderer → Main | `{ agentId }` |
| `pr:result` | Main → Renderer | `{ agentId, url }` |

## Project Structure

```
manifold/
├── package.json
├── electron-builder.yml       # Electron packaging config
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # App entry point
│   │   ├── session-manager.ts # Agent session lifecycle
│   │   ├── pty-pool.ts        # node-pty management
│   │   ├── worktree-manager.ts# Git worktree operations
│   │   ├── file-watcher.ts     # Watch worktree for changes (fs.watch/chokidar)
│   │   ├── diff-provider.ts   # Git diff between worktree and base branch
│   │   ├── pr-creator.ts      # GitHub PR creation via gh
│   │   ├── settings-store.ts  # Persistent settings
│   │   ├── branch-namer.ts    # Norwegian city name pool + branch generation
│   │   ├── project-registry.ts# Onboarded repos CRUD (~/.manifold/projects.json)
│   │   └── ipc-handlers.ts    # IPC channel registrations
│   ├── renderer/              # React frontend
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ProjectSidebar.tsx
│   │   │   ├── AgentTabs.tsx
│   │   │   ├── TerminalPane.tsx
│   │   │   ├── CodeViewer.tsx
│   │   │   ├── FileTree.tsx
│   │   │   ├── NewAgentPopover.tsx
│   │   │   ├── SettingsModal.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── hooks/
│   │   │   ├── useAgentSession.ts
│   │   │   ├── useTerminal.ts
│   │   │   ├── useFileWatcher.ts
│   │   │   ├── useDiff.ts
│   │   │   └── useSettings.ts
│   │   └── styles/
│   │       └── theme.css
│   └── shared/                # Shared types between main/renderer
│       └── types.ts
├── specs/
│   └── manifold-v1.md         # This file
└── .manifold/                 # Created per-project at runtime
    └── worktrees/             # Agent worktree directories
```

## Build Order

### Phase 1: Foundation
1. Scaffold Electron + React project with TypeScript
2. Implement `WorktreeManager` — create/delete worktrees, auto-name branches
3. Implement `PTYPool` — spawn node-pty, read/write stdin/stdout
4. Wire up IPC between main and renderer

### Phase 2: Core UI — Three Panes
5. Build `TerminalPane` with xterm.js — render PTY output, accept keyboard input
6. Build `FileTree` — read worktree directory, display tree, handle clicks
7. Build `CodeViewer` — file content display with syntax highlighting
8. Build `NewAgentPopover` — quick-launch with runtime selector and prompt input
9. Implement `SessionManager` — tie worktrees + PTY + agent lifecycle together
10. Wire up three-pane layout with resizable dividers

### Phase 3: Live Updates & Completion
11. Implement `FileWatcher` — watch worktree for changes, push updates to renderer
12. Implement `DiffProvider` — compute and stream diffs to Code Viewer
13. Build `AgentTabs` — tab bar for switching between agents
14. Implement agent status detection (parse output patterns per runtime)
15. Implement `PRCreator` — push branch + `gh pr create` with confirmation flow
16. Build `StatusBar`

### Phase 4: Polish
17. Implement `SettingsStore` and `SettingsModal`
18. Add theme support (dark/light)
19. Detect existing worktrees on app restart
20. Clone-from-URL project setup
21. Error handling and edge cases

## Open Questions

- **Electron version**: Latest stable (v33+) or specific version for node-pty compatibility?
- **React framework**: Plain React, or use a framework like Vite for bundling?
- **State management**: React Context, Zustand, or Jotai for renderer state?
- **Terminal font**: Ship a monospace font (e.g., JetBrains Mono) or use system default?
- **Auto-update**: Include Electron auto-updater in v1?
- **Testing strategy**: Unit tests for main process modules? E2E with Playwright/Spectron?
- **License**: Open source or proprietary?
