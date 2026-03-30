# Per-Repository Shell History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Manifold shell per-repository command history so arrow-up works and is shared across agents within the same project.

**Architecture:** Set `HISTFILE` in the generated zsh `.zshrc` to a path under `~/.manifold/history/`. A new `shellHistoryScope` setting controls whether history is per-project or global. The main process resolves the history file path and passes it through the existing shell-prompt pipeline.

**Tech Stack:** TypeScript, Node.js `fs`, zsh history configuration

**Spec:** `docs/superpowers/specs/2026-03-29-shell-history-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/types.ts` | Modify | Add `shellHistoryScope` to `ManifoldSettings` |
| `src/shared/defaults.ts` | Modify | Default `shellHistoryScope` to `'project'` |
| `src/main/session/shell-prompt.ts` | Modify | Accept `historyDir` param, add history config to `.zshrc`, mkdir on demand |
| `src/main/session/shell-prompt.test.ts` | Modify | Test history config in generated `.zshrc` |
| `src/main/session/session-resume.ts` | Modify | Thread `historyDir` through to `createManifoldZdotdir()` |
| `src/main/session/session-manager.ts` | Modify | Resolve history path, pass to `createShellPtySession()` |
| `src/main/session/session-manager.test.ts` | Modify | Test history path resolution |
| `src/main/ipc/agent-handlers.ts` | Modify | Pass `shellHistoryScope` into session manager |

---

### Task 1: Add `shellHistoryScope` to settings type and defaults

**Files:**
- Modify: `src/shared/types.ts:53-69`
- Modify: `src/shared/defaults.ts:1-43`

- [ ] **Step 1: Add the type**

In `src/shared/types.ts`, add `shellHistoryScope` to the `ManifoldSettings` interface after line 62 (`shellPrompt: boolean`):

```typescript
shellHistoryScope: 'project' | 'global'
```

The full interface becomes:

```typescript
export interface ManifoldSettings {
  storagePath: string
  setupCompleted: boolean
  defaultRuntime: string
  theme: string
  scrollbackLines: number
  terminalFontFamily: string
  defaultBaseBranch: string
  notificationSound: boolean
  shellPrompt: boolean
  shellHistoryScope: 'project' | 'global'
  uiMode: 'developer' | 'simple'
  density: DensitySetting
  autoGenerateMessages: boolean
  memory?: import('./memory-types').MemorySettings
  search?: SearchSettings
  provisioning?: import('./provisioning-types').ProvisioningSettings
}
```

- [ ] **Step 2: Add the default**

In `src/shared/defaults.ts`, add after `shellPrompt: true,` (line 12):

```typescript
shellHistoryScope: 'project',
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no type errors — every file already assigns `ManifoldSettings` from `DEFAULT_SETTINGS` which now includes the new field)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts
git commit -m "feat: add shellHistoryScope setting type and default"
```

---

### Task 2: Add history configuration to `createManifoldZdotdir`

**Files:**
- Modify: `src/main/session/shell-prompt.ts:46-80`
- Modify: `src/main/session/shell-prompt.test.ts:32-50`

- [ ] **Step 1: Write failing tests for history config**

In `src/main/session/shell-prompt.test.ts`, add these tests inside the existing `describe('createManifoldZdotdir', ...)` block, after the existing test (line 49):

```typescript
  it('configures HISTFILE when historyDir is provided', () => {
    zdotdir = createManifoldZdotdir('oslo', '/tmp/test-history')
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('HISTFILE="/tmp/test-history/.zsh_history"')
    expect(rc).toContain('HISTSIZE=10000')
    expect(rc).toContain('SAVEHIST=10000')
    expect(rc).toContain('setopt INC_APPEND_HISTORY')
    expect(rc).toContain('setopt HIST_IGNORE_DUPS')
  })

  it('does not include HISTFILE when historyDir is undefined', () => {
    zdotdir = createManifoldZdotdir('oslo')
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).not.toContain('HISTFILE')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/session/shell-prompt.test.ts`
Expected: FAIL — `createManifoldZdotdir` does not accept a second parameter, and the generated `.zshrc` has no `HISTFILE`.

- [ ] **Step 3: Implement history config in `createManifoldZdotdir`**

In `src/main/session/shell-prompt.ts`, modify the `createManifoldZdotdir` function signature and body.

Change line 46 from:

```typescript
export function createManifoldZdotdir(agentName: string): string {
```

to:

```typescript
export function createManifoldZdotdir(agentName: string, historyDir?: string): string {
```

After the temp directory creation (line 47) and before the `rc` template literal (line 52), add the history directory creation:

```typescript
  if (historyDir) {
    fs.mkdirSync(historyDir, { recursive: true })
  }
```

Build the history block conditionally. Replace the entire `const rc = ...` template literal (lines 52-73) with:

```typescript
  const historyBlock = historyDir
    ? `
# Shell history — shared per repository
HISTFILE="${historyDir}/.zsh_history"
HISTSIZE=10000
SAVEHIST=10000
setopt INC_APPEND_HISTORY
setopt HIST_IGNORE_DUPS
`
    : ''

  const rc = `# Manifold shell prompt — sources user config then overrides PROMPT
ZDOTDIR_ORIG="${userZdotdir}"

# Source user's zshrc for PATH, aliases, functions, completions
if [[ -f "${userZdotdir}/.zshrc" ]]; then
  ZDOTDIR="${userZdotdir}"
  source "${userZdotdir}/.zshrc"
fi

# Disable prompt managers that override PROMPT via precmd hooks
unset STARSHIP_SESSION_KEY STARSHIP_SHELL 2>/dev/null
if (( \${+functions[_p9k_precmd]} )); then
  add-zsh-hook -d precmd _p9k_precmd 2>/dev/null
fi
if (( \${+functions[_omp_precmd]} )); then
  add-zsh-hook -d precmd _omp_precmd 2>/dev/null
fi
${historyBlock}
# Override prompt with clean Manifold style
PROMPT='%F{cyan}${agentName}%f %F{white}❯%f '
RPROMPT=''
`
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/shell-prompt.test.ts`
Expected: PASS — all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/main/session/shell-prompt.ts src/main/session/shell-prompt.test.ts
git commit -m "feat: add HISTFILE configuration to generated .zshrc"
```

---

### Task 3: Thread history path through `createShellPtySession`

**Files:**
- Modify: `src/main/session/session-resume.ts:62-122`

- [ ] **Step 1: Update the options type and pass-through**

In `src/main/session/session-resume.ts`, update the `createShellPtySession` function signature at line 62.

Change from:

```typescript
export function createShellPtySession(
  cwd: string,
  ptyPool: PtyPool,
  streamWirer: SessionStreamWirer,
  sessions: Map<string, InternalSession>,
  options?: { shellPrompt?: boolean },
): { sessionId: string } {
```

to:

```typescript
export function createShellPtySession(
  cwd: string,
  ptyPool: PtyPool,
  streamWirer: SessionStreamWirer,
  sessions: Map<string, InternalSession>,
  options?: { shellPrompt?: boolean; historyDir?: string },
): { sessionId: string } {
```

Then at line 81 where `createManifoldZdotdir` is called, change:

```typescript
      zdotdirPath = createManifoldZdotdir(shellEnv.MANIFOLD_AGENT_NAME)
```

to:

```typescript
      zdotdirPath = createManifoldZdotdir(shellEnv.MANIFOLD_AGENT_NAME, options?.historyDir)
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `npx vitest run src/main/session/shell-prompt.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/session/session-resume.ts
git commit -m "feat: thread historyDir through createShellPtySession"
```

---

### Task 4: Resolve history path in `SessionManager` and IPC handler

**Files:**
- Modify: `src/main/session/session-manager.ts:291-293`
- Modify: `src/main/ipc/agent-handlers.ts:127-130`
- Modify: `src/main/session/session-manager.test.ts:344-399`

- [ ] **Step 1: Write failing test for history path resolution**

In `src/main/session/session-manager.test.ts`, add a new test inside the existing `describe('createShellSession', ...)` block (after line 398):

```typescript
    it('passes historyDir derived from cwd when shellHistoryScope is project', () => {
      const mockWindow = createMockWindow()
      sessionManager.setMainWindow(mockWindow)

      sessionManager.createShellSession(
        '/Users/me/.manifold/worktrees/myproject/manifold-oslo',
        { shellPrompt: true, historyDir: path.join(os.homedir(), '.manifold', 'history', 'myproject') },
      )

      expect(ptyPool.spawn).toHaveBeenCalledWith(
        expect.any(String),
        ['-il'],
        expect.objectContaining({
          cwd: '/Users/me/.manifold/worktrees/myproject/manifold-oslo',
        }),
      )
    })
```

Note: This test just validates the options pass-through works. The actual path resolution will happen in the IPC handler. Add the `path` and `os` imports at the top of the test file if not already present:

```typescript
import * as path from 'node:path'
import * as os from 'node:os'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/session/session-manager.test.ts -t "passes historyDir"`
Expected: FAIL — `createShellSession` does not accept `historyDir` in its options.

- [ ] **Step 3: Update `SessionManager.createShellSession`**

In `src/main/session/session-manager.ts` at line 291, change:

```typescript
  createShellSession(cwd: string, options?: { shellPrompt?: boolean }): { sessionId: string } {
    return createShellPtySession(cwd, this.ptyPool, this.streamWirer, this.sessions, options)
  }
```

to:

```typescript
  createShellSession(cwd: string, options?: { shellPrompt?: boolean; historyDir?: string }): { sessionId: string } {
    return createShellPtySession(cwd, this.ptyPool, this.streamWirer, this.sessions, options)
  }
```

- [ ] **Step 4: Update the IPC handler to resolve the history path**

In `src/main/ipc/agent-handlers.ts`, update the `shell:create` handler at line 127. Change:

```typescript
  ipcMain.handle('shell:create', (_event, cwd: string) => {
    const settings = deps.settingsStore.getSettings()
    return sessionManager.createShellSession(cwd, { shellPrompt: settings.shellPrompt })
  })
```

to:

```typescript
  ipcMain.handle('shell:create', (_event, cwd: string) => {
    const settings = deps.settingsStore.getSettings()
    const historyDir = resolveShellHistoryDir(cwd, settings.shellHistoryScope)
    return sessionManager.createShellSession(cwd, {
      shellPrompt: settings.shellPrompt,
      historyDir,
    })
  })
```

Add the `resolveShellHistoryDir` helper at the top of `agent-handlers.ts`, after the imports:

```typescript
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Resolve the shell history directory based on the scope setting.
 *
 * For 'project' scope: ~/.manifold/history/<projectName>/
 *   - Worktree paths: ~/.manifold/worktrees/<projectName>/manifold-<agent> → projectName
 *   - Other paths: uses path.basename(cwd) as fallback
 *
 * For 'global' scope: ~/.manifold/history/
 */
function resolveShellHistoryDir(cwd: string, scope: 'project' | 'global'): string {
  const historyBase = path.join(os.homedir(), '.manifold', 'history')
  if (scope === 'global') {
    return historyBase
  }
  // Extract project name from worktree path: .../worktrees/<projectName>/manifold-<agent>
  const worktreeMatch = cwd.match(/worktrees\/([^/]+)\//)
  const projectName = worktreeMatch ? worktreeMatch[1] : path.basename(cwd)
  return path.join(historyBase, projectName)
}
```

Check if `os` and `path` are already imported in this file. If so, don't add duplicate imports.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/main/session/session-manager.test.ts -t "passes historyDir"`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS — no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/main/session/session-manager.ts src/main/ipc/agent-handlers.ts src/main/session/session-manager.test.ts
git commit -m "feat: resolve per-repository history path and wire through IPC"
```

---

### Task 5: Add integration test for `resolveShellHistoryDir`

**Files:**
- Modify: `src/main/ipc/agent-handlers.ts` (the function is already there from Task 4)

Since `resolveShellHistoryDir` is a private function inside agent-handlers, we test it indirectly through the existing `shell:create` handler tests or by extracting and testing directly. The simplest approach: add a unit test for the function by exporting it for testing.

- [ ] **Step 1: Export `resolveShellHistoryDir` for testing**

In `src/main/ipc/agent-handlers.ts`, change:

```typescript
function resolveShellHistoryDir(cwd: string, scope: 'project' | 'global'): string {
```

to:

```typescript
export function resolveShellHistoryDir(cwd: string, scope: 'project' | 'global'): string {
```

- [ ] **Step 2: Write tests**

Create or modify a test file. Since `agent-handlers.ts` tests may be complex (IPC registration), add a small focused test. Look for an existing test file first. If `src/main/ipc/agent-handlers.test.ts` doesn't exist, add the tests to `src/main/session/shell-prompt.test.ts` (thematically related). Add at the bottom of `src/main/session/shell-prompt.test.ts`:

```typescript
import { resolveShellHistoryDir } from '../ipc/agent-handlers'

describe('resolveShellHistoryDir', () => {
  it('returns project-scoped path for worktree cwd', () => {
    const dir = resolveShellHistoryDir(
      '/Users/me/.manifold/worktrees/myproject/manifold-oslo',
      'project',
    )
    expect(dir).toBe(path.join(os.homedir(), '.manifold', 'history', 'myproject'))
  })

  it('falls back to basename for non-worktree cwd', () => {
    const dir = resolveShellHistoryDir('/Users/me/code/my-repo', 'project')
    expect(dir).toBe(path.join(os.homedir(), '.manifold', 'history', 'my-repo'))
  })

  it('returns global path when scope is global', () => {
    const dir = resolveShellHistoryDir(
      '/Users/me/.manifold/worktrees/myproject/manifold-oslo',
      'global',
    )
    expect(dir).toBe(path.join(os.homedir(), '.manifold', 'history'))
  })
})
```

Add `os` import at the top of the test file if not already present:

```typescript
import * as os from 'node:os'
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/main/session/shell-prompt.test.ts`
Expected: PASS

- [ ] **Step 4: Run full suite**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/agent-handlers.ts src/main/session/shell-prompt.test.ts
git commit -m "test: add unit tests for resolveShellHistoryDir"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start the app in dev mode**

Run: `npm run dev`

- [ ] **Step 2: Create an agent and test history**

1. Open a project, create a new agent
2. In the shell tab, type `echo hello-from-oslo` and press Enter
3. Press arrow-up — should show `echo hello-from-oslo`
4. Create a second agent for the same project
5. In the second agent's shell, press arrow-up — should show `echo hello-from-oslo`

- [ ] **Step 3: Verify project isolation**

1. Switch to a different project, create an agent
2. Press arrow-up in the shell — should NOT show `echo hello-from-oslo`

- [ ] **Step 4: Verify the history file exists on disk**

Run: `ls ~/.manifold/history/`
Expected: Directory per project with `.zsh_history` files inside.

- [ ] **Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```

Only create this commit if fixes were needed. Skip if everything worked.
