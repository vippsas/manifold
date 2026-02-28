# Session Manager Decomposition — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the 902-line `SessionManager` god class into four focused modules while preserving its public API.

**Architecture:** Extract three internal delegate classes (`SessionStreamWirer`, `SessionDiscovery`, `DevServerManager`) that SessionManager creates in its constructor and delegates to. A shared `InternalSession` type moves to its own file to avoid circular imports. External callers (IPC handlers, tests) continue to interact only with SessionManager.

**Tech Stack:** TypeScript, Node.js (Electron main process), node-pty, vitest

---

### Task 0: Establish green baseline

**Step 1: Run existing tests**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: All 25 tests pass.

**Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: No errors.

---

### Task 1: Extract InternalSession to session-types.ts

Avoids circular imports when delegates import the session type and SessionManager imports the delegates.

**Files:**
- Create: `src/main/session-types.ts`
- Modify: `src/main/session-manager.ts`

**Step 1: Create session-types.ts**

```typescript
// src/main/session-types.ts
import type { AgentSession } from '../shared/types'

export interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
  taskDescription?: string
  ollamaModel?: string
  detectedUrl?: string
  nonInteractive?: boolean
  devServerPtyId?: string
  /** Buffer for accumulating partial NDJSON lines from stream-json output */
  streamJsonLineBuffer?: string
}
```

**Step 2: Update session-manager.ts imports**

Replace the `InternalSession` interface definition (lines 19-29) with:

```typescript
import type { InternalSession } from './session-types'
```

Delete the old `interface InternalSession extends AgentSession { ... }` block.

**Step 3: Run tests**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: All 25 tests pass (no public API change).

**Step 4: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/main/session-types.ts src/main/session-manager.ts
git commit -m "refactor: extract InternalSession to session-types.ts"
```

---

### Task 2: Extract SessionStreamWirer

Moves all PTY output wiring, status/URL detection, stream-JSON parsing, and exit handling into a focused class.

**Files:**
- Create: `src/main/session-stream-wirer.ts`
- Modify: `src/main/session-manager.ts`

**Step 1: Create session-stream-wirer.ts**

```typescript
// src/main/session-stream-wirer.ts
import { PtyPool } from './pty-pool'
import { detectStatus } from './status-detector'
import { detectAddDir } from './add-dir-detector'
import { detectUrl } from './url-detector'
import type { ChatAdapter } from './chat-adapter'
import type { FileWatcher } from './file-watcher'
import { debugLog } from './debug-log'
import type { InternalSession } from './session-types'

type SendToRenderer = (channel: string, ...args: unknown[]) => void

export class SessionStreamWirer {
  constructor(
    private ptyPool: PtyPool,
    private getChatAdapter: () => ChatAdapter | null,
    private sendToRenderer: SendToRenderer,
    private fileWatcher: FileWatcher | undefined,
    private onPersistAdditionalDirs: (session: InternalSession) => void,
    private onDevServerNeeded: (session: InternalSession) => void,
  ) {}

  // Move these methods here verbatim from SessionManager, with the following substitutions:
  //   this.chatAdapter?.xxx        → this.getChatAdapter()?.xxx
  //   this.fileWatcher?.xxx        → this.fileWatcher?.xxx         (unchanged)
  //   this.persistAdditionalDirs() → this.onPersistAdditionalDirs()
  //   this.startDevServer()        → this.onDevServerNeeded()
  //   this.sendToRenderer()        → this.sendToRenderer()        (unchanged)
  //   this.ptyPool.xxx             → this.ptyPool.xxx             (unchanged)

  wireOutputStreaming(ptyId: string, session: InternalSession): void {
    // Paste from session-manager.ts lines 748-786, apply substitutions above
  }

  wireExitHandling(ptyId: string, session: InternalSession): void {
    // Paste from lines 788-796
  }

  wireStreamJsonOutput(ptyId: string, session: InternalSession): void {
    // Paste from lines 671-696
  }

  wirePrintModeExitHandling(ptyId: string, session: InternalSession): void {
    // Paste from lines 802-809
  }

  wirePrintModeInitialExitHandling(ptyId: string, session: InternalSession): void {
    // Paste from lines 815-831, replace this.startDevServer(session) → this.onDevServerNeeded(session)
  }

  private handleStreamJsonEvent(session: InternalSession, event: Record<string, unknown>): void {
    // Paste from lines 698-733, replace this.chatAdapter → this.getChatAdapter()
  }

  private detectUrlInText(session: InternalSession, text: string): void {
    // Paste from lines 735-746
  }
}
```

**Step 2: Update SessionManager to create and use StreamWirer**

In `session-manager.ts`:

1. Add import: `import { SessionStreamWirer } from './session-stream-wirer'`
2. Add private field: `private streamWirer: SessionStreamWirer`
3. In constructor body, after existing assignments:

```typescript
this.streamWirer = new SessionStreamWirer(
  this.ptyPool,
  () => this.chatAdapter,
  this.sendToRenderer.bind(this),
  this.fileWatcher,
  (session) => this.persistAdditionalDirs(session),
  (session) => this.startDevServer(session),
)
```

4. Replace all calls to the moved methods with delegate calls:
   - `this.wireOutputStreaming(x, y)` → `this.streamWirer.wireOutputStreaming(x, y)`
   - `this.wireExitHandling(x, y)` → `this.streamWirer.wireExitHandling(x, y)`
   - `this.wireStreamJsonOutput(x, y)` → `this.streamWirer.wireStreamJsonOutput(x, y)`
   - `this.wirePrintModeExitHandling(x, y)` → `this.streamWirer.wirePrintModeExitHandling(x, y)`
   - `this.wirePrintModeInitialExitHandling(x, y)` → `this.streamWirer.wirePrintModeInitialExitHandling(x, y)`

5. Delete the 7 moved method bodies from SessionManager.

6. Remove imports no longer needed in session-manager.ts: `detectStatus`, `detectAddDir`, `detectUrl` (only if nothing else in the file uses them — verify before removing).

**Step 3: Run tests**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: All 25 tests pass.

**Step 4: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/main/session-stream-wirer.ts src/main/session-manager.ts
git commit -m "refactor: extract SessionStreamWirer from SessionManager"
```

---

### Task 3: Extract SessionDiscovery

Moves dormant session discovery (worktree scanning, simple-mode stub creation) into its own class.

**Files:**
- Create: `src/main/session-discovery.ts`
- Modify: `src/main/session-manager.ts`

**Step 1: Create session-discovery.ts**

```typescript
// src/main/session-discovery.ts
import { v4 as uuidv4 } from 'uuid'
import { WorktreeManager } from './worktree-manager'
import { ProjectRegistry } from './project-registry'
import type { FileWatcher } from './file-watcher'
import { readWorktreeMeta } from './worktree-meta'
import { gitExec } from './git-exec'
import { debugLog } from './debug-log'
import type { InternalSession } from './session-types'

export class SessionDiscovery {
  constructor(
    private sessions: Map<string, InternalSession>,
    private worktreeManager: WorktreeManager,
    private projectRegistry: ProjectRegistry,
    private fileWatcher?: FileWatcher,
  ) {}

  async discoverSessionsForProject(projectId: string): Promise<void> {
    // Paste from session-manager.ts lines 376-416, with these changes:
    //   this.resolveProject(projectId) → inline: const project = this.projectRegistry.getProject(projectId); if (!project) throw new Error(...)
    //   this.sessions → this.sessions                   (unchanged, shared ref)
    //   this.worktreeManager → this.worktreeManager     (unchanged)
    //   this.fileWatcher → this.fileWatcher              (unchanged)
    //
    // Note: the method no longer returns AgentSession[] — it mutates the shared sessions map.
    // The return-and-map-to-public step stays in SessionManager.
  }

  async discoverAllSessions(simpleProjectsBase?: string): Promise<void> {
    // Paste from lines 418-477, with these changes:
    //   this.projectRegistry.listProjects() → this.projectRegistry.listProjects() (unchanged)
    //   this.discoverSessionsForProject() → this.discoverSessionsForProject()     (unchanged, now on this class)
    //   Remove the return statement — SessionManager handles the mapping.
  }
}
```

**Step 2: Update SessionManager**

1. Add import: `import { SessionDiscovery } from './session-discovery'`
2. Add private field: `private discovery: SessionDiscovery`
3. In constructor body:

```typescript
this.discovery = new SessionDiscovery(
  this.sessions,
  this.worktreeManager,
  this.projectRegistry,
  this.fileWatcher,
)
```

4. Replace `discoverSessionsForProject`:

```typescript
async discoverSessionsForProject(projectId: string): Promise<AgentSession[]> {
  await this.discovery.discoverSessionsForProject(projectId)
  return Array.from(this.sessions.values())
    .filter((s) => s.projectId === projectId)
    .map((s) => this.toPublicSession(s))
}
```

5. Replace `discoverAllSessions`:

```typescript
async discoverAllSessions(simpleProjectsBase?: string): Promise<AgentSession[]> {
  await this.discovery.discoverAllSessions(simpleProjectsBase)
  return Array.from(this.sessions.values()).map((s) => this.toPublicSession(s))
}
```

6. Delete the old method bodies.

7. Remove imports no longer needed: `readWorktreeMeta`, `gitExec` — only if nothing else in session-manager.ts uses them. `gitExec` is also used in `createSession` and `assertCleanWorkingTree`, so keep it. `readWorktreeMeta` is used in `resumeSession`, so keep it.

**Step 3: Run tests**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: All 25 tests pass.

**Step 4: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/main/session-discovery.ts src/main/session-manager.ts
git commit -m "refactor: extract SessionDiscovery from SessionManager"
```

---

### Task 4: Extract DevServerManager

Moves non-interactive session creation, dev server spawning, and print-mode follow-up into its own class.

**Files:**
- Create: `src/main/dev-server-manager.ts`
- Modify: `src/main/session-manager.ts`

**Step 1: Create dev-server-manager.ts**

```typescript
// src/main/dev-server-manager.ts
import { v4 as uuidv4 } from 'uuid'
import { PtyPool } from './pty-pool'
import { ProjectRegistry } from './project-registry'
import { getRuntimeById } from './runtimes'
import { detectUrl } from './url-detector'
import { gitExec } from './git-exec'
import type { ChatAdapter } from './chat-adapter'
import { debugLog } from './debug-log'
import type { InternalSession } from './session-types'
import type { SessionStreamWirer } from './session-stream-wirer'

type SendToRenderer = (channel: string, ...args: unknown[]) => void

export class DevServerManager {
  constructor(
    private ptyPool: PtyPool,
    private getChatAdapter: () => ChatAdapter | null,
    private sessions: Map<string, InternalSession>,
    private projectRegistry: ProjectRegistry,
    private sendToRenderer: SendToRenderer,
    private streamWirer: SessionStreamWirer,
  ) {}

  async startDevServerSession(
    projectId: string,
    branchName: string,
    taskDescription?: string,
  ): Promise<{ sessionId: string }> {
    // Paste from session-manager.ts lines 581-632, with these changes:
    //   this.resolveProject(projectId) → inline: const project = this.projectRegistry.getProject(projectId); if (!project) throw new Error(...)
    //   this.ptyPool.kill() → this.ptyPool.kill()       (unchanged)
    //   this.chatAdapter?.xxx → this.getChatAdapter()?.xxx
    //   this.sessions → this.sessions                   (unchanged, shared ref)
    //   this.startDevServer(session) → this.startDevServer(session) (now local)
  }

  startDevServer(session: InternalSession): void {
    // Paste from lines 837-877, with these changes:
    //   this.ptyPool → this.ptyPool          (unchanged)
    //   this.sendToRenderer → this.sendToRenderer (unchanged)
    //   detectUrl() → detectUrl()             (imported directly)
  }

  spawnPrintModeFollowUp(session: InternalSession, prompt: string): void {
    // Paste from lines 240-269, with these changes:
    //   this.resolveRuntime(x) → inline: const runtime = getRuntimeById(x); if (!runtime) throw new Error(...)
    //   this.ptyPool → this.ptyPool          (unchanged)
    //   this.sendToRenderer → this.sendToRenderer (unchanged)
    //   this.wireStreamJsonOutput → this.streamWirer.wireStreamJsonOutput
    //   this.wirePrintModeExitHandling → this.streamWirer.wirePrintModeExitHandling
  }
}
```

**Step 2: Update SessionManager**

1. Add import: `import { DevServerManager } from './dev-server-manager'`
2. Add private field: `private devServer: DevServerManager`
3. In constructor body (after streamWirer is created):

```typescript
this.devServer = new DevServerManager(
  this.ptyPool,
  () => this.chatAdapter,
  this.sessions,
  this.projectRegistry,
  this.sendToRenderer.bind(this),
  this.streamWirer,
)
```

4. Update the `onDevServerNeeded` callback in StreamWirer construction to delegate:

```typescript
// Change from:
(session) => this.startDevServer(session),
// To:
(session) => this.devServer.startDevServer(session),
```

5. Update `sendInput` to delegate for non-interactive:

```typescript
// Change from:
this.spawnPrintModeFollowUp(session, input.trim())
// To:
this.devServer.spawnPrintModeFollowUp(session, input.trim())
```

6. Update `startDevServerSession` to delegate:

```typescript
async startDevServerSession(projectId: string, branchName: string, taskDescription?: string): Promise<{ sessionId: string }> {
  return this.devServer.startDevServerSession(projectId, branchName, taskDescription)
}
```

7. Delete the 3 moved method bodies (`startDevServerSession`, `startDevServer`, `spawnPrintModeFollowUp`).

**Step 3: Run tests**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: All 25 tests pass.

**Step 4: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/main/dev-server-manager.ts src/main/session-manager.ts
git commit -m "refactor: extract DevServerManager from SessionManager"
```

---

### Task 5: Clean up dead imports and verify

**Files:**
- Modify: `src/main/session-manager.ts` (remove unused imports)

**Step 1: Remove unused imports from session-manager.ts**

After all extractions, check which imports are no longer used in session-manager.ts. Likely removable:
- `detectStatus` (moved to StreamWirer)
- `detectAddDir` (moved to StreamWirer)
- `detectUrl` (moved to StreamWirer and DevServerManager)

Keep:
- `gitExec` (used in createSession, assertCleanWorkingTree, killNonInteractiveSessions, killInteractiveSession)
- `readWorktreeMeta` (used in resumeSession)
- `writeWorktreeMeta` (used in createSession, persistAdditionalDirs)
- `generateBranchName` (used in createSession)
- `getRuntimeById` (used in resolveRuntime)

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (not just session-manager tests — full suite).

**Step 3: Run full typecheck**

Run: `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: No errors in either config.

**Step 4: Verify line counts**

Run: `wc -l src/main/session-manager.ts src/main/session-types.ts src/main/session-stream-wirer.ts src/main/session-discovery.ts src/main/dev-server-manager.ts`

Expected approximate result:
- `session-manager.ts`: ~370 lines (down from 902)
- `session-types.ts`: ~15 lines
- `session-stream-wirer.ts`: ~130 lines
- `session-discovery.ts`: ~110 lines
- `dev-server-manager.ts`: ~120 lines

**Step 5: Commit**

```bash
git add src/main/session-manager.ts
git commit -m "refactor: clean up dead imports after SessionManager decomposition"
```
