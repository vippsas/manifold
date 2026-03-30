# AI Shell Command Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each shell command completes, predict the next likely command using AI and display it as ghost text that the user can accept with Tab.

**Architecture:** Prompt detection in `SessionStreamWirer` triggers a new `ShellSuggestion` module that gathers context (shell history + git status), calls `gitOps.aiGenerate()` with the session's runtime, and injects ghost text into the terminal. The renderer intercepts Tab to accept and any other key to dismiss, via two new IPC channels.

**Tech Stack:** TypeScript, Node.js `child_process.spawn` (via existing `aiGenerate`), ANSI escape codes, xterm.js key handling

**Spec:** `docs/superpowers/specs/2026-03-29-ai-shell-suggestions-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/main/session/session-types.ts` | Modify | Add `shellSuggestion` state to `InternalSession` |
| `src/main/session/shell-suggestion.ts` | Create | Context gathering, AI prompt, ghost text injection/clearing |
| `src/main/session/shell-suggestion.test.ts` | Create | Unit tests for context gathering and prompt building |
| `src/main/session/session-stream-wirer.ts` | Modify | Detect Manifold prompt in shell output, trigger prediction |
| `src/main/ipc/agent-handlers.ts` | Modify | Add `shell:accept-suggestion` and `shell:dismiss-suggestion` handlers |
| `src/preload/index.ts` | Modify | Whitelist the two new IPC invoke channels |
| `src/renderer/hooks/useTerminal.ts` | Modify | Intercept Tab key for suggestion acceptance |

---

### Task 1: Add suggestion state to InternalSession

**Files:**
- Modify: `src/main/session/session-types.ts:1-18`

- [ ] **Step 1: Add the ShellSuggestionState type and field**

In `src/main/session/session-types.ts`, add the state type before the `InternalSession` interface, and add the field to `InternalSession`:

```typescript
import type { AgentSession } from '../../shared/types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'

export interface ShellSuggestionState {
  /** The currently displayed suggestion text, or null if none */
  activeSuggestion: string | null
  /** Whether a prediction request is in flight */
  pending: boolean
}

export interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
  taskDescription?: string
  ollamaModel?: string
  detectedUrl?: string
  detectedVercelUrl?: string
  nonInteractive?: boolean
  devServerPtyId?: string
  /** Buffer for accumulating partial NDJSON lines from stream-json output */
  streamJsonLineBuffer?: string
  nonInteractiveOutputMode?: SimpleRuntimeOutputMode
  /** Temp ZDOTDIR created for Manifold shell prompt — cleaned up on session exit */
  zdotdir?: string
  /** AI shell command suggestion state (shell sessions only) */
  shellSuggestion?: ShellSuggestionState
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/session/session-types.ts
git commit -m "feat: add ShellSuggestionState to InternalSession"
```

---

### Task 2: Create ShellSuggestion module — context gathering and prompt building

**Files:**
- Create: `src/main/session/shell-suggestion.ts`
- Create: `src/main/session/shell-suggestion.test.ts`

- [ ] **Step 1: Write failing tests for context gathering**

Create `src/main/session/shell-suggestion.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import { buildSuggestionPrompt, readRecentHistory, parseZshHistoryLine } from './shell-suggestion'

describe('parseZshHistoryLine', () => {
  it('strips extended history timestamp format', () => {
    expect(parseZshHistoryLine(': 1711234567:0;echo hello')).toBe('echo hello')
  })

  it('returns plain lines as-is', () => {
    expect(parseZshHistoryLine('git status')).toBe('git status')
  })

  it('returns null for empty lines', () => {
    expect(parseZshHistoryLine('')).toBeNull()
    expect(parseZshHistoryLine('   ')).toBeNull()
  })
})

describe('readRecentHistory', () => {
  it('reads last N commands from history file', () => {
    const content = [
      ': 1711234560:0;git add .',
      ': 1711234561:0;git commit -m "init"',
      ': 1711234562:0;npm test',
      ': 1711234563:0;npm run build',
      ': 1711234564:0;git push',
    ].join('\n')

    vi.spyOn(fs, 'readFileSync').mockReturnValue(content)
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)

    const result = readRecentHistory('/tmp/test/.zsh_history', 3)
    expect(result).toEqual(['npm test', 'npm run build', 'git push'])

    vi.restoreAllMocks()
  })

  it('returns empty array when file does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const result = readRecentHistory('/nonexistent/.zsh_history', 20)
    expect(result).toEqual([])

    vi.restoreAllMocks()
  })
})

describe('buildSuggestionPrompt', () => {
  it('includes history and git status in prompt', () => {
    const prompt = buildSuggestionPrompt(
      ['git add .', 'git commit -m "fix"'],
      'main\n M src/index.ts',
      'my-project',
    )
    expect(prompt).toContain('git add .')
    expect(prompt).toContain('git commit -m "fix"')
    expect(prompt).toContain('M src/index.ts')
    expect(prompt).toContain('my-project')
    expect(prompt).toContain('single most likely next command')
  })

  it('handles empty history gracefully', () => {
    const prompt = buildSuggestionPrompt([], 'main\n', 'my-project')
    expect(prompt).toContain('(no recent commands)')
    expect(prompt).toContain('single most likely next command')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/session/shell-suggestion.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the ShellSuggestion module**

Create `src/main/session/shell-suggestion.ts`:

```typescript
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { getRuntimeById } from '../agent/runtimes'
import type { GitOperationsManager } from '../git/git-operations'
import type { PtyPool } from '../agent/pty-pool'
import type { InternalSession } from './session-types'

const HISTORY_LINES = 20
const SUGGESTION_TIMEOUT_MS = 10_000

/**
 * Parse a single zsh history line, stripping extended history format.
 * Extended format: `: <timestamp>:<duration>;<command>`
 * Returns null for empty lines.
 */
export function parseZshHistoryLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^: \d+:\d+;(.+)/)
  return match ? match[1] : trimmed
}

/**
 * Read the last N commands from a zsh history file.
 * Returns most recent commands last (reversed for prompt display).
 */
export function readRecentHistory(historyPath: string, count: number): string[] {
  if (!fs.existsSync(historyPath)) return []
  try {
    const content = fs.readFileSync(historyPath, 'utf-8')
    const lines = content.split('\n')
    const commands: string[] = []
    for (let i = lines.length - 1; i >= 0 && commands.length < count; i--) {
      const parsed = parseZshHistoryLine(lines[i])
      if (parsed) commands.push(parsed)
    }
    return commands.reverse()
  } catch {
    return []
  }
}

/**
 * Build the AI prompt for command prediction.
 */
export function buildSuggestionPrompt(
  history: string[],
  gitStatus: string,
  cwdBasename: string,
): string {
  const historyBlock = history.length > 0
    ? history.join('\n')
    : '(no recent commands)'

  return `You are a shell command predictor. Based on the shell history and git status below, predict the single most likely next command the user will run. Reply with ONLY the command, nothing else. No explanation, no markdown, no quotes.

Shell history (most recent last):
${historyBlock}

Git status:
${gitStatus}

Working directory: ${cwdBasename}

Predicted command:`
}

/**
 * Gather git status for the given cwd.
 * Returns "<branch>\n<porcelain output>" or a fallback on error.
 */
function gatherGitStatus(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain', '--branch'], { cwd, timeout: 3000 }, (err, stdout) => {
      if (err) {
        resolve('(git status unavailable)')
        return
      }
      resolve(stdout.trim())
    })
  })
}

/**
 * Resolve the HISTFILE path for a shell session.
 * Reads from the session's zdotdir .zshrc to find the configured HISTFILE.
 * Falls back to empty string if not found.
 */
function resolveHistoryPath(session: InternalSession): string | null {
  if (!session.zdotdir) return null
  try {
    const rc = fs.readFileSync(path.join(session.zdotdir, '.zshrc'), 'utf-8')
    const match = rc.match(/HISTFILE="([^"]+)"/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Inject ghost text (dimmed suggestion) after the cursor position.
 * The cursor is moved back so it stays at the prompt.
 */
function injectGhostText(ptyPool: PtyPool, ptyId: string, text: string): void {
  // Save cursor, dim text, write suggestion, restore cursor
  const ghost = `\x1b7\x1b[2m${text}\x1b8`
  ptyPool.pushOutput(ptyId, ghost)
}

/**
 * Clear ghost text by restoring saved cursor position and erasing to end of line.
 */
function clearGhostText(ptyPool: PtyPool, ptyId: string): void {
  // Restore saved cursor position, erase from cursor to end of line
  const clear = `\x1b8\x1b[K`
  ptyPool.pushOutput(ptyId, clear)
}

/**
 * Trigger an AI prediction for the next shell command.
 * This is fire-and-forget — errors are silently ignored.
 */
export async function predictNextCommand(
  session: InternalSession,
  ptyPool: PtyPool,
  gitOps: GitOperationsManager,
): Promise<void> {
  if (session.runtimeId !== '__shell__') return
  if (!session.ptyId) return

  // Initialize suggestion state
  if (!session.shellSuggestion) {
    session.shellSuggestion = { activeSuggestion: null, pending: false }
  }

  // Cancel any previous pending request
  session.shellSuggestion.pending = true
  session.shellSuggestion.activeSuggestion = null

  try {
    // Gather context in parallel
    const historyPath = resolveHistoryPath(session)
    const [history, gitStatus] = await Promise.all([
      Promise.resolve(historyPath ? readRecentHistory(historyPath, HISTORY_LINES) : []),
      gatherGitStatus(session.worktreePath),
    ])

    // Check if this request is still current (not superseded)
    if (!session.shellSuggestion.pending) return

    // Find the runtime to use for AI generation
    // Shell sessions don't have a meaningful runtimeId, so use claude as default
    const runtime = getRuntimeById('claude')
    if (!runtime) return

    const prompt = buildSuggestionPrompt(
      history,
      gitStatus,
      path.basename(session.worktreePath),
    )

    const result = await gitOps.aiGenerate(
      runtime,
      prompt,
      session.worktreePath,
      runtime.aiModelArgs ?? [],
      { timeoutMs: SUGGESTION_TIMEOUT_MS },
    )

    // Check again if still current
    if (!session.shellSuggestion.pending) return

    const suggestion = result.trim()
    if (!suggestion || suggestion.includes('\n')) {
      // Discard empty or multi-line responses
      session.shellSuggestion.pending = false
      return
    }

    session.shellSuggestion.activeSuggestion = suggestion
    session.shellSuggestion.pending = false
    injectGhostText(ptyPool, session.ptyId, suggestion)
  } catch {
    // Silent failure — never break the shell
    if (session.shellSuggestion) {
      session.shellSuggestion.pending = false
    }
  }
}

/**
 * Accept the current suggestion — write the command to PTY stdin.
 */
export function acceptSuggestion(
  session: InternalSession,
  ptyPool: PtyPool,
): boolean {
  const suggestion = session.shellSuggestion?.activeSuggestion
  if (!suggestion || !session.ptyId) return false

  clearGhostText(ptyPool, session.ptyId)
  ptyPool.write(session.ptyId, suggestion)
  session.shellSuggestion!.activeSuggestion = null
  return true
}

/**
 * Dismiss the current suggestion — clear ghost text.
 */
export function dismissSuggestion(
  session: InternalSession,
  ptyPool: PtyPool,
): void {
  if (!session.shellSuggestion?.activeSuggestion || !session.ptyId) return

  clearGhostText(ptyPool, session.ptyId)
  session.shellSuggestion.activeSuggestion = null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/shell-suggestion.test.ts`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/session/shell-suggestion.ts src/main/session/shell-suggestion.test.ts
git commit -m "feat: add ShellSuggestion module with context gathering and AI prediction"
```

---

### Task 3: Detect Manifold prompt in PTY output and trigger prediction

**Files:**
- Modify: `src/main/session/session-stream-wirer.ts:13-21` (constructor), `23-63` (wireOutputStreaming)

- [ ] **Step 1: Add gitOps dependency to SessionStreamWirer constructor**

In `src/main/session/session-stream-wirer.ts`, add the import at the top:

```typescript
import type { GitOperationsManager } from '../git/git-operations'
import { predictNextCommand, dismissSuggestion } from './shell-suggestion'
```

Update the constructor to accept `gitOps`:

Change lines 14-21 from:

```typescript
  constructor(
    private ptyPool: PtyPool,
    private getChatAdapter: () => ChatAdapter | null,
    private sendToRenderer: (channel: string, ...args: unknown[]) => void,
    private fileWatcher: FileWatcher | undefined,
    private onPersistAdditionalDirs: (session: InternalSession) => void,
    private onDevServerNeeded: (session: InternalSession) => void,
  ) {}
```

to:

```typescript
  constructor(
    private ptyPool: PtyPool,
    private getChatAdapter: () => ChatAdapter | null,
    private sendToRenderer: (channel: string, ...args: unknown[]) => void,
    private fileWatcher: FileWatcher | undefined,
    private onPersistAdditionalDirs: (session: InternalSession) => void,
    private onDevServerNeeded: (session: InternalSession) => void,
    private gitOps?: GitOperationsManager,
  ) {}
```

- [ ] **Step 2: Add prompt detection in wireOutputStreaming**

In the `wireOutputStreaming` method, inside the `this.ptyPool.onData(ptyId, (data: string) => {` callback, the `if (session.runtimeId !== '__shell__')` block handles non-shell sessions (lines 30-58). After that block closes, and before the three send-to-renderer calls at lines 60-62, add prompt detection for shell sessions:

Find this code (around line 59-62):

```typescript
      this.getChatAdapter()?.processPtyOutput(session.id, data)
      this.sendToRenderer('agent:activity', { sessionId: session.id })
      this.sendToRenderer('agent:output', { sessionId: session.id, data })
```

Add the prompt detection **before** these lines:

```typescript
      // Detect Manifold shell prompt and trigger AI command prediction
      if (session.runtimeId === '__shell__' && this.gitOps && data.includes('❯')) {
        // Dismiss any existing suggestion when new output arrives
        dismissSuggestion(session, this.ptyPool)
        // The ❯ character in output means the prompt was printed — predict next command
        void predictNextCommand(session, this.ptyPool, this.gitOps)
      }

      this.getChatAdapter()?.processPtyOutput(session.id, data)
      this.sendToRenderer('agent:activity', { sessionId: session.id })
      this.sendToRenderer('agent:output', { sessionId: session.id, data })
```

- [ ] **Step 3: Update SessionManager to pass gitOps to StreamWirer**

In `src/main/session/session-manager.ts`, the `SessionStreamWirer` is constructed in the constructor (line 42). Find:

```typescript
    this.streamWirer = new SessionStreamWirer(
      this.ptyPool,
      () => this.chatAdapter,
      this.sendToRenderer.bind(this),
      this.fileWatcher,
      (session) => this.persistAdditionalDirs(session),
      (session) => this.devServer.startDevServer(session),
    )
```

This needs a `gitOps` parameter. However, `SessionManager` doesn't currently receive `GitOperationsManager`. We need to add it.

Update the constructor signature in `src/main/session/session-manager.ts`. Find (line 35-41):

```typescript
  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private branchCheckoutManager?: BranchCheckoutManager,
    private fileWatcher?: FileWatcher,
  ) {
```

Change to:

```typescript
  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private branchCheckoutManager?: BranchCheckoutManager,
    private fileWatcher?: FileWatcher,
    private gitOps?: GitOperationsManager,
  ) {
```

Add the import at the top of `session-manager.ts`:

```typescript
import type { GitOperationsManager } from '../git/git-operations'
```

Then update the `SessionStreamWirer` construction to pass `gitOps`:

```typescript
    this.streamWirer = new SessionStreamWirer(
      this.ptyPool,
      () => this.chatAdapter,
      this.sendToRenderer.bind(this),
      this.fileWatcher,
      (session) => this.persistAdditionalDirs(session),
      (session) => this.devServer.startDevServer(session),
      this.gitOps,
    )
```

- [ ] **Step 4: Pass gitOps when constructing SessionManager**

Find where `SessionManager` is instantiated in the app. Search for `new SessionManager` in `src/main/index.ts`:

```typescript
const sessionManager = new SessionManager(worktreeManager, ptyPool, projectRegistry, branchCheckoutManager, fileWatcher)
```

Add `gitOps` as the last argument:

```typescript
const sessionManager = new SessionManager(worktreeManager, ptyPool, projectRegistry, branchCheckoutManager, fileWatcher, gitOps)
```

If `gitOps` is constructed after `sessionManager`, you may need to reorder the construction. Check the file to confirm the order. If reordering isn't possible, you can call a setter method instead — but check the actual code first.

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Run all tests to check for regressions**

Run: `npm test`
Expected: PASS — the `SessionStreamWirer` constructor change is backward-compatible (new param is optional).

- [ ] **Step 7: Commit**

```bash
git add src/main/session/session-stream-wirer.ts src/main/session/session-manager.ts src/main/index.ts
git commit -m "feat: detect shell prompt and trigger AI prediction"
```

---

### Task 4: Add IPC handlers for accept and dismiss

**Files:**
- Modify: `src/main/ipc/agent-handlers.ts`
- Modify: `src/preload/index.ts:3-84`

- [ ] **Step 1: Add IPC handlers**

In `src/main/ipc/agent-handlers.ts`, add the import at the top:

```typescript
import { acceptSuggestion, dismissSuggestion } from '../session/shell-suggestion'
```

Add the two handlers after the existing `shell:kill` handler (around line 135):

```typescript
  ipcMain.handle('shell:accept-suggestion', (_event, sessionId: string) => {
    const session = sessionManager.getInternalSession(sessionId)
    if (!session) return false
    return acceptSuggestion(session, deps.sessionManager.getPtyPool())
  })

  ipcMain.handle('shell:dismiss-suggestion', (_event, sessionId: string) => {
    const session = sessionManager.getInternalSession(sessionId)
    if (!session) return
    dismissSuggestion(session, deps.sessionManager.getPtyPool())
  })
```

Note: `SessionManager` needs a `getPtyPool()` method. Add it in `src/main/session/session-manager.ts`:

```typescript
  getPtyPool(): PtyPool {
    return this.ptyPool
  }
```

Add this method near the other getter methods (around line 239, near `getInternalSession`).

- [ ] **Step 2: Whitelist the new IPC channels**

In `src/preload/index.ts`, add these two entries to the `ALLOWED_INVOKE_CHANNELS` array, after `'shell:kill'` (line 47):

```typescript
  'shell:accept-suggestion',
  'shell:dismiss-suggestion',
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/agent-handlers.ts src/preload/index.ts src/main/session/session-manager.ts
git commit -m "feat: add shell:accept-suggestion and shell:dismiss-suggestion IPC handlers"
```

---

### Task 5: Intercept Tab key in renderer for suggestion acceptance

**Files:**
- Modify: `src/renderer/hooks/useTerminal.ts:163-189`

- [ ] **Step 1: Update the terminal onData handler to intercept Tab**

In `src/renderer/hooks/useTerminal.ts`, find the `terminal.onData` handler (line 182-189):

```typescript
    const onDataDisposable = terminal.onData((data: string) => {
      if (sessionId) {
        const filtered = filterTerminalResponses(data)
        if (filtered) {
          void window.electronAPI.invoke('agent:input', sessionId, filtered)
        }
      }
    })
```

Replace with:

```typescript
    const onDataDisposable = terminal.onData((data: string) => {
      if (sessionId) {
        const filtered = filterTerminalResponses(data)
        if (filtered) {
          if (filtered === '\t') {
            // Tab key: try to accept AI suggestion first, fall through to normal tab if none
            void window.electronAPI.invoke('shell:accept-suggestion', sessionId).then((accepted) => {
              if (!accepted) {
                // No active suggestion — forward Tab to PTY for normal completion
                void window.electronAPI.invoke('agent:input', sessionId, '\t')
              }
            })
          } else {
            // Any other key: dismiss suggestion then forward the keystroke
            void window.electronAPI.invoke('shell:dismiss-suggestion', sessionId)
            void window.electronAPI.invoke('agent:input', sessionId, filtered)
          }
        }
      }
    })
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useTerminal.ts
git commit -m "feat: intercept Tab key for AI suggestion acceptance in terminal"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Run full typecheck and test suite**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 2: Start the app in dev mode**

Run: `npm run dev`

- [ ] **Step 3: Test suggestion flow**

1. Open a project, create a new agent
2. In the shell tab, run `echo hello` and press Enter
3. Wait a few seconds — a dimmed suggestion should appear after the prompt
4. Press Tab — the suggestion should be accepted (written to the command line, not executed)
5. Press Enter to execute, or Backspace to modify

- [ ] **Step 4: Test dismissal**

1. After a suggestion appears, start typing something else
2. The ghost text should disappear immediately
3. Your typed text should appear normally

- [ ] **Step 5: Test Tab fallback**

1. Start typing `git st` (no suggestion visible)
2. Press Tab — normal zsh tab completion should work (e.g., completes to `git status`)

- [ ] **Step 6: Verify no interference with agent terminals**

1. Switch to the agent terminal pane (not the shell)
2. Verify the agent works normally — no ghost text, no Tab interception issues

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```

Only create this commit if fixes were needed.
