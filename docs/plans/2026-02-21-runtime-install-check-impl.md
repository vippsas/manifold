# Runtime Installation Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Block agent creation when the selected coding assistant CLI is not installed, showing an inline warning instead of silently failing.

**Architecture:** Add `installed` field to `AgentRuntime` type. Main process checks binary availability via `which`. Renderer fetches runtime list from IPC and disables launch when the selected runtime is uninstalled.

**Tech Stack:** Electron IPC, Node.js `child_process.execFile`, React hooks, TypeScript

---

### Task 1: Add `installed` field to AgentRuntime type

**Files:**
- Modify: `src/shared/types.ts:1-8`

**Step 1: Add the field**

In `src/shared/types.ts`, add `installed?: boolean` to the `AgentRuntime` interface:

```typescript
export interface AgentRuntime {
  id: string
  name: string
  binary: string
  args?: string[]
  waitingPattern?: string
  env?: Record<string, string>
  installed?: boolean
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (field is optional, no breakage)

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add installed field to AgentRuntime type"
```

---

### Task 2: Add `listRuntimesWithStatus()` to runtimes module (TDD)

**Files:**
- Modify: `src/main/runtimes.ts`
- Modify: `src/main/runtimes.test.ts`

**Step 1: Write the failing tests**

Append to `src/main/runtimes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BUILT_IN_RUNTIMES, getRuntimeById, listRuntimes, listRuntimesWithStatus } from './runtimes'

// ... keep all existing tests ...

describe('listRuntimesWithStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns all built-in runtimes with installed field', async () => {
    const runtimes = await listRuntimesWithStatus()
    expect(runtimes).toHaveLength(BUILT_IN_RUNTIMES.length)
    for (const rt of runtimes) {
      expect(typeof rt.installed).toBe('boolean')
    }
  })

  it('marks a runtime as installed when which resolves', async () => {
    // 'node' is always available in test environment
    const { execFile } = await import('node:child_process')
    const runtimes = await listRuntimesWithStatus()
    // We can't guarantee which runtimes are installed, but each should be boolean
    for (const rt of runtimes) {
      expect(rt.installed === true || rt.installed === false).toBe(true)
    }
  })

  it('includes the custom runtime entry with installed=true', async () => {
    const runtimes = await listRuntimesWithStatus()
    const custom = runtimes.find((r) => r.id === 'custom')
    expect(custom).toBeDefined()
    expect(custom!.installed).toBe(true)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/runtimes.test.ts`
Expected: FAIL — `listRuntimesWithStatus` is not exported

**Step 3: Implement `listRuntimesWithStatus`**

In `src/main/runtimes.ts`:

```typescript
import { execFile } from 'node:child_process'
import { AgentRuntime } from '../shared/types'

export const BUILT_IN_RUNTIMES: readonly AgentRuntime[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    args: ['--dangerously-skip-permissions'],
    waitingPattern: '❯|waiting for input|Interrupt to stop'
  },
  {
    id: 'codex',
    name: 'Codex',
    binary: 'codex',
    args: [],
    waitingPattern: '> |codex>'
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    binary: 'gemini',
    args: [],
    waitingPattern: '❯|>>> '
  }
] as const

export function getRuntimeById(id: string): AgentRuntime | undefined {
  return BUILT_IN_RUNTIMES.find((r) => r.id === id)
}

export function listRuntimes(): AgentRuntime[] {
  return [...BUILT_IN_RUNTIMES]
}

function checkBinaryExists(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('which', [binary], (error) => {
      resolve(!error)
    })
  })
}

export async function listRuntimesWithStatus(): Promise<AgentRuntime[]> {
  const results = await Promise.all(
    BUILT_IN_RUNTIMES.map(async (rt) => ({
      ...rt,
      installed: await checkBinaryExists(rt.binary),
    }))
  )
  // Append the custom entry — always marked installed (user's responsibility)
  results.push({ id: 'custom', name: 'Custom', binary: '', installed: true })
  return results
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/runtimes.test.ts`
Expected: PASS

**Step 5: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/main/runtimes.ts src/main/runtimes.test.ts
git commit -m "feat: add listRuntimesWithStatus with binary detection"
```

---

### Task 3: Wire IPC handler to use `listRuntimesWithStatus`

**Files:**
- Modify: `src/main/ipc/settings-handlers.ts:23-27`

**Step 1: Update the handler**

Replace `registerRuntimesHandler` in `src/main/ipc/settings-handlers.ts`:

```typescript
import { listRuntimesWithStatus } from '../runtimes'

export function registerRuntimesHandler(): void {
  ipcMain.handle('runtimes:list', () => {
    return listRuntimesWithStatus()
  })
}
```

Also update the import at the top — change `import { listRuntimes } from '../runtimes'` to `import { listRuntimesWithStatus } from '../runtimes'`.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/ipc/settings-handlers.ts
git commit -m "feat: wire runtimes:list IPC to return install status"
```

---

### Task 4: Update NewTaskModal to fetch runtimes and block uninstalled

**Files:**
- Modify: `src/renderer/components/NewTaskModal.tsx`

**Step 1: Replace hardcoded RUNTIMES with IPC fetch**

Remove the `const RUNTIMES` array and `RuntimeOption` interface. Add state + fetch logic:

In the `NewTaskModal` component, add:
```typescript
const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
```

Add a `useEffect` that fetches runtimes when `visible` becomes true:
```typescript
useEffect(() => {
  if (!visible) return
  window.electronAPI.invoke('runtimes:list').then((list) => {
    setRuntimes(list as AgentRuntime[])
  })
}, [visible])
```

Import `AgentRuntime` from `../../shared/types`.

**Step 2: Update AgentDropdown to use fetched runtimes and show install status**

```typescript
function AgentDropdown({
  value,
  onChange,
  runtimes,
}: {
  value: string
  onChange: (v: string) => void
  runtimes: AgentRuntime[]
}): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Agent
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={modalStyles.select}
      >
        {runtimes.map((rt) => (
          <option key={rt.id} value={rt.id}>
            {rt.name}{rt.installed === false ? ' (not installed)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
```

Pass `runtimes` prop from `NewTaskModal` body.

**Step 3: Add inline warning and disable submit**

Derive whether the selected runtime is installed:
```typescript
const selectedRuntime = runtimes.find((r) => r.id === runtimeId)
const runtimeInstalled = selectedRuntime?.installed !== false
const canSubmit = taskDescription.trim().length > 0 && runtimeInstalled
```

Add warning below the `AgentDropdown` call in the modal body JSX:
```typescript
{!runtimeInstalled && (
  <p style={{ color: 'var(--error, #f85149)', fontSize: '12px', margin: 0 }}>
    {selectedRuntime?.name ?? runtimeId} is not installed. Please install it first.
  </p>
)}
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/NewTaskModal.tsx
git commit -m "feat: block agent creation for uninstalled runtimes in NewTaskModal"
```

---

### Task 5: Update NewAgentPopover to fetch runtimes and block uninstalled

**Files:**
- Modify: `src/renderer/components/NewAgentPopover.tsx`

**Step 1: Replace hardcoded RUNTIMES with IPC fetch**

Remove the `const RUNTIMES` array and `RuntimeOption` interface. Add state + fetch:

In the `NewAgentPopover` component, add:
```typescript
const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
```

Fetch when visible:
```typescript
useEffect(() => {
  if (!visible) return
  window.electronAPI.invoke('runtimes:list').then((list) => {
    setRuntimes(list as AgentRuntime[])
  })
}, [visible])
```

Import `AgentRuntime` from `../../shared/types`.

**Step 2: Update PopoverBody to accept runtimes and show install status**

Update the `PopoverBody` props to accept `runtimes: AgentRuntime[]` and render:
```typescript
{runtimes.map((rt) => (
  <option key={rt.id} value={rt.id}>
    {rt.name}{rt.installed === false ? ' (not installed)' : ''}
  </option>
))}
```

**Step 3: Add inline warning and disable submit**

```typescript
const selectedRuntime = runtimes.find((r) => r.id === runtimeId)
const runtimeInstalled = selectedRuntime?.installed !== false
```

Pass `canSubmit={runtimeInstalled}` to `PopoverFooter`.

Add warning below the select in `PopoverBody`:
```typescript
{!runtimeInstalled && (
  <p style={{ color: 'var(--error, #f85149)', fontSize: '12px', margin: 0 }}>
    {selectedRuntime?.name ?? runtimeId} is not installed. Please install it first.
  </p>
)}
```

Where `runtimeInstalled` is derived from the selected runtimeId and the runtimes array (pass both as props to `PopoverBody`).

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/NewAgentPopover.tsx
git commit -m "feat: block agent creation for uninstalled runtimes in NewAgentPopover"
```

---

### Task 6: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Squash-commit if needed or confirm all commits are clean**

Run: `git log --oneline -6`
Verify 5 clean commits for this feature.
