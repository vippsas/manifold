# Ollama Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Ollama-backed runtimes for Claude Code and Codex so users can run local models via `ollama launch <agent> --model <model>`.

**Architecture:** Two new built-in runtimes ("Claude Code (Ollama)", "Codex (Ollama)") with `binary: 'ollama'`. A new `ollama-models.ts` module discovers available models via `ollama list`. The NewAgentPopover shows a model picker when an Ollama runtime is selected. Model selection is persisted in worktree metadata for session resume.

**Tech Stack:** Electron, TypeScript, React, node-pty, vitest

---

### Task 1: Add `needsModel` to AgentRuntime and `ollamaModel` to SpawnAgentOptions

**Files:**
- Modify: `src/shared/types.ts:1-10` (AgentRuntime interface)
- Modify: `src/shared/types.ts:67-77` (SpawnAgentOptions interface)

**Step 1: Add `needsModel` to AgentRuntime**

In `src/shared/types.ts`, add `needsModel?: boolean` to `AgentRuntime`:

```typescript
export interface AgentRuntime {
  id: string
  name: string
  binary: string
  args?: string[]
  aiModelArgs?: string[]
  waitingPattern?: string
  env?: Record<string, string>
  installed?: boolean
  needsModel?: boolean
}
```

**Step 2: Add `ollamaModel` to SpawnAgentOptions**

In `src/shared/types.ts`, add `ollamaModel?: string` to `SpawnAgentOptions`:

```typescript
export interface SpawnAgentOptions {
  projectId: string
  runtimeId: string
  prompt: string
  branchName?: string
  existingBranch?: string
  prIdentifier?: string
  noWorktree?: boolean
  cols?: number
  rows?: number
  ollamaModel?: string
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new fields are optional, no consumers break)

**Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add needsModel and ollamaModel to type definitions"
```

---

### Task 2: Add Ollama runtimes to BUILT_IN_RUNTIMES

**Files:**
- Modify: `src/main/runtimes.ts:4-29`
- Modify: `src/main/runtimes.test.ts`

**Step 1: Write failing tests**

Add tests for the Ollama runtimes in `src/main/runtimes.test.ts`. Update the existing "has exactly 3 built-in runtimes" test to expect 5, and add new test cases:

```typescript
it('has exactly 5 built-in runtimes', () => {
  expect(BUILT_IN_RUNTIMES).toHaveLength(5)
})

it('contains ollama-claude and ollama-codex', () => {
  const ids = BUILT_IN_RUNTIMES.map((r) => r.id)
  expect(ids).toContain('ollama-claude')
  expect(ids).toContain('ollama-codex')
})

it('ollama-claude runtime uses ollama binary with launch claude args', () => {
  const rt = BUILT_IN_RUNTIMES.find((r) => r.id === 'ollama-claude')
  expect(rt?.binary).toBe('ollama')
  expect(rt?.args).toEqual(['launch', 'claude'])
  expect(rt?.needsModel).toBe(true)
})

it('ollama-codex runtime uses ollama binary with launch codex args', () => {
  const rt = BUILT_IN_RUNTIMES.find((r) => r.id === 'ollama-codex')
  expect(rt?.binary).toBe('ollama')
  expect(rt?.args).toEqual(['launch', 'codex'])
  expect(rt?.needsModel).toBe(true)
})

it('ollama runtimes have no aiModelArgs', () => {
  const ollamaRuntimes = BUILT_IN_RUNTIMES.filter((r) => r.id.startsWith('ollama-'))
  for (const rt of ollamaRuntimes) {
    expect(rt.aiModelArgs).toBeUndefined()
  }
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/runtimes.test.ts`
Expected: FAIL — ollama-claude and ollama-codex don't exist yet

**Step 3: Add Ollama runtimes to BUILT_IN_RUNTIMES**

In `src/main/runtimes.ts`, add two entries after the gemini runtime:

```typescript
{
  id: 'ollama-claude',
  name: 'Claude Code (Ollama)',
  binary: 'ollama',
  args: ['launch', 'claude'],
  needsModel: true,
  waitingPattern: '❯|waiting for input|Interrupt to stop'
},
{
  id: 'ollama-codex',
  name: 'Codex (Ollama)',
  binary: 'ollama',
  args: ['launch', 'codex'],
  needsModel: true,
  waitingPattern: '> |codex>'
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/runtimes.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/runtimes.ts src/main/runtimes.test.ts
git commit -m "feat: add Ollama runtimes for Claude Code and Codex"
```

---

### Task 3: Create ollama-models module for model discovery

**Files:**
- Create: `src/main/ollama-models.ts`
- Create: `src/main/ollama-models.test.ts`

**Step 1: Write failing tests**

Create `src/main/ollama-models.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// We'll mock child_process to test without Ollama installed
vi.mock('node:child_process', () => ({
  execFile: vi.fn()
}))

import { execFile } from 'node:child_process'
import { listOllamaModels } from './ollama-models'

const mockExecFile = vi.mocked(execFile)

describe('listOllamaModels', () => {
  it('parses model names from ollama list output', async () => {
    mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
      callback(null, 'NAME                    ID              SIZE      MODIFIED\nqwen3:8b                abc123          4.9 GB    2 hours ago\nglm-4.7-flash:latest    def456          17 GB     3 days ago\n', '')
      return {} as any
    })

    const models = await listOllamaModels()
    expect(models).toEqual(['qwen3:8b', 'glm-4.7-flash:latest'])
  })

  it('returns empty array when ollama is not installed', async () => {
    mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
      callback(new Error('command not found'), '', '')
      return {} as any
    })

    const models = await listOllamaModels()
    expect(models).toEqual([])
  })

  it('returns empty array when ollama list returns no models', async () => {
    mockExecFile.mockImplementation((_cmd, _args, callback: any) => {
      callback(null, 'NAME    ID    SIZE    MODIFIED\n', '')
      return {} as any
    })

    const models = await listOllamaModels()
    expect(models).toEqual([])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/ollama-models.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement the module**

Create `src/main/ollama-models.ts`:

```typescript
import { execFile } from 'node:child_process'

export function listOllamaModels(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('ollama', ['list'], (error, stdout) => {
      if (error) {
        resolve([])
        return
      }

      const lines = stdout.trim().split('\n')
      // First line is the header: NAME ID SIZE MODIFIED
      const models = lines
        .slice(1)
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((name) => name && name.length > 0)

      resolve(models)
    })
  })
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/ollama-models.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ollama-models.ts src/main/ollama-models.test.ts
git commit -m "feat: add ollama-models module for model discovery"
```

---

### Task 4: Register `ollama:list-models` IPC handler and preload channel

**Files:**
- Modify: `src/main/ipc/settings-handlers.ts:23-27`
- Modify: `src/preload/index.ts:3-57` (add to ALLOWED_INVOKE_CHANNELS)

**Step 1: Add IPC handler**

In `src/main/ipc/settings-handlers.ts`, add an import at the top:

```typescript
import { listOllamaModels } from '../ollama-models'
```

Add a new handler function after `registerRuntimesHandler`:

```typescript
export function registerOllamaHandler(): void {
  ipcMain.handle('ollama:list-models', () => {
    return listOllamaModels()
  })
}
```

**Step 2: Add to preload whitelist**

In `src/preload/index.ts`, add `'ollama:list-models'` to `ALLOWED_INVOKE_CHANNELS` (after `'runtimes:list'` on line 29):

```typescript
'ollama:list-models',
```

**Step 3: Register the handler in the app bootstrap**

Find where `registerRuntimesHandler()` is called in `src/main/index.ts` (or `src/main/ipc/index.ts`) and add `registerOllamaHandler()` next to it.

Run: `grep -rn "registerRuntimesHandler" src/main/` to find the call site and add `registerOllamaHandler()` alongside it. Import it from the same module.

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/settings-handlers.ts src/preload/index.ts src/main/index.ts
git commit -m "feat: add ollama:list-models IPC handler"
```

---

### Task 5: Append `--model` args during session spawn and resume

**Files:**
- Modify: `src/main/session-manager.ts:107` (createSession PTY spawn)
- Modify: `src/main/session-manager.ts:124-128` (worktree meta persistence)
- Modify: `src/main/session-manager.ts:232-254` (resumeSession)
- Modify: `src/main/worktree-meta.ts:3-7` (WorktreeMeta interface)

**Step 1: Add `ollamaModel` to WorktreeMeta**

In `src/main/worktree-meta.ts`, add `ollamaModel?: string`:

```typescript
export interface WorktreeMeta {
  runtimeId: string
  taskDescription?: string
  additionalDirs?: string[]
  ollamaModel?: string
}
```

**Step 2: Modify createSession to append --model args**

In `src/main/session-manager.ts`, change the PTY spawn call at line 107:

```typescript
const runtimeArgs = [...(runtime.args ?? [])]
if (options.ollamaModel) {
  runtimeArgs.push('--model', options.ollamaModel)
}

const ptyHandle = this.ptyPool.spawn(runtime.binary, runtimeArgs, {
  cwd: worktree.path,
  env: runtime.env,
  cols: options.cols,
  rows: options.rows
})
```

**Step 3: Persist ollamaModel in worktree metadata**

In `src/main/session-manager.ts`, update the `writeWorktreeMeta` call around line 124:

```typescript
if (!options.noWorktree) {
  writeWorktreeMeta(worktree.path, {
    runtimeId: options.runtimeId,
    taskDescription: options.prompt || undefined,
    ollamaModel: options.ollamaModel,
  }).catch(() => {})
}
```

**Step 4: Store ollamaModel on InternalSession**

Add `ollamaModel?: string` to the `InternalSession` interface (line 16-20) and populate it in `buildSession`:

```typescript
interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
  taskDescription?: string
  ollamaModel?: string
}
```

In `buildSession`, add: `ollamaModel: options.ollamaModel,`

**Step 5: Modify resumeSession to restore --model args**

In `src/main/session-manager.ts` `resumeSession` method (~line 232), read the model from metadata and append args:

```typescript
async resumeSession(sessionId: string, runtimeId: string): Promise<AgentSession> {
  const session = this.sessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  if (session.ptyId) return this.toPublicSession(session)

  const runtime = this.resolveRuntime(runtimeId)

  // Restore ollamaModel from metadata if not on session
  if (!session.ollamaModel) {
    const meta = await readWorktreeMeta(session.worktreePath)
    if (meta?.ollamaModel) {
      session.ollamaModel = meta.ollamaModel
    }
  }

  const runtimeArgs = [...(runtime.args ?? [])]
  if (session.ollamaModel) {
    runtimeArgs.push('--model', session.ollamaModel)
  }

  const ptyHandle = this.ptyPool.spawn(runtime.binary, runtimeArgs, {
    cwd: session.worktreePath,
    env: runtime.env,
  })

  session.ptyId = ptyHandle.id
  session.pid = ptyHandle.pid
  session.runtimeId = runtimeId
  session.status = 'running'
  session.outputBuffer = ''

  this.wireOutputStreaming(ptyHandle.id, session)
  this.wireExitHandling(ptyHandle.id, session)

  return this.toPublicSession(session)
}
```

**Step 6: Also restore ollamaModel during discoverSessionsForProject**

In `discoverSessionsForProject` (~line 282), read the model from metadata:

After `const meta = await readWorktreeMeta(wt.path)`, the session object should include `ollamaModel: meta?.ollamaModel`.

**Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 8: Run full test suite**

Run: `npm test`
Expected: PASS (no existing behavior changed)

**Step 9: Commit**

```bash
git add src/main/session-manager.ts src/main/worktree-meta.ts
git commit -m "feat: append --model args for Ollama runtimes on spawn and resume"
```

---

### Task 6: Add model picker to NewAgentPopover UI

**Files:**
- Modify: `src/renderer/components/NewAgentPopover.tsx`
- Modify: `src/renderer/components/NewAgentPopover.styles.ts` (if new styles needed)

**Step 1: Add ollamaModel state and fetch logic to NewAgentPopover**

In `NewAgentPopover` function, add state for the model:

```typescript
const [ollamaModel, setOllamaModel] = useState('')
const [ollamaModels, setOllamaModels] = useState<string[]>([])
```

Add a `useEffect` that fetches models when the selected runtime has `needsModel`:

```typescript
useEffect(() => {
  if (!visible) return
  if (!selectedRuntime?.needsModel) {
    setOllamaModels([])
    setOllamaModel('')
    return
  }
  window.electronAPI.invoke('ollama:list-models').then((models) => {
    const modelList = models as string[]
    setOllamaModels(modelList)
    if (modelList.length > 0 && !ollamaModel) {
      setOllamaModel(modelList[0])
    }
  })
}, [visible, selectedRuntime?.needsModel])
```

**Step 2: Pass ollamaModel to onLaunch**

Update `handleSubmit` to include ollamaModel:

```typescript
onLaunch({
  projectId,
  runtimeId,
  prompt: '',
  branchName: branchName.trim() || undefined,
  ollamaModel: selectedRuntime?.needsModel ? ollamaModel : undefined,
})
```

**Step 3: Update canSubmit logic**

Disable launch if an Ollama runtime is selected but no model is chosen:

```typescript
const needsModelButNone = selectedRuntime?.needsModel && !ollamaModel
```

Pass to footer: `canSubmit={runtimeInstalled && !needsModelButNone}`

**Step 4: Add model dropdown to PopoverBody**

Pass `ollamaModels`, `ollamaModel`, `onModelChange`, and `needsModel` as new props to `PopoverBody`. Add a model `<select>` rendered conditionally when `needsModel` is true:

```tsx
{needsModel && (
  <label style={popoverStyles.label}>
    Model
    <select
      value={ollamaModel}
      onChange={(e) => onModelChange(e.target.value)}
      style={popoverStyles.select}
    >
      {ollamaModels.length === 0 && (
        <option value="">No models found</option>
      )}
      {ollamaModels.map((m) => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
    {ollamaModels.length === 0 && (
      <p style={{ color: 'var(--error, #f85149)', fontSize: '12px', margin: 0 }}>
        No Ollama models found. Run &quot;ollama pull &lt;model&gt;&quot; to download one.
      </p>
    )}
  </label>
)}
```

**Step 5: Reset model on runtime change**

In `useResetOnOpen`, also reset `setOllamaModel('')` and `setOllamaModels([])` (pass them as params).

**Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 7: Manual test**

Run: `npm run dev`
- Open "Launch Agent" dialog
- Select "Claude Code (Ollama)" from dropdown
- Verify model picker appears with available models (or "No models found" if Ollama not running)
- Select a model and click Launch
- Verify the PTY spawns: `ollama launch claude --model <selected-model>`

**Step 8: Commit**

```bash
git add src/renderer/components/NewAgentPopover.tsx
git commit -m "feat: add Ollama model picker to agent launch dialog"
```

---

### Task 7: Run full test suite and typecheck

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run all tests**

Run: `npm test`
Expected: PASS

**Step 3: Fix any issues found**

If tests fail, fix the specific issues.

**Step 4: Commit any fixes**

If fixes were needed:
```bash
git add -A
git commit -m "fix: address test/typecheck issues from Ollama integration"
```
