# Manifold v1 Implementation Plan

## Goal

Build an Electron desktop app that orchestrates multiple CLI coding agents in isolated git worktrees with live terminal I/O, code diffing, and PR creation.

## Architecture

Electron app with main process handling PTY/git/file operations via node-pty and simple-git, communicating over IPC to a React renderer with xterm.js terminals, a Monaco-based code viewer, and a file tree. Three-pane layout focused on one agent at a time, with tab-based agent switching. Agent-agnostic design supports Claude Code, Codex, Gemini CLI, or any custom binary.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| App framework | Electron | ^33.0.0 |
| Main process | Node.js | (bundled with Electron) |
| PTY management | node-pty | ^1.0.0 |
| Git operations | simple-git | ^3.27.0 |
| Renderer framework | React | ^18.3.0 |
| Terminal rendering | @xterm/xterm | ^5.5.0 |
| Terminal fit addon | @xterm/addon-fit | ^0.10.0 |
| Code viewer | @monaco-editor/react | ^4.7.0 |
| Build tool | Vite | ^6.0.0 |
| Electron+Vite | electron-vite | ^2.4.0 |
| File watcher | chokidar | ^4.0.0 |
| UUID generation | uuid | ^11.0.0 |
| Bundler | electron-builder | ^25.0.0 |
| TypeScript | typescript | ^5.7.0 |
| PR creation | gh CLI | (system binary) |

## Files to Create (Build Order)

### 0. Project Scaffolding

#### `package.json`
- **Purpose:** Project manifest with all dependencies and scripts
- **Key exports:** N/A (config file)
- **Dependencies:** None

#### `tsconfig.json`
- **Purpose:** Root TypeScript config
- **Key exports:** N/A (config file)
- **Dependencies:** None

#### `tsconfig.node.json`
- **Purpose:** TypeScript config for main process (Node.js target)
- **Key exports:** N/A (config file)
- **Dependencies:** tsconfig.json

#### `tsconfig.web.json`
- **Purpose:** TypeScript config for renderer (DOM target)
- **Key exports:** N/A (config file)
- **Dependencies:** tsconfig.json

#### `electron.vite.config.ts`
- **Purpose:** electron-vite configuration for main + renderer builds
- **Key exports:** default config
- **Dependencies:** None

#### `src/renderer/index.html`
- **Purpose:** HTML entry point for the renderer process
- **Key exports:** N/A (HTML file)
- **Dependencies:** None

### 1. Shared Types

#### `src/shared/types.ts`
- **Purpose:** All TypeScript interfaces/types shared between main and renderer
- **Key exports:**
  - `AgentRuntime` — runtime config (id, name, binary, args, waitingPattern, env)
  - `AgentSession` — active session (id, projectId, runtimeId, branchName, worktreePath, status, pid)
  - `AgentStatus` — union type: `'running' | 'waiting' | 'done' | 'error'`
  - `Project` — registered project (id, name, path, baseBranch, addedAt)
  - `ProjectRegistry` — `{ projects: Project[] }`
  - `FileChange` — file change descriptor (path, type: added/modified/deleted)
  - `ManifoldSettings` — user preferences (defaultRuntime, theme, scrollbackLines, defaultBaseBranch)
  - `IpcChannels` — string literal union of all IPC channel names
- **Dependencies:** None

### 2. Main Process — Foundation

#### `src/main/branch-namer.ts`
- **Purpose:** Generate branch names from Norwegian city pool, handle collisions
- **Key exports:**
  - `generateBranchName(existingBranches: string[]): string`
  - `CITY_NAMES: string[]` (slugified Norwegian city names)
- **Dependencies:** `src/shared/types.ts`

#### `src/main/settings-store.ts`
- **Purpose:** Read/write user preferences to `~/.manifold/config.json`
- **Key exports:**
  - `class SettingsStore`
  - `getSettings(): ManifoldSettings`
  - `updateSettings(partial: Partial<ManifoldSettings>): void`
- **Dependencies:** `src/shared/types.ts`

#### `src/main/project-registry.ts`
- **Purpose:** CRUD for onboarded repos in `~/.manifold/projects.json`
- **Key exports:**
  - `class ProjectRegistry`
  - `listProjects(): Project[]`
  - `addProject(path: string): Project`
  - `removeProject(id: string): void`
  - `getProject(id: string): Project | undefined`
- **Dependencies:** `src/shared/types.ts`, `uuid`

#### `src/main/worktree-manager.ts`
- **Purpose:** Create/delete git worktrees, auto-name branches with Norwegian cities
- **Key exports:**
  - `class WorktreeManager`
  - `createWorktree(projectPath: string, baseBranch: string, branchName?: string): Promise<{ worktreePath: string; branchName: string }>`
  - `removeWorktree(projectPath: string, worktreePath: string): Promise<void>`
  - `listWorktrees(projectPath: string): Promise<WorktreeInfo[]>`
- **Dependencies:** `src/shared/types.ts`, `simple-git`, `src/main/branch-namer.ts`

#### `src/main/pty-pool.ts`
- **Purpose:** Spawn and manage node-pty instances, pipe data via IPC
- **Key exports:**
  - `class PTYPool`
  - `spawn(options: { binary: string; args: string[]; cwd: string; env?: Record<string,string> }): { id: string; pty: IPty }`
  - `write(id: string, data: string): void`
  - `kill(id: string): void`
  - `resize(id: string, cols: number, rows: number): void`
  - `onData(id: string, callback: (data: string) => void): void`
  - `onExit(id: string, callback: (code: number) => void): void`
- **Dependencies:** `node-pty`, `uuid`

### 3. Main Process — Session & Files

#### `src/main/session-manager.ts`
- **Purpose:** Tie worktrees + PTY + agent lifecycle together
- **Key exports:**
  - `class SessionManager`
  - `createSession(projectId: string, runtimeId: string, prompt: string): Promise<AgentSession>`
  - `killSession(sessionId: string): void`
  - `getSession(sessionId: string): AgentSession | undefined`
  - `listSessions(): AgentSession[]`
  - `sendInput(sessionId: string, data: string): void`
- **Dependencies:** `src/shared/types.ts`, `src/main/worktree-manager.ts`, `src/main/pty-pool.ts`, `src/main/project-registry.ts`, `src/main/settings-store.ts`, `src/main/branch-namer.ts`

#### `src/main/file-watcher.ts`
- **Purpose:** Watch worktree directories for file changes, emit events
- **Key exports:**
  - `class FileWatcher`
  - `watch(worktreePath: string, callback: (changes: FileChange[]) => void): void`
  - `unwatch(worktreePath: string): void`
  - `getFileTree(worktreePath: string): Promise<FileTreeNode[]>`
  - `readFile(worktreePath: string, filePath: string): Promise<string>`
- **Dependencies:** `chokidar`, `src/shared/types.ts`

#### `src/main/diff-provider.ts`
- **Purpose:** Compute git diff between worktree branch and base branch
- **Key exports:**
  - `class DiffProvider`
  - `getDiff(projectPath: string, worktreePath: string, baseBranch: string): Promise<string>`
  - `getChangedFiles(projectPath: string, worktreePath: string, baseBranch: string): Promise<FileChange[]>`
- **Dependencies:** `simple-git`, `src/shared/types.ts`

#### `src/main/status-detector.ts`
- **Purpose:** Parse terminal output to determine agent status (running/waiting/done/error)
- **Key exports:**
  - `class StatusDetector`
  - `detectStatus(output: string, runtimeId: string): AgentStatus`
  - `getPatterns(runtimeId: string): RegExp[]`
- **Dependencies:** `src/shared/types.ts`

#### `src/main/pr-creator.ts`
- **Purpose:** Push branches and create PRs via gh CLI
- **Key exports:**
  - `class PRCreator`
  - `pushBranch(worktreePath: string, branchName: string): Promise<void>`
  - `createPR(worktreePath: string, title: string, body: string): Promise<string>` (returns PR URL)
  - `isGhAvailable(): Promise<boolean>`
- **Dependencies:** `child_process` (execFile)

### 4. Main Process — IPC & Entry

#### `src/main/ipc-handlers.ts`
- **Purpose:** Register all IPC channel handlers, wire main process modules to renderer events
- **Key exports:**
  - `registerIpcHandlers(deps: { sessionManager, projectRegistry, fileWatcher, diffProvider, prCreator, settingsStore }): void`
- **Dependencies:** `electron` (ipcMain), all main process modules

#### `src/main/runtimes.ts`
- **Purpose:** Built-in agent runtime definitions (Claude, Codex, Gemini)
- **Key exports:**
  - `BUILT_IN_RUNTIMES: AgentRuntime[]`
  - `getRuntimeById(id: string): AgentRuntime | undefined`
- **Dependencies:** `src/shared/types.ts`

#### `src/main/index.ts`
- **Purpose:** Electron app entry point — create BrowserWindow, init all modules, register IPC
- **Key exports:** N/A (entry point)
- **Dependencies:** `electron`, all main process modules

### 5. Renderer — Hooks

#### `src/renderer/hooks/useIpc.ts`
- **Purpose:** Generic IPC communication hook (invoke/on/off)
- **Key exports:**
  - `useIpcInvoke<T>(channel: string, ...args: any[]): { data: T | null; loading: boolean; error: Error | null; invoke: () => void }`
  - `useIpcListener(channel: string, callback: (...args: any[]) => void): void`
- **Dependencies:** `electron` (ipcRenderer via preload)

#### `src/renderer/hooks/useProjects.ts`
- **Purpose:** Project list state and CRUD operations
- **Key exports:**
  - `useProjects(): { projects: Project[]; addProject: (path: string) => void; removeProject: (id: string) => void; activeProject: Project | null; setActiveProject: (id: string) => void }`
- **Dependencies:** `src/renderer/hooks/useIpc.ts`, `src/shared/types.ts`

#### `src/renderer/hooks/useAgentSession.ts`
- **Purpose:** Agent session lifecycle management
- **Key exports:**
  - `useAgentSessions(): { sessions: AgentSession[]; activeSession: AgentSession | null; setActiveSession: (id: string) => void; spawnAgent: (opts) => void; killAgent: (id: string) => void }`
- **Dependencies:** `src/renderer/hooks/useIpc.ts`, `src/shared/types.ts`

#### `src/renderer/hooks/useTerminal.ts`
- **Purpose:** xterm.js terminal instance management — attach to PTY via IPC
- **Key exports:**
  - `useTerminal(sessionId: string | null): { terminalRef: RefObject<HTMLDivElement>; fitAddon: FitAddon }`
- **Dependencies:** `@xterm/xterm`, `@xterm/addon-fit`, `src/renderer/hooks/useIpc.ts`

#### `src/renderer/hooks/useFileWatcher.ts`
- **Purpose:** File tree state and file change subscriptions
- **Key exports:**
  - `useFileTree(sessionId: string | null): { tree: FileTreeNode[]; changes: FileChange[]; readFile: (path: string) => Promise<string> }`
- **Dependencies:** `src/renderer/hooks/useIpc.ts`, `src/shared/types.ts`

#### `src/renderer/hooks/useDiff.ts`
- **Purpose:** Git diff state for the active agent
- **Key exports:**
  - `useDiff(sessionId: string | null): { diff: string; changedFiles: FileChange[]; loading: boolean }`
- **Dependencies:** `src/renderer/hooks/useIpc.ts`, `src/shared/types.ts`

#### `src/renderer/hooks/useSettings.ts`
- **Purpose:** User settings state and update operations
- **Key exports:**
  - `useSettings(): { settings: ManifoldSettings; updateSettings: (partial: Partial<ManifoldSettings>) => void }`
- **Dependencies:** `src/renderer/hooks/useIpc.ts`, `src/shared/types.ts`

### 6. Renderer — Preload

#### `src/preload/index.ts`
- **Purpose:** Expose safe IPC bridge to renderer via contextBridge
- **Key exports:**
  - `window.electronAPI.invoke(channel, ...args)`
  - `window.electronAPI.on(channel, callback)`
  - `window.electronAPI.off(channel, callback)`
- **Dependencies:** `electron` (contextBridge, ipcRenderer)

### 7. Renderer — Components

#### `src/renderer/components/ProjectSidebar.tsx`
- **Purpose:** Left sidebar listing onboarded repos with add/clone actions
- **Key exports:** `ProjectSidebar` component
- **Dependencies:** `src/renderer/hooks/useProjects.ts`

#### `src/renderer/components/AgentTabs.tsx`
- **Purpose:** Tab bar for switching between running agents
- **Key exports:** `AgentTabs` component
- **Dependencies:** `src/renderer/hooks/useAgentSession.ts`

#### `src/renderer/components/TerminalPane.tsx`
- **Purpose:** xterm.js terminal for the focused agent
- **Key exports:** `TerminalPane` component
- **Dependencies:** `src/renderer/hooks/useTerminal.ts`

#### `src/renderer/components/CodeViewer.tsx`
- **Purpose:** Monaco-based diff/file viewer with syntax highlighting
- **Key exports:** `CodeViewer` component
- **Dependencies:** `@monaco-editor/react`, `src/renderer/hooks/useDiff.ts`, `src/renderer/hooks/useFileWatcher.ts`

#### `src/renderer/components/FileTree.tsx`
- **Purpose:** Worktree directory browser with file change indicators
- **Key exports:** `FileTree` component
- **Dependencies:** `src/renderer/hooks/useFileWatcher.ts`

#### `src/renderer/components/NewAgentPopover.tsx`
- **Purpose:** Quick-launch form: runtime selector, branch name, initial prompt, launch button
- **Key exports:** `NewAgentPopover` component
- **Dependencies:** `src/renderer/hooks/useAgentSession.ts`, `src/renderer/hooks/useProjects.ts`

#### `src/renderer/components/SettingsModal.tsx`
- **Purpose:** User preferences editor (theme, default runtime, scrollback, etc.)
- **Key exports:** `SettingsModal` component
- **Dependencies:** `src/renderer/hooks/useSettings.ts`

#### `src/renderer/components/StatusBar.tsx`
- **Purpose:** Bottom bar showing active agent info, files changed, base branch
- **Key exports:** `StatusBar` component
- **Dependencies:** `src/renderer/hooks/useAgentSession.ts`, `src/renderer/hooks/useDiff.ts`

### 8. Renderer — App Shell

#### `src/renderer/styles/theme.css`
- **Purpose:** Dark/light theme CSS variables and global styles
- **Key exports:** N/A (CSS)
- **Dependencies:** None

#### `src/renderer/App.tsx`
- **Purpose:** Top-level layout: sidebar + tabs + three-pane area + status bar
- **Key exports:** `App` component
- **Dependencies:** All renderer components

#### `src/renderer/index.tsx`
- **Purpose:** React entry point — render App into DOM
- **Key exports:** N/A (entry point)
- **Dependencies:** `src/renderer/App.tsx`

## Build Order Summary

| Phase | Files | Depends On |
|-------|-------|------------|
| 0 | package.json, tsconfigs, vite config, index.html | — |
| 1 | shared/types.ts | — |
| 2 | branch-namer, settings-store, project-registry, worktree-manager, pty-pool | types.ts |
| 3 | session-manager, file-watcher, diff-provider, status-detector, pr-creator | Phase 2 modules |
| 4 | ipc-handlers, runtimes, main/index.ts | Phase 3 modules |
| 5 | preload/index.ts, hooks/* | types.ts, preload |
| 6 | Components: ProjectSidebar, AgentTabs, TerminalPane, CodeViewer, FileTree, NewAgentPopover, SettingsModal, StatusBar | hooks |
| 7 | theme.css, App.tsx, renderer/index.tsx | All components |

## Total: 35 source files + 5 config files = 40 files
