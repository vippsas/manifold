# Global Agent Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move agent worktree storage from project-local `.manifold/worktrees/` to a user-chosen global directory (default `~/.manifold/`), with a first-launch welcome dialog.

**Architecture:** Add `storagePath` and `setupCompleted` to settings. WorktreeManager constructor receives `storagePath` and computes worktree base as `<storagePath>/worktrees/<projectId>/`. A WelcomeDialog renders on first launch to let the user confirm or change the path.

**Tech Stack:** Electron, React, TypeScript, Vitest

---

### Task 1: Add `storagePath` and `setupCompleted` to Settings Types

**Files:**
- Modify: `src/shared/types.ts:44-49`
- Modify: `src/shared/defaults.ts:1-8`

**Step 1: Update ManifoldSettings interface**

In `src/shared/types.ts`, add two new fields to `ManifoldSettings`:

```typescript
export interface ManifoldSettings {
  storagePath: string
  setupCompleted: boolean
  defaultRuntime: string
  theme: 'dark' | 'light'
  scrollbackLines: number
  defaultBaseBranch: string
}
```

**Step 2: Update DEFAULT_SETTINGS**

In `src/shared/defaults.ts`, add defaults. Note: we need `os.homedir()` but this file is shared between main and renderer. Use a string placeholder `'~/.manifold'` and resolve it at runtime in the main process.

Actually, since `path` and `os` are Node modules and this file is imported in the renderer too, use a lazy approach: set default to empty string and resolve in SettingsStore.

```typescript
import type { ManifoldSettings } from './types'

export const DEFAULT_SETTINGS: ManifoldSettings = {
  storagePath: '',
  setupCompleted: false,
  defaultRuntime: 'claude',
  theme: 'dark',
  scrollbackLines: 5000,
  defaultBaseBranch: 'main'
}
```

**Step 3: Update SettingsStore to resolve empty storagePath**

In `src/main/settings-store.ts`, after loading settings, if `storagePath` is empty, set it to `path.join(os.homedir(), '.manifold')`:

```typescript
private loadFromDisk(): ManifoldSettings {
  // ... existing load logic ...
  const settings = { ...DEFAULT_SETTINGS, ...(parsed as Partial<ManifoldSettings>) }
  if (!settings.storagePath) {
    settings.storagePath = path.join(os.homedir(), '.manifold')
  }
  return settings
}
```

Also apply the same resolution in the constructor's fallback paths (when file doesn't exist, invalid JSON, etc.), by adding a `private resolveDefaults` helper:

```typescript
private resolveDefaults(settings: ManifoldSettings): ManifoldSettings {
  if (!settings.storagePath) {
    settings.storagePath = path.join(os.homedir(), '.manifold')
  }
  return settings
}
```

Call `this.resolveDefaults()` on the result of every code path in `loadFromDisk`.

**Step 4: Run tests to verify nothing broke**

Run: `npx vitest run src/main/settings-store.test.ts`
Expected: All existing tests still pass (DEFAULT_SETTINGS changed but tests compare against the imported constant which also changed).

**Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/settings-store.ts
git commit -m "feat: add storagePath and setupCompleted to ManifoldSettings"
```

---

### Task 2: Update WorktreeManager to Use Global Storage Path

**Files:**
- Modify: `src/main/worktree-manager.ts:1-90`
- Modify: `src/main/worktree-manager.test.ts:1-181`

**Step 1: Write failing test for constructor with storagePath**

In `src/main/worktree-manager.test.ts`, update the `beforeEach` to pass `storagePath`:

```typescript
beforeEach(() => {
  vi.clearAllMocks()
  manager = new WorktreeManager('/mock-home/.manifold')
})
```

And update the `createWorktree` test expectations:

```typescript
it('creates a worktree with a generated branch name', async () => {
  mockRaw.mockResolvedValue('')

  const result = await manager.createWorktree('/repo', 'main', 'proj-1')

  expect(generateBranchName).toHaveBeenCalledWith('/repo')
  expect(result.branch).toBe('manifold/oslo')
  expect(result.path).toBe('/mock-home/.manifold/worktrees/proj-1/manifold-oslo')
  expect(mockRaw).toHaveBeenCalledWith([
    'worktree', 'add', '-b', 'manifold/oslo',
    '/mock-home/.manifold/worktrees/proj-1/manifold-oslo',
    'main',
  ])
})
```

Update the directory creation test:

```typescript
it('creates the worktree directory', async () => {
  mockRaw.mockResolvedValue('')

  await manager.createWorktree('/repo', 'main', 'proj-1')

  expect(fs.mkdirSync).toHaveBeenCalledWith(
    '/mock-home/.manifold/worktrees/proj-1',
    { recursive: true }
  )
})
```

Update remaining `createWorktree` tests similarly to pass `projectId` as third argument.

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/worktree-manager.test.ts`
Expected: FAIL — `WorktreeManager` constructor doesn't accept arguments yet.

**Step 3: Implement WorktreeManager changes**

In `src/main/worktree-manager.ts`:

```typescript
import * as fs from 'node:fs'
import * as path from 'node:path'
import simpleGit, { SimpleGit } from 'simple-git'
import { generateBranchName } from './branch-namer'

export interface WorktreeInfo {
  branch: string
  path: string
}

export class WorktreeManager {
  constructor(private storagePath: string) {}

  private getGit(projectPath: string): SimpleGit {
    return simpleGit(projectPath)
  }

  private getWorktreeBase(projectId: string): string {
    return path.join(this.storagePath, 'worktrees', projectId)
  }

  async createWorktree(
    projectPath: string,
    baseBranch: string,
    projectId: string,
    branchName?: string
  ): Promise<WorktreeInfo> {
    const git = this.getGit(projectPath)
    const branch = branchName ?? (await generateBranchName(projectPath))
    const worktreeBase = this.getWorktreeBase(projectId)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)

    await git.raw(['worktree', 'add', '-b', branch, worktreePath, baseBranch])

    return { branch, path: worktreePath }
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    // unchanged — worktreePath is already absolute
    const git = this.getGit(projectPath)
    const worktrees = await this.listWorktrees(projectPath)
    const target = worktrees.find((w) => w.path === worktreePath)

    await git.raw(['worktree', 'remove', worktreePath, '--force'])

    if (target) {
      try {
        await git.deleteLocalBranch(target.branch, true)
      } catch {
        // Branch may already be deleted
      }
    }
  }

  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    // unchanged — git returns absolute paths regardless of where worktrees live
    const git = this.getGit(projectPath)
    const raw = await git.raw(['worktree', 'list', '--porcelain'])
    const entries: WorktreeInfo[] = []
    let currentPath: string | null = null
    let currentBranch: string | null = null

    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length).trim()
      } else if (line.startsWith('branch ')) {
        const fullRef = line.slice('branch '.length).trim()
        currentBranch = fullRef.replace('refs/heads/', '')
      } else if (line.trim() === '' && currentPath && currentBranch) {
        if (currentBranch.startsWith('manifold/')) {
          entries.push({ branch: currentBranch, path: currentPath })
        }
        currentPath = null
        currentBranch = null
      }
    }

    if (currentPath && currentBranch && currentBranch.startsWith('manifold/')) {
      entries.push({ branch: currentBranch, path: currentPath })
    }

    return entries
  }
}
```

**Step 4: Update all test expectations**

Update the remaining tests in `worktree-manager.test.ts`:

- `uses provided branch name instead of generating one`: pass `'proj-1'` as third arg
- `replaces slashes in branch name for directory naming`: pass `'proj-1'` as third arg, expect path under `/mock-home/.manifold/worktrees/proj-1/`
- `removeWorktree` tests: paths in mock data should use the new global pattern (e.g. `/mock-home/.manifold/worktrees/proj-1/manifold-oslo`) — OR keep them as-is since removeWorktree doesn't care about the base path pattern, it just uses the absolute worktreePath passed to it
- `listWorktrees` tests: keep mock data as-is since listWorktrees just parses git output

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/worktree-manager.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/main/worktree-manager.ts src/main/worktree-manager.test.ts
git commit -m "feat: WorktreeManager uses global storagePath instead of project-local dir"
```

---

### Task 3: Update SessionManager to Pass projectId to WorktreeManager

**Files:**
- Modify: `src/main/session-manager.ts:35-43` (createSession)
- Modify: `src/main/session-manager.test.ts`

**Step 1: Update test expectations for createSession**

In `src/main/session-manager.test.ts`, the mock worktree manager's `createWorktree` is called with `('/repo', 'main', undefined)`. After the change it should be called with `('/repo', 'main', 'proj-1', undefined)`.

Update the test assertion at line 120:

```typescript
expect(worktreeManager.createWorktree).toHaveBeenCalledWith('/repo', 'main', 'proj-1', undefined)
```

Update the custom branch name test at line 178:

```typescript
expect(worktreeManager.createWorktree).toHaveBeenCalledWith('/repo', 'main', 'proj-1', 'manifold/custom')
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: FAIL — createWorktree is called without projectId.

**Step 3: Update SessionManager.createSession**

In `src/main/session-manager.ts`, change the `createSession` method to pass `projectId`:

```typescript
const worktree = await this.worktreeManager.createWorktree(
  project.path,
  project.baseBranch,
  options.projectId,
  options.branchName
)
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/session-manager.ts src/main/session-manager.test.ts
git commit -m "feat: pass projectId to WorktreeManager.createWorktree"
```

---

### Task 4: Update Main Process Wiring

**Files:**
- Modify: `src/main/index.ts:38-42`

**Step 1: Pass storagePath from settings to WorktreeManager**

In `src/main/index.ts`, change line 40 from:

```typescript
const worktreeManager = new WorktreeManager()
```

to:

```typescript
const worktreeManager = new WorktreeManager(settingsStore.getSettings().storagePath)
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass.

**Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire storagePath from settings into WorktreeManager"
```

---

### Task 5: Create WelcomeDialog Component

**Files:**
- Create: `src/renderer/components/WelcomeDialog.tsx`

**Step 1: Create the WelcomeDialog component**

```tsx
import React, { useState, useCallback, useRef } from 'react'

interface WelcomeDialogProps {
  defaultPath: string
  onConfirm: (storagePath: string) => void
}

export function WelcomeDialog({ defaultPath, onConfirm }: WelcomeDialogProps): React.JSX.Element {
  const [storagePath, setStoragePath] = useState(defaultPath)
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleBrowse = useCallback(async () => {
    const selected = (await window.electronAPI.invoke('projects:open-dialog')) as string | undefined
    if (selected) setStoragePath(selected)
  }, [])

  const handleConfirm = useCallback(() => {
    const trimmed = storagePath.trim()
    if (trimmed) onConfirm(trimmed)
  }, [storagePath, onConfirm])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConfirm()
    },
    [handleConfirm]
  )

  return (
    <div ref={overlayRef} style={styles.overlay} role="dialog" aria-modal="true" aria-label="Welcome">
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Welcome to Manifold</span>
        </div>
        <div style={styles.body}>
          <p style={styles.description}>
            Choose where Manifold stores agent worktrees. You can change this later in Settings.
          </p>
          <label style={styles.label}>
            Storage Directory
            <div style={styles.inputRow}>
              <input
                type="text"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
                onKeyDown={handleKeyDown}
                style={styles.input}
                autoFocus
              />
              <button onClick={handleBrowse} style={styles.browseButton}>
                Browse
              </button>
            </div>
          </label>
        </div>
        <div style={styles.footer}>
          <button
            onClick={handleConfirm}
            style={styles.confirmButton}
            disabled={!storagePath.trim()}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    width: '440px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  header: {
    padding: '16px 16px 0',
  },
  title: {
    fontWeight: 600,
    fontSize: '16px',
  },
  body: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  description: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.5,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '13px',
  },
  browseButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
  },
  confirmButton: {
    padding: '6px 24px',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#ffffff',
    background: 'var(--accent)',
    fontWeight: 500,
    cursor: 'pointer',
  },
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/WelcomeDialog.tsx
git commit -m "feat: add WelcomeDialog component for first-launch setup"
```

---

### Task 6: Integrate WelcomeDialog into App.tsx

**Files:**
- Modify: `src/renderer/App.tsx:1-115`

**Step 1: Add WelcomeDialog rendering**

Import WelcomeDialog:

```typescript
import { WelcomeDialog } from './components/WelcomeDialog'
```

In the `App` component, add a handler and conditional rendering. After the `useSettings()` call, add:

```typescript
const handleSetupComplete = useCallback(
  (storagePath: string): void => {
    void updateSettings({ storagePath, setupCompleted: true })
  },
  [updateSettings]
)
```

Before the main return, add an early return for the welcome dialog:

```typescript
if (!settings.setupCompleted) {
  return (
    <div className={`layout-root theme-${settings.theme}`}>
      <WelcomeDialog
        defaultPath={settings.storagePath}
        onConfirm={handleSetupComplete}
      />
    </div>
  )
}
```

**Step 2: Run the app to verify**

Run: `npm run dev`
Expected: Welcome dialog appears on first launch. After clicking Continue, the main app appears.

**Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: show WelcomeDialog on first launch before main UI"
```

---

### Task 7: Add storagePath to SettingsModal

**Files:**
- Modify: `src/renderer/components/SettingsModal.tsx`

**Step 1: Add storagePath state and input**

Add state in SettingsModal:

```typescript
const [storagePath, setStoragePath] = useState(settings.storagePath)
```

Add to the useEffect reset:

```typescript
setStoragePath(settings.storagePath)
```

Add to handleSave:

```typescript
onSave({ defaultRuntime, theme, scrollbackLines, defaultBaseBranch, storagePath })
```

Pass to SettingsBody:

```typescript
<SettingsBody
  storagePath={storagePath}
  onStoragePathChange={setStoragePath}
  // ...existing props
/>
```

Add to SettingsBodyProps interface:

```typescript
storagePath: string
onStoragePathChange: (path: string) => void
```

Add the input field in SettingsBody, before the "Default Runtime" label:

```tsx
<label style={modalStyles.label}>
  Storage Directory
  <input
    type="text"
    value={storagePath}
    onChange={(e) => onStoragePathChange(e.target.value)}
    style={modalStyles.input}
    placeholder="~/.manifold"
  />
</label>
```

**Step 2: Run the app to verify**

Run: `npm run dev`
Expected: Settings modal shows the storage path field.

**Step 3: Commit**

```bash
git add src/renderer/components/SettingsModal.tsx
git commit -m "feat: add storagePath field to SettingsModal"
```

---

### Task 8: Update Existing Tests for New Defaults

**Files:**
- Modify: `src/main/settings-store.test.ts`
- Modify: `src/renderer/components/SettingsModal.test.tsx`

**Step 1: Update settings-store tests**

The existing tests compare against `DEFAULT_SETTINGS` which now includes `storagePath: ''` and `setupCompleted: false`. However, `SettingsStore.getSettings()` resolves empty storagePath to the homedir-based path. So tests checking `toEqual(DEFAULT_SETTINGS)` will fail because the stored value will have a resolved storagePath.

Update tests that check full equality. For example, the "returns defaults when config file does not exist" test:

```typescript
it('returns defaults when config file does not exist', () => {
  mockExistsSync.mockReturnValue(false)
  const store = new SettingsStore()
  const settings = store.getSettings()
  expect(settings.storagePath).toBe('/mock-home/.manifold')
  expect(settings.setupCompleted).toBe(false)
  expect(settings.defaultRuntime).toBe('claude')
  expect(settings.theme).toBe('dark')
})
```

Update the other tests similarly — replace `toEqual(DEFAULT_SETTINGS)` checks with individual field assertions or a helper.

**Step 2: Update SettingsModal tests if they reference ManifoldSettings shape**

Check `src/renderer/components/SettingsModal.test.tsx` and add the new fields to any test settings objects.

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All pass.

**Step 4: Commit**

```bash
git add src/main/settings-store.test.ts src/renderer/components/SettingsModal.test.tsx
git commit -m "test: update settings tests for storagePath and setupCompleted defaults"
```

---

### Task 9: Run Typecheck and Full Test Suite

**Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All pass.

**Step 3: Fix any remaining issues**

If there are type errors or failing tests, fix them.

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve remaining type and test issues for global storage"
```
