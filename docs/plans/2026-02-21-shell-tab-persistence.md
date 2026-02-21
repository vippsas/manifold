# Shell Tab Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore extra shell tabs (created via "+") when the app restarts, opening fresh shells with the same labels and layout.

**Architecture:** New `ShellTabStore` class in main process persists tab metadata to `~/.manifold/shell-tabs.json`. Two new IPC channels let the renderer read/write this state. `ShellTabs` component restores tabs on mount by creating fresh shells for each saved entry.

**Tech Stack:** TypeScript, Node.js fs, Electron IPC, React

---

### Task 1: Create ShellTabStore

**Files:**
- Create: `src/main/shell-tab-store.ts`
- Test: `src/main/shell-tab-store.test.ts`

**Step 1: Write the failing tests**

Create `src/main/shell-tab-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

import * as fs from 'node:fs'
import { ShellTabStore } from './shell-tab-store'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)
const mockMkdirSync = vi.mocked(fs.mkdirSync)

describe('ShellTabStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor / loadFromDisk', () => {
    it('returns null when file does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ShellTabStore()
      expect(store.get('/some/path')).toBeNull()
    })

    it('loads existing state from disk', () => {
      const state = {
        '/worktree/oslo': {
          tabs: [{ label: 'Shell 3', cwd: '/worktree/oslo' }],
          counter: 4,
        },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ShellTabStore()
      expect(store.get('/worktree/oslo')).toEqual(state['/worktree/oslo'])
    })

    it('returns null when file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue('not json!')
      const store = new ShellTabStore()
      expect(store.get('/any')).toBeNull()
    })
  })

  describe('get', () => {
    it('returns a copy not the same reference', () => {
      const state = {
        '/path': { tabs: [{ label: 'Shell 3', cwd: '/path' }], counter: 4 },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ShellTabStore()
      const a = store.get('/path')
      const b = store.get('/path')
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('set', () => {
    it('saves state and writes to disk', () => {
      mockExistsSync.mockReturnValue(false)
      const store = new ShellTabStore()

      store.set('/path', {
        tabs: [{ label: 'Shell 3', cwd: '/path' }],
        counter: 4,
      })

      expect(store.get('/path')).toEqual({
        tabs: [{ label: 'Shell 3', cwd: '/path' }],
        counter: 4,
      })
      expect(mockMkdirSync).toHaveBeenCalled()
      expect(mockWriteFileSync).toHaveBeenCalledOnce()
    })
  })

  describe('delete', () => {
    it('removes state and writes to disk', () => {
      const state = {
        '/path': { tabs: [{ label: 'Shell 3', cwd: '/path' }], counter: 4 },
      }
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(JSON.stringify(state))

      const store = new ShellTabStore()
      store.delete('/path')
      expect(store.get('/path')).toBeNull()
      expect(mockWriteFileSync).toHaveBeenCalled()
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/shell-tab-store.test.ts`
Expected: FAIL — module not found

**Step 3: Write ShellTabStore implementation**

Create `src/main/shell-tab-store.ts` following the `ViewStateStore` pattern exactly:

```ts
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

export interface SavedShellTab {
  label: string
  cwd: string
}

export interface SavedShellState {
  tabs: SavedShellTab[]
  counter: number
}

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'shell-tabs.json')

export class ShellTabStore {
  private state: Map<string, SavedShellState>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Map<string, SavedShellState> {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return new Map()
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return new Map()
      }
      return new Map(Object.entries(parsed as Record<string, SavedShellState>))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    const obj = Object.fromEntries(this.state)
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  }

  get(agentKey: string): SavedShellState | null {
    const entry = this.state.get(agentKey)
    if (!entry) return null
    return {
      tabs: entry.tabs.map((t) => ({ ...t })),
      counter: entry.counter,
    }
  }

  set(agentKey: string, state: SavedShellState): void {
    this.state.set(agentKey, { tabs: state.tabs.map((t) => ({ ...t })), counter: state.counter })
    this.writeToDisk()
  }

  delete(agentKey: string): void {
    this.state.delete(agentKey)
    this.writeToDisk()
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/shell-tab-store.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/main/shell-tab-store.ts src/main/shell-tab-store.test.ts
git commit -m "feat: add ShellTabStore for persisting extra shell tabs"
```

---

### Task 2: Wire ShellTabStore into main process and IPC

**Files:**
- Modify: `src/main/index.ts` (add instantiation, ~line 83)
- Modify: `src/main/ipc-handlers.ts` (add IPC handlers + inject dependency)
- Modify: `src/preload/index.ts` (whitelist new channels)

**Step 1: Add ShellTabStore to main process**

In `src/main/index.ts`, add import alongside other stores (~line 69):
```ts
import { ShellTabStore } from './shell-tab-store'
```

Add instantiation after `viewStateStore` (~line 83):
```ts
const shellTabStore = new ShellTabStore()
```

Add to `registerIpcHandlers` call in `wireModules` (~line 138-146):
```ts
registerIpcHandlers({
  settingsStore,
  projectRegistry,
  sessionManager,
  fileWatcher,
  diffProvider,
  prCreator,
  viewStateStore,
  shellTabStore,
})
```

**Step 2: Add IPC handlers**

In `src/main/ipc-handlers.ts`, add import:
```ts
import { ShellTabStore, SavedShellState } from './shell-tab-store'
```

Add `shellTabStore` to `IpcDependencies` interface:
```ts
export interface IpcDependencies {
  // ... existing fields ...
  shellTabStore: ShellTabStore
}
```

Add to `registerIpcHandlers`:
```ts
registerShellTabHandlers(deps)
```

Add new handler function:
```ts
function registerShellTabHandlers(deps: IpcDependencies): void {
  const { shellTabStore } = deps

  ipcMain.handle('shell-tabs:get', (_event, agentKey: string) => {
    return shellTabStore.get(agentKey)
  })

  ipcMain.handle('shell-tabs:set', (_event, agentKey: string, state: SavedShellState) => {
    shellTabStore.set(agentKey, state)
  })
}
```

**Step 3: Whitelist IPC channels in preload**

In `src/preload/index.ts`, add to `ALLOWED_INVOKE_CHANNELS`:
```ts
'shell-tabs:get',
'shell-tabs:set',
```

**Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/main/index.ts src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat: wire ShellTabStore into IPC layer"
```

---

### Task 3: Update ShellTabs to persist and restore tabs

**Files:**
- Modify: `src/renderer/components/ShellTabs.tsx`

This is the main change. ShellTabs needs to:
1. On mount / agent switch: check for saved tabs, create fresh shells for each
2. On tab add/remove: persist current state

**Step 1: Add persistence helper functions**

Add a `persistTabs` helper and a restore effect. The key changes to `ShellTabs.tsx`:

After the existing cache sync effect (~line 77), add a `persistTabs` callback:

```ts
const persistTabs = useCallback(
  (shells: ExtraShell[], counter: number) => {
    if (!worktreeCwd) return
    if (shells.length === 0) {
      void window.electronAPI.invoke('shell-tabs:set', agentKey, { tabs: [], counter })
    } else {
      const tabs = shells.map((s) => ({ label: s.label, cwd: worktreeCwd }))
      void window.electronAPI.invoke('shell-tabs:set', agentKey, { tabs, counter })
    }
  },
  [agentKey, worktreeCwd]
)
```

**Step 2: Add restore effect**

Add a ref to track which agents have been restored, and an effect that runs on agent switch:

```ts
const restoredRef = useRef(new Set<string>())

useEffect(() => {
  if (!worktreeCwd || agentKey === '__none__') return
  if (restoredRef.current.has(agentKey)) return
  // If cache already has shells for this agent, skip restore
  const entry = extraShellCacheRef.current.get(agentKey)
  if (entry && entry.shells.length > 0) return

  restoredRef.current.add(agentKey)

  void (async () => {
    const saved = (await window.electronAPI.invoke('shell-tabs:get', agentKey)) as {
      tabs: { label: string; cwd: string }[]
      counter: number
    } | null
    if (!saved || saved.tabs.length === 0) return

    const shells: ExtraShell[] = []
    for (const tab of saved.tabs) {
      try {
        const result = (await window.electronAPI.invoke('shell:create', tab.cwd)) as {
          sessionId: string
        }
        shells.push({ sessionId: result.sessionId, label: tab.label })
      } catch {
        // skip failed shell creation
      }
    }

    if (shells.length > 0) {
      const cacheEntry = extraShellCacheRef.current.get(agentKey) ?? { shells: [], counter: 3 }
      cacheEntry.shells = shells
      cacheEntry.counter = saved.counter
      extraShellCacheRef.current.set(agentKey, cacheEntry)
      setExtraShells(shells)
    }
  })()
}, [agentKey, worktreeCwd])
```

**Step 3: Call persistTabs in addShell and removeShell**

In `addShell`, after `setExtraShells`, add:
```ts
const updatedShells = [...prev, { sessionId: result.sessionId, label }]
// (replace the setExtraShells line to capture the new array)
setExtraShells(updatedShells) // was: setExtraShells((prev) => [...prev, ...])
persistTabs(updatedShells, entry ? entry.counter : counter + 1)
```

Actually, simpler: add a separate effect that persists whenever `extraShells` changes:

```ts
useEffect(() => {
  const entry = extraShellCacheRef.current.get(agentKey)
  if (!entry) return
  persistTabs(extraShells, entry.counter)
}, [extraShells, agentKey, persistTabs])
```

This fires on every add/remove automatically.

**Step 4: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: All pass

**Step 5: Manual smoke test**

1. `npm run dev`
2. Select an agent, click "+" to create 2 extra shell tabs
3. Close and reopen the app
4. Select the same agent — the 2 extra tabs should appear with correct labels

**Step 6: Commit**

```bash
git add src/renderer/components/ShellTabs.tsx
git commit -m "feat: persist and restore extra shell tabs across app restarts"
```

---

### Task 4: Run full verification

**Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 2: Run full test suite**

Run: `npm test`
Expected: All pass (258+ tests)

**Step 3: Commit design docs**

```bash
git add docs/plans/2026-02-21-shell-tab-persistence-design.md docs/plans/2026-02-21-shell-tab-persistence.md
git commit -m "docs: add shell tab persistence design and implementation plan"
```
