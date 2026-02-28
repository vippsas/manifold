# Session Manager Decomposition

## Problem

`SessionManager` (902 lines, 35 methods) is a god class handling session CRUD, PTY output wiring, stream-JSON parsing, session discovery, dev server management, and print-mode orchestration. The interactive and non-interactive code paths share a file but have minimal overlap.

## Approach

Extract three internal delegate classes. SessionManager remains the sole public API — IPC handlers and external callers are unchanged. The delegates are private implementation details injected by SessionManager's constructor.

## Extracted Classes

### 1. SessionStreamWirer (~120 lines)

**File:** `src/main/session-stream-wirer.ts`

Owns all PTY-to-session output wiring: connecting PTY data/exit events to status detection, URL detection, output buffering, chat adapter forwarding, and renderer notifications.

**Moved methods:**
- `wireOutputStreaming` — terminal output buffering, status/URL detection, chat adapter
- `wireExitHandling` — standard exit → done transition
- `wireStreamJsonOutput` — NDJSON line buffering and parsing
- `handleStreamJsonEvent` — assistant/result event processing for chat
- `detectUrlInText` — URL detection in stream-json text output
- `wirePrintModeExitHandling` — exit → waiting transition for print mode
- `wirePrintModeInitialExitHandling` — exit → auto-start dev server after initial build

**Dependencies:** `PtyPool`, `ChatAdapter | null`, `sendToRenderer` callback, `onDevServerNeeded` callback (for initial-exit → startDevServer chain).

### 2. SessionDiscovery (~110 lines)

**File:** `src/main/session-discovery.ts`

Discovers dormant sessions from existing worktrees and simple-mode project directories on app startup or project switch.

**Moved methods:**
- `discoverSessionsForProject` — scans worktrees for a single project, creates dormant session stubs
- `discoverAllSessions` — iterates all registered projects, discovers worktree sessions and simple-mode stubs

**Dependencies:** `Map<string, InternalSession>` (shared reference), `WorktreeManager`, `ProjectRegistry`, `FileWatcher | undefined`.

### 3. DevServerManager (~120 lines)

**File:** `src/main/dev-server-manager.ts`

Manages the non-interactive "simple mode" workflow: creating dev-server sessions, spawning `npm run dev`, and handling print-mode follow-up messages.

**Moved methods:**
- `startDevServerSession` — creates a non-interactive session, cleans up existing sessions for the project, starts dev server
- `startDevServer` — spawns `npm run dev`, wires output for URL detection
- `spawnPrintModeFollowUp` — spawns a fresh `claude -c -p` process for follow-up messages in print mode

**Dependencies:** `PtyPool`, `ChatAdapter | null`, `Map<string, InternalSession>`, `ProjectRegistry`, `sendToRenderer` callback, `SessionStreamWirer`.

## What Stays in SessionManager (~350 lines)

- Session registry (`Map<string, InternalSession>`, getters, `toPublicSession`)
- Core lifecycle: `createSession`, `killSession`, `resumeSession`, `killAllSessions`, `killInteractiveSession`, `killNonInteractiveSessions`
- Input routing: `sendInput` (dispatches to DevServerManager for non-interactive), `resize`
- Shell sessions: `createShellSession`
- Helpers: `resolveProject`, `resolveRuntime`, `buildSession`, `assertCleanWorkingTree`, `persistAdditionalDirs`
- Constructor creates and owns the three delegates

## Shared Type

`InternalSession` stays defined in `session-manager.ts` and is exported for the delegates to use. It is not part of the public API (not in `shared/types.ts`).

## Invariants

- `IpcDependencies` interface unchanged — only exposes `sessionManager`
- `agent-handlers.ts` unchanged — all calls go through `sessionManager.*`
- `index.ts` wiring unchanged — SessionManager constructor creates delegates internally
- All existing tests continue to pass against SessionManager's public API
- No new IPC channels or preload changes
