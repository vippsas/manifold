# Branch/PR Checkout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to create a new agent task on an existing branch or GitHub PR, checked out into a fresh worktree.

**Architecture:** New `BranchCheckoutManager` module handles branch listing (local + remote after fetch), PR branch resolution via `gh` CLI, and worktree creation from existing branches. The `SessionManager` routes to it when `existingBranch` or `prIdentifier` is set in `SpawnAgentOptions`. The `NewTaskModal` gets two top-level tabs (New Branch / Existing Branch/PR) with sub-tabs (Branch / Pull Request).

**Tech Stack:** Electron IPC, Node.js `child_process` (via `gitExec`), `gh` CLI, React

---

### Task 1: Add `existingBranch` and `prIdentifier` to SpawnAgentOptions

**Files:**
- Modify: `src/shared/types.ts:63-70`

**Step 1: Update the interface**

In `src/shared/types.ts`, add two optional fields to `SpawnAgentOptions`:

```ts
export interface SpawnAgentOptions {
  projectId: string
  runtimeId: string
  prompt: string
  branchName?: string
  existingBranch?: string
  prIdentifier?: string
  cols?: number
  rows?: number
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new fields are optional, no callers break)

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add existingBranch and prIdentifier to SpawnAgentOptions"
```

---

### Task 2: Create BranchCheckoutManager with listBranches

**Files:**
- Create: `src/main/branch-checkout-manager.ts`
- Test: `src/main/branch-checkout-manager.test.ts`

**Step 1: Write the failing test for listBranches**

Create `src/main/branch-checkout-manager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

function fakeSpawnResult(stdout: string, exitCode = 0, stderr = ''): ChildProcess {
  const child = new EventEmitter() as ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  process.nextTick(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout))
    if (stderr) child.stderr.emit('data', Buffer.from(stderr))
    child.emit('close', exitCode)
  })

  return child
}

const { spawn: mockSpawn } = vi.hoisted(() => {
  return { spawn: vi.fn() }
})

vi.mock('node:child_process', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn,
}))

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  basename: (p: string) => p.split('/').pop() || '',
}))

function mockSpawnReturns(stdout: string, exitCode = 0, stderr = ''): void {
  mockSpawn.mockImplementation(() => fakeSpawnResult(stdout, exitCode, stderr))
}

function mockSpawnSequence(
  calls: Array<{ stdout: string; exitCode?: number; stderr?: string }>
): void {
  const queue = [...calls]
  mockSpawn.mockImplementation(() => {
    const next = queue.shift()
    if (!next) return fakeSpawnResult('', 1, 'unexpected spawn call')
    return fakeSpawnResult(next.stdout, next.exitCode ?? 0, next.stderr ?? '')
  })
}

import { BranchCheckoutManager } from './branch-checkout-manager'

describe('BranchCheckoutManager', () => {
  let manager: BranchCheckoutManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new BranchCheckoutManager('/mock-home/.manifold')
  })

  describe('listBranches', () => {
    it('fetches from remote then returns deduplicated branch list', async () => {
      mockSpawnSequence([
        { stdout: '' }, // git fetch --all --prune
        {
          stdout: [
            '  main',
            '  feature/login',
            '  origin/main',
            '  origin/feature/login',
            '  origin/feature/signup',
          ].join('\n'),
        }, // git branch -a --format=%(refname:short)
      ])

      const branches = await manager.listBranches('/repo')

      // Should deduplicate main and feature/login, include feature/signup from remote
      expect(branches).toContain('main')
      expect(branches).toContain('feature/login')
      expect(branches).toContain('feature/signup')
      // No origin/ prefix in results
      expect(branches.every((b) => !b.startsWith('origin/'))).toBe(true)
    })

    it('filters out manifold/ prefixed branches', async () => {
      mockSpawnSequence([
        { stdout: '' },
        {
          stdout: [
            '  main',
            '  manifold/oslo',
            '  origin/manifold/bergen',
          ].join('\n'),
        },
      ])

      const branches = await manager.listBranches('/repo')

      expect(branches).toContain('main')
      expect(branches).not.toContain('manifold/oslo')
      expect(branches).not.toContain('manifold/bergen')
    })

    it('filters out HEAD entries', async () => {
      mockSpawnSequence([
        { stdout: '' },
        {
          stdout: '  main\n  origin/HEAD\n  origin/main\n',
        },
      ])

      const branches = await manager.listBranches('/repo')

      expect(branches).not.toContain('HEAD')
      expect(branches).toContain('main')
    })

    it('returns empty array when fetch fails', async () => {
      mockSpawnSequence([
        { stdout: '', exitCode: 128, stderr: 'fatal: no remote' },
        { stdout: '  main\n' },
      ])

      // Should still list local branches even if fetch fails
      const branches = await manager.listBranches('/repo')
      expect(branches).toContain('main')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/branch-checkout-manager.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/main/branch-checkout-manager.ts`:

```ts
import * as fs from 'node:fs'
import * as path from 'node:path'
import { gitExec } from './git-exec'

export class BranchCheckoutManager {
  constructor(private storagePath: string) {}

  async listBranches(projectPath: string): Promise<string[]> {
    // Fetch latest from all remotes (best-effort)
    try {
      await gitExec(['fetch', '--all', '--prune'], projectPath)
    } catch {
      // Fetch may fail (no remote, network issues) — continue with local data
    }

    const raw = await gitExec(['branch', '-a', '--format=%(refname:short)'], projectPath)
    const seen = new Set<string>()
    const branches: string[] = []

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Strip origin/ prefix for remote branches
      const name = trimmed.startsWith('origin/') ? trimmed.slice('origin/'.length) : trimmed

      // Filter out HEAD, manifold/* worktree branches
      if (name === 'HEAD') continue
      if (name.startsWith('manifold/')) continue

      if (!seen.has(name)) {
        seen.add(name)
        branches.push(name)
      }
    }

    return branches
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/branch-checkout-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/branch-checkout-manager.ts src/main/branch-checkout-manager.test.ts
git commit -m "feat: add BranchCheckoutManager with listBranches"
```

---

### Task 3: Add fetchPRBranch to BranchCheckoutManager

**Files:**
- Modify: `src/main/branch-checkout-manager.ts`
- Modify: `src/main/branch-checkout-manager.test.ts`

**Step 1: Write the failing tests**

Append to the `describe('BranchCheckoutManager')` block in the test file:

```ts
  describe('fetchPRBranch', () => {
    it('fetches PR branch by number', async () => {
      mockSpawnSequence([
        { stdout: 'feature/cool-stuff\n' }, // gh pr view --json headRefName
        { stdout: '' },                      // git fetch origin feature/cool-stuff
      ])

      const branch = await manager.fetchPRBranch('/repo', '42')

      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['pr', 'view', '42', '--json', 'headRefName', '-q', '.headRefName'],
        expect.objectContaining({ cwd: '/repo' })
      )
      expect(branch).toBe('feature/cool-stuff')
    })

    it('extracts PR number from GitHub URL', async () => {
      mockSpawnSequence([
        { stdout: 'fix/bug-123\n' },
        { stdout: '' },
      ])

      const branch = await manager.fetchPRBranch(
        '/repo',
        'https://github.com/org/repo/pull/99'
      )

      expect(mockSpawn).toHaveBeenCalledWith(
        'gh',
        ['pr', 'view', '99', '--json', 'headRefName', '-q', '.headRefName'],
        expect.objectContaining({ cwd: '/repo' })
      )
      expect(branch).toBe('fix/bug-123')
    })

    it('throws on invalid PR identifier', async () => {
      await expect(
        manager.fetchPRBranch('/repo', 'not-a-number')
      ).rejects.toThrow('Invalid PR identifier')
    })

    it('throws when gh fails', async () => {
      mockSpawnReturns('', 1, 'Could not resolve to a pull request')

      await expect(
        manager.fetchPRBranch('/repo', '999')
      ).rejects.toThrow()
    })
  })
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/branch-checkout-manager.test.ts`
Expected: FAIL — fetchPRBranch not defined

**Step 3: Implement fetchPRBranch**

The `gh` CLI is not wrapped by `gitExec` (it's not a git command), so add a helper `ghExec` in the same file. Add these methods to the class:

```ts
import { spawn } from 'node:child_process'

function ghExec(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    child.stdout!.on('data', (data: Buffer) => chunks.push(data))
    child.stderr!.on('data', (data: Buffer) => errChunks.push(data))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`gh ${args[0]} failed (code ${code}): ${Buffer.concat(errChunks).toString('utf8')}`))
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    })
  })
}
```

Add to the class:

```ts
  async fetchPRBranch(projectPath: string, prIdentifier: string): Promise<string> {
    const prNumber = this.parsePRNumber(prIdentifier)

    const branchName = (
      await ghExec(
        ['pr', 'view', prNumber, '--json', 'headRefName', '-q', '.headRefName'],
        projectPath
      )
    ).trim()

    // Fetch the branch from origin so it's available locally
    await gitExec(['fetch', 'origin', branchName], projectPath)

    return branchName
  }

  private parsePRNumber(identifier: string): string {
    // Try raw number
    if (/^\d+$/.test(identifier.trim())) {
      return identifier.trim()
    }

    // Try GitHub URL: https://github.com/owner/repo/pull/123
    const urlMatch = identifier.match(/\/pull\/(\d+)/)
    if (urlMatch) {
      return urlMatch[1]
    }

    throw new Error(
      `Invalid PR identifier: "${identifier}". Use a PR number or GitHub URL.`
    )
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/branch-checkout-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/branch-checkout-manager.ts src/main/branch-checkout-manager.test.ts
git commit -m "feat: add fetchPRBranch to BranchCheckoutManager"
```

---

### Task 4: Add createWorktreeFromBranch to BranchCheckoutManager

**Files:**
- Modify: `src/main/branch-checkout-manager.ts`
- Modify: `src/main/branch-checkout-manager.test.ts`

**Step 1: Write the failing tests**

Append to the test file:

```ts
  describe('createWorktreeFromBranch', () => {
    it('creates a worktree from an existing branch (no -b flag)', async () => {
      mockSpawnReturns('') // git worktree add

      const result = await manager.createWorktreeFromBranch(
        '/repo',
        'feature/login',
        'my-project'
      )

      expect(result.branch).toBe('feature/login')
      expect(result.path).toContain('my-project')
      expect(result.path).toContain('feature-login')
      // Verify no -b flag
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', expect.stringContaining('feature-login'), 'feature/login'],
        expect.objectContaining({ cwd: '/repo' })
      )
    })

    it('creates storage directory if needed', async () => {
      mockSpawnReturns('')

      await manager.createWorktreeFromBranch('/repo', 'main', 'my-project')

      const fs = await import('node:fs')
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('worktrees/my-project'),
        { recursive: true }
      )
    })

    it('handles branch names with slashes in directory naming', async () => {
      mockSpawnReturns('')

      const result = await manager.createWorktreeFromBranch(
        '/repo',
        'feature/deep/nested',
        'proj'
      )

      expect(result.path).toContain('feature-deep-nested')
    })
  })
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/branch-checkout-manager.test.ts`
Expected: FAIL — createWorktreeFromBranch not defined

**Step 3: Implement createWorktreeFromBranch**

Add to the class:

```ts
  async createWorktreeFromBranch(
    projectPath: string,
    branch: string,
    projectName: string
  ): Promise<{ branch: string; path: string }> {
    const worktreeBase = path.join(this.storagePath, 'worktrees', projectName)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)

    // No -b flag: check out existing branch, don't create new
    await gitExec(['worktree', 'add', worktreePath, branch], projectPath)

    return { branch, path: worktreePath }
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/branch-checkout-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/branch-checkout-manager.ts src/main/branch-checkout-manager.test.ts
git commit -m "feat: add createWorktreeFromBranch to BranchCheckoutManager"
```

---

### Task 5: Wire BranchCheckoutManager into SessionManager

**Files:**
- Modify: `src/main/session-manager.ts:1-10,37-68`

**Step 1: Add BranchCheckoutManager as a dependency**

Update the constructor and `createSession` in `src/main/session-manager.ts`:

Constructor change:
```ts
import { BranchCheckoutManager } from './branch-checkout-manager'

// Update constructor to accept optional BranchCheckoutManager
constructor(
  private worktreeManager: WorktreeManager,
  private ptyPool: PtyPool,
  private projectRegistry: ProjectRegistry,
  private branchCheckoutManager?: BranchCheckoutManager
) {}
```

Update `createSession()` to route based on options:
```ts
async createSession(options: SpawnAgentOptions): Promise<AgentSession> {
  const project = this.resolveProject(options.projectId)
  const runtime = this.resolveRuntime(options.runtimeId)

  let worktree: { branch: string; path: string }

  if (options.prIdentifier && this.branchCheckoutManager) {
    const branch = await this.branchCheckoutManager.fetchPRBranch(
      project.path,
      options.prIdentifier
    )
    worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
      project.path,
      branch,
      project.name
    )
  } else if (options.existingBranch && this.branchCheckoutManager) {
    worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
      project.path,
      options.existingBranch,
      project.name
    )
  } else {
    worktree = await this.worktreeManager.createWorktree(
      project.path,
      project.baseBranch,
      project.name,
      options.branchName
    )
  }

  // ... rest unchanged from ptyPool.spawn() onward
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new param is optional, no callers break)

**Step 3: Run existing tests**

Run: `npm test`
Expected: PASS — existing SessionManager tests don't pass branchCheckoutManager, and it defaults to undefined

**Step 4: Commit**

```bash
git add src/main/session-manager.ts
git commit -m "feat: wire BranchCheckoutManager into SessionManager"
```

---

### Task 6: Register new IPC channels and wire into index.ts

**Files:**
- Modify: `src/main/index.ts:83` (add `branchCheckoutManager` instance)
- Modify: `src/main/index.ts:77` (pass to SessionManager constructor)
- Modify: `src/main/ipc/types.ts` (add to IpcDependencies)
- Modify: `src/main/ipc/agent-handlers.ts` (add `git:list-branches` and `git:fetch-pr-branch`)
- Modify: `src/preload/index.ts` (whitelist new channels)

**Step 1: Create instance in index.ts**

After the `gitOps` line (~line 83), add:
```ts
import { BranchCheckoutManager } from './branch-checkout-manager'

const branchCheckout = new BranchCheckoutManager(settingsStore.getSettings().storagePath)
```

Update `SessionManager` construction (~line 77):
```ts
const sessionManager = new SessionManager(worktreeManager, ptyPool, projectRegistry, branchCheckout)
```

Add to `wireModules` deps object:
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
  gitOps,
  branchCheckout,
})
```

**Step 2: Update IpcDependencies**

In `src/main/ipc/types.ts`, add:
```ts
import { BranchCheckoutManager } from '../branch-checkout-manager'

export interface IpcDependencies {
  // ... existing fields ...
  branchCheckout: BranchCheckoutManager
}
```

**Step 3: Add IPC handlers**

In `src/main/ipc/agent-handlers.ts`, add at the end of `registerAgentHandlers`:
```ts
  ipcMain.handle('git:list-branches', async (_event, projectId: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return deps.branchCheckout.listBranches(project.path)
  })

  ipcMain.handle('git:fetch-pr-branch', async (_event, projectId: string, prIdentifier: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    const branch = await deps.branchCheckout.fetchPRBranch(project.path, prIdentifier)
    return { branch }
  })
```

**Step 4: Whitelist channels in preload**

In `src/preload/index.ts`, add to `ALLOWED_INVOKE_CHANNELS`:
```ts
  'git:list-branches',
  'git:fetch-pr-branch',
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Run all tests**

Run: `npm test`
Expected: PASS

**Step 7: Commit**

```bash
git add src/main/index.ts src/main/ipc/types.ts src/main/ipc/agent-handlers.ts src/preload/index.ts
git commit -m "feat: register git:list-branches and git:fetch-pr-branch IPC channels"
```

---

### Task 7: Add tab and sub-tab styles to NewTaskModal.styles.ts

**Files:**
- Modify: `src/renderer/components/NewTaskModal.styles.ts`

**Step 1: Add tab styles**

Add the following entries to the `modalStyles` object in `NewTaskModal.styles.ts`:

```ts
  tabBar: {
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid var(--border)',
    padding: '0 16px',
  },
  tab: {
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: 'var(--text-primary)',
    borderBottomColor: 'var(--accent)',
  },
  subTabBar: {
    display: 'flex',
    gap: '4px',
    marginBottom: '4px',
  },
  subTab: {
    padding: '4px 12px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  subTabActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-tertiary, var(--bg-input))',
    borderColor: 'var(--accent)',
  },
  errorText: {
    color: 'var(--error, #f85149)',
    fontSize: '12px',
    margin: 0,
  },
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/components/NewTaskModal.styles.ts
git commit -m "feat: add tab and sub-tab styles to NewTaskModal"
```

---

### Task 8: Refactor NewTaskModal with tab UI for branch/PR checkout

**Files:**
- Modify: `src/renderer/components/NewTaskModal.tsx`

This is the largest task. The modal keeps the "New Branch" flow as the default tab (current behavior unchanged). The second tab "Existing Branch/PR" shows the task description + agent dropdown + two sub-tabs (Branch / Pull Request).

**Step 1: Add state and tab structure**

Add new state variables:
```ts
type ModalTab = 'new' | 'existing'
type ExistingSubTab = 'branch' | 'pr'

const [activeTab, setActiveTab] = useState<ModalTab>('new')
const [existingSubTab, setExistingSubTab] = useState<ExistingSubTab>('branch')
const [branches, setBranches] = useState<string[]>([])
const [branchFilter, setBranchFilter] = useState('')
const [selectedBranch, setSelectedBranch] = useState('')
const [prInput, setPrInput] = useState('')
const [branchesLoading, setBranchesLoading] = useState(false)
const [error, setError] = useState('')
```

Reset these in `useResetOnOpen` as well.

**Step 2: Add branch fetching effect**

When the modal becomes visible and the user switches to the "existing" tab with sub-tab "branch", fetch branches:

```ts
useEffect(() => {
  if (!visible || activeTab !== 'existing' || existingSubTab !== 'branch') return
  setBranchesLoading(true)
  setError('')
  window.electronAPI
    .invoke('git:list-branches', effectiveProjectId)
    .then((list) => {
      setBranches(list as string[])
    })
    .catch((err) => {
      setError(`Failed to load branches: ${(err as Error).message}`)
    })
    .finally(() => setBranchesLoading(false))
}, [visible, activeTab, existingSubTab, effectiveProjectId])
```

**Step 3: Update handleSubmit**

The submit handler needs to send different options based on which tab/sub-tab is active:

```ts
const handleSubmit = useCallback(
  (e: React.FormEvent): void => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError('')

    if (activeTab === 'existing' && existingSubTab === 'branch') {
      onLaunch({
        projectId: effectiveProjectId,
        runtimeId,
        prompt: taskDescription.trim(),
        existingBranch: selectedBranch,
      })
    } else if (activeTab === 'existing' && existingSubTab === 'pr') {
      onLaunch({
        projectId: effectiveProjectId,
        runtimeId,
        prompt: taskDescription.trim(),
        prIdentifier: prInput.trim(),
      })
    } else {
      onLaunch({
        projectId: effectiveProjectId,
        runtimeId,
        prompt: taskDescription.trim(),
        branchName: branchName.trim() || undefined,
      })
    }
  },
  [activeTab, existingSubTab, effectiveProjectId, runtimeId, taskDescription, branchName, selectedBranch, prInput, canSubmit, onLaunch]
)
```

**Step 4: Update canSubmit logic**

```ts
const canSubmit = (() => {
  if (!runtimeInstalled) return false
  if (taskDescription.trim().length === 0) return false
  if (activeTab === 'existing' && existingSubTab === 'branch' && !selectedBranch) return false
  if (activeTab === 'existing' && existingSubTab === 'pr' && !prInput.trim()) return false
  return true
})()
```

**Step 5: Build the tab bar and existing-branch UI**

Add a `TabBar` component rendered between `ModalHeader` and the body:

```tsx
function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ModalTab
  onTabChange: (tab: ModalTab) => void
}): React.JSX.Element {
  return (
    <div style={modalStyles.tabBar}>
      <button
        type="button"
        onClick={() => onTabChange('new')}
        style={{
          ...modalStyles.tab,
          ...(activeTab === 'new' ? modalStyles.tabActive : {}),
        }}
      >
        New Branch
      </button>
      <button
        type="button"
        onClick={() => onTabChange('existing')}
        style={{
          ...modalStyles.tab,
          ...(activeTab === 'existing' ? modalStyles.tabActive : {}),
        }}
      >
        Existing Branch / PR
      </button>
    </div>
  )
}
```

Add a `BranchPicker` component:

```tsx
function BranchPicker({
  branches,
  filter,
  onFilterChange,
  selected,
  onSelect,
  loading,
}: {
  branches: string[]
  filter: string
  onFilterChange: (v: string) => void
  selected: string
  onSelect: (v: string) => void
  loading: boolean
}): React.JSX.Element {
  const filtered = branches.filter((b) =>
    b.toLowerCase().includes(filter.toLowerCase())
  )
  return (
    <label style={modalStyles.label}>
      Branch
      <input
        type="text"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder={loading ? 'Loading branches...' : 'Filter branches...'}
        style={modalStyles.input}
      />
      {!loading && (
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          style={{ ...modalStyles.select, marginTop: '4px' }}
          size={Math.min(filtered.length, 8) || 1}
        >
          {filtered.length === 0 && (
            <option value="" disabled>
              {filter ? 'No matching branches' : 'No branches found'}
            </option>
          )}
          {filtered.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}
    </label>
  )
}
```

Add a `PRInput` component:

```tsx
function PRInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <label style={modalStyles.label}>
      Pull Request
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="PR number or GitHub URL (e.g. 42)"
        style={modalStyles.input}
      />
      <p style={modalStyles.hint}>
        Enter a PR number or full GitHub URL to check out the PR branch
      </p>
    </label>
  )
}
```

**Step 6: Compose it all in the modal body**

Update the modal JSX to render the tab bar and conditional content:

```tsx
<form onSubmit={handleSubmit} style={modalStyles.panel}>
  <ModalHeader onClose={onClose} />
  <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
  <div style={modalStyles.body}>
    {showProjectSelector && (
      <ProjectDropdown value={selectedProjectId} onChange={setSelectedProjectId} projects={projects} />
    )}
    <TaskDescriptionField value={taskDescription} onChange={setTaskDescription} textareaRef={textareaRef} />
    <AgentDropdown value={runtimeId} onChange={setRuntimeId} runtimes={runtimes} />
    {!runtimeInstalled && (
      <p style={modalStyles.errorText}>
        {selectedRuntime?.name ?? runtimeId} is not installed. Please install it first.
      </p>
    )}

    {activeTab === 'new' && (
      <AdvancedSection
        show={showAdvanced}
        onToggle={() => setShowAdvanced((p) => !p)}
        branchName={branchName}
        onBranchChange={handleBranchChange}
        projectName={effectiveProjectName}
      />
    )}

    {activeTab === 'existing' && (
      <>
        <div style={modalStyles.subTabBar}>
          <button
            type="button"
            onClick={() => setExistingSubTab('branch')}
            style={{
              ...modalStyles.subTab,
              ...(existingSubTab === 'branch' ? modalStyles.subTabActive : {}),
            }}
          >
            Branch
          </button>
          <button
            type="button"
            onClick={() => setExistingSubTab('pr')}
            style={{
              ...modalStyles.subTab,
              ...(existingSubTab === 'pr' ? modalStyles.subTabActive : {}),
            }}
          >
            Pull Request
          </button>
        </div>

        {existingSubTab === 'branch' && (
          <BranchPicker
            branches={branches}
            filter={branchFilter}
            onFilterChange={setBranchFilter}
            selected={selectedBranch}
            onSelect={setSelectedBranch}
            loading={branchesLoading}
          />
        )}

        {existingSubTab === 'pr' && (
          <PRInput value={prInput} onChange={setPrInput} />
        )}
      </>
    )}

    {error && <p style={modalStyles.errorText}>{error}</p>}
  </div>
  <ModalFooter onClose={onClose} canSubmit={canSubmit} loading={loading} />
</form>
```

**Step 7: Update useResetOnOpen**

Pass and reset the new state variables when modal opens:

```ts
setActiveTab('new')
setExistingSubTab('branch')
setBranches([])
setBranchFilter('')
setSelectedBranch('')
setPrInput('')
setError('')
```

This requires updating the `useResetOnOpen` signature to accept the new setters.

**Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 9: Run all tests**

Run: `npm test`
Expected: PASS

**Step 10: Commit**

```bash
git add src/renderer/components/NewTaskModal.tsx
git commit -m "feat: add existing branch/PR checkout tabs to NewTaskModal"
```

---

### Task 9: Final integration test and typecheck

**Files:** None (verification only)

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 3: Manual verification**

Run: `npm run dev`

1. Click "New Task" — verify the "New Branch" tab works exactly as before
2. Switch to "Existing Branch/PR" tab — verify branches load in the Branch sub-tab
3. Filter branches — verify filtering works
4. Select a branch and submit — verify a worktree is created and agent starts
5. Switch to "Pull Request" sub-tab — enter a PR number and submit
6. Verify error states (invalid PR number, missing branch selection)
