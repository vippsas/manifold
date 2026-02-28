# Main Process Folder Grouping — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the flat `src/main/` directory (58 files) into domain-based subfolders for better navigability.

**Architecture:** Move files into 6 subfolders (`session/`, `git/`, `store/`, `agent/`, `fs/`, `app/`) and keep the existing `ipc/` subfolder. Each subfolder gets a barrel `index.ts` that re-exports all public symbols. All internal imports update to use relative paths to the new locations. The IPC handlers (`ipc/types.ts` and handler files) update their `../` imports to the new deeper paths. No config changes needed — `tsconfig.node.json` already uses `src/main/**/*.ts` glob, and `electron.vite.config.ts` entry point moves into `app/`.

**Tech Stack:** TypeScript, Electron (main process), vitest

**Baseline:** 33 test files, 440 tests passing. No typecheck errors.

---

## File Mapping

### `src/main/session/`
| File | From |
|---|---|
| `session-manager.ts` + `.test.ts` | `src/main/session-manager.ts` |
| `session-creator.ts` | `src/main/session-creator.ts` |
| `session-discovery.ts` | `src/main/session-discovery.ts` |
| `session-stream-wirer.ts` | `src/main/session-stream-wirer.ts` |
| `session-teardown.ts` | `src/main/session-teardown.ts` |
| `session-types.ts` | `src/main/session-types.ts` |
| `index.ts` | New barrel file |

### `src/main/git/`
| File | From |
|---|---|
| `git-operations.ts` + `.test.ts` | `src/main/git-operations.ts` |
| `git-exec.ts` | `src/main/git-exec.ts` |
| `diff-provider.ts` + `.test.ts` | `src/main/diff-provider.ts` |
| `pr-creator.ts` + `.test.ts` | `src/main/pr-creator.ts` |
| `branch-namer.ts` + `.test.ts` | `src/main/branch-namer.ts` |
| `branch-checkout-manager.ts` + `.test.ts` | `src/main/branch-checkout-manager.ts` |
| `worktree-manager.ts` + `.test.ts` | `src/main/worktree-manager.ts` |
| `worktree-meta.ts` | `src/main/worktree-meta.ts` |
| `index.ts` | New barrel file |

### `src/main/store/`
| File | From |
|---|---|
| `settings-store.ts` + `.test.ts` | `src/main/settings-store.ts` |
| `shell-tab-store.ts` + `.test.ts` | `src/main/shell-tab-store.ts` |
| `view-state-store.ts` + `.test.ts` | `src/main/view-state-store.ts` |
| `dock-layout-store.ts` | `src/main/dock-layout-store.ts` |
| `project-registry.ts` + `.test.ts` | `src/main/project-registry.ts` |
| `index.ts` | New barrel file |

### `src/main/agent/`
| File | From |
|---|---|
| `pty-pool.ts` + `.test.ts` | `src/main/pty-pool.ts` |
| `status-detector.ts` + `.test.ts` | `src/main/status-detector.ts` |
| `runtimes.ts` + `.test.ts` | `src/main/runtimes.ts` |
| `chat-adapter.ts` + `.test.ts` | `src/main/chat-adapter.ts` |
| `ollama-models.ts` + `.test.ts` | `src/main/ollama-models.ts` |
| `index.ts` | New barrel file |

### `src/main/fs/`
| File | From |
|---|---|
| `file-watcher.ts` + `.test.ts` + `-conflicts.test.ts` | `src/main/file-watcher.ts` |
| `add-dir-detector.ts` + `.test.ts` | `src/main/add-dir-detector.ts` |
| `url-detector.ts` + `.test.ts` | `src/main/url-detector.ts` |
| `index.ts` | New barrel file |

### `src/main/app/`
| File | From |
|---|---|
| `index.ts` | `src/main/index.ts` (entry point) |
| `ipc-handlers.ts` | `src/main/ipc-handlers.ts` |
| `app-menu.ts` | `src/main/app-menu.ts` |
| `window-factory.ts` | `src/main/window-factory.ts` |
| `auto-updater.ts` | `src/main/auto-updater.ts` |
| `mode-switcher.ts` | `src/main/mode-switcher.ts` |
| `shell-path.ts` | `src/main/shell-path.ts` |
| `debug-log.ts` | `src/main/debug-log.ts` |
| `dev-server-manager.ts` | `src/main/dev-server-manager.ts` |
| `deployment-manager.ts` + `.test.ts` | `src/main/deployment-manager.ts` |

### `src/main/ipc/` — unchanged
Keep as-is. Update `../` import paths to point to new subfolder locations.

---

## Cross-Reference: Import Path Changes

### IPC types.ts (`src/main/ipc/types.ts`) — 13 imports change
| Old | New |
|---|---|
| `../settings-store` | `../store/settings-store` |
| `../project-registry` | `../store/project-registry` |
| `../session-manager` | `../session/session-manager` |
| `../file-watcher` | `../fs/file-watcher` |
| `../diff-provider` | `../git/diff-provider` |
| `../pr-creator` | `../git/pr-creator` |
| `../view-state-store` | `../store/view-state-store` |
| `../shell-tab-store` | `../store/shell-tab-store` |
| `../git-operations` | `../git/git-operations` |
| `../branch-checkout-manager` | `../git/branch-checkout-manager` |
| `../dock-layout-store` | `../store/dock-layout-store` |
| `../chat-adapter` | `../agent/chat-adapter` |
| `../deployment-manager` | `../app/deployment-manager` |

### IPC handler files — 6 imports change
| File | Old | New |
|---|---|---|
| `agent-handlers.ts` | `../branch-namer` | `../git/branch-namer` |
| `git-handlers.ts` | `../runtimes` | `../agent/runtimes` |
| `project-handlers.ts` | `../runtimes` | `../agent/runtimes` |
| `settings-handlers.ts` | `../shell-tab-store` | `../store/shell-tab-store` |
| `settings-handlers.ts` | `../runtimes` | `../agent/runtimes` |
| `settings-handlers.ts` | `../ollama-models` | `../agent/ollama-models` |

### Entry point change
`electron.vite.config.ts` must update: `src/main/index.ts` → `src/main/app/index.ts`

---

## Tasks

### Task 1: Create subfolder structure and move files

**Files:**
- Create: `src/main/session/`, `src/main/git/`, `src/main/store/`, `src/main/agent/`, `src/main/fs/`, `src/main/app/`
- Move: All files listed in the File Mapping above

**Step 1: Create directories**

```bash
mkdir -p src/main/{session,git,store,agent,fs,app}
```

**Step 2: Move session files**

```bash
cd src/main
git mv session-manager.ts session-manager.test.ts session/
git mv session-creator.ts session-discovery.ts session-stream-wirer.ts session-teardown.ts session-types.ts session/
```

**Step 3: Move git files**

```bash
cd src/main
git mv git-operations.ts git-operations.test.ts git/
git mv git-exec.ts git/
git mv diff-provider.ts diff-provider.test.ts git/
git mv pr-creator.ts pr-creator.test.ts git/
git mv branch-namer.ts branch-namer.test.ts git/
git mv branch-checkout-manager.ts branch-checkout-manager.test.ts git/
git mv worktree-manager.ts worktree-manager.test.ts git/
git mv worktree-meta.ts git/
```

**Step 4: Move store files**

```bash
cd src/main
git mv settings-store.ts settings-store.test.ts store/
git mv shell-tab-store.ts shell-tab-store.test.ts store/
git mv view-state-store.ts view-state-store.test.ts store/
git mv dock-layout-store.ts store/
git mv project-registry.ts project-registry.test.ts store/
```

**Step 5: Move agent files**

```bash
cd src/main
git mv pty-pool.ts pty-pool.test.ts agent/
git mv status-detector.ts status-detector.test.ts agent/
git mv runtimes.ts runtimes.test.ts agent/
git mv chat-adapter.ts chat-adapter.test.ts agent/
git mv ollama-models.ts ollama-models.test.ts agent/
```

**Step 6: Move fs files**

```bash
cd src/main
git mv file-watcher.ts file-watcher.test.ts file-watcher-conflicts.test.ts fs/
git mv add-dir-detector.ts add-dir-detector.test.ts fs/
git mv url-detector.ts url-detector.test.ts fs/
```

**Step 7: Move app files**

```bash
cd src/main
git mv index.ts app/
git mv ipc-handlers.ts app/
git mv app-menu.ts app/
git mv window-factory.ts app/
git mv auto-updater.ts app/
git mv mode-switcher.ts app/
git mv shell-path.ts app/
git mv debug-log.ts app/
git mv dev-server-manager.ts app/
git mv deployment-manager.ts deployment-manager.test.ts app/
```

**Step 8: Commit the moves (before fixing imports)**

```bash
git add -A
git commit -m "refactor: move src/main files into domain subfolders (broken imports)"
```

This commit preserves git blame history through the renames. Imports are intentionally broken — fixed in the next task.

---

### Task 2: Fix all intra-main import paths

After the move, every `./foo` or `../foo` import within `src/main/` files needs updating to reflect the new folder structure. This is the bulk of the work.

**Strategy:** Process one subfolder at a time. For each file, update its imports from sibling files (same folder → `./`) and cross-folder files (different folder → `../otherfolder/`).

**Key rule for each file:** If the imported file is now in the SAME subfolder, use `./filename`. If it's in a DIFFERENT subfolder, use `../subfolder/filename`.

#### 2a: Fix `session/` imports

Each file in `session/` imports from other session files (now `./`) and from other folders (now `../git/`, `../agent/`, `../store/`, `../fs/`, `../app/`).

**Files to fix:** `session-manager.ts`, `session-creator.ts`, `session-discovery.ts`, `session-stream-wirer.ts`, `session-teardown.ts`

(`session-types.ts` has no intra-main imports — skip.)

For example, `session-manager.ts` currently has:
- `./session-creator` → stays `./session-creator` (same folder)
- `./session-discovery` → stays `./session-discovery`
- `./session-stream-wirer` → stays `./session-stream-wirer`
- `./session-teardown` → stays `./session-teardown`
- `./session-types` → stays `./session-types`
- `./branch-checkout-manager` → `../git/branch-checkout-manager`
- `./chat-adapter` → `../agent/chat-adapter`
- `./dev-server-manager` → `../app/dev-server-manager`
- `./file-watcher` → `../fs/file-watcher`
- `./project-registry` → `../store/project-registry`
- `./pty-pool` → `../agent/pty-pool`
- `./runtimes` → `../agent/runtimes`
- `./worktree-manager` → `../git/worktree-manager`
- `./worktree-meta` → `../git/worktree-meta`

Apply the same pattern to `session-creator.ts`, `session-discovery.ts`, `session-stream-wirer.ts`, `session-teardown.ts`. Each import's new path is determined by which subfolder the target file landed in.

#### 2b: Fix `git/` imports

**Files to fix:** `worktree-manager.ts`, `branch-checkout-manager.ts`, `branch-namer.ts`, `diff-provider.ts`

(`git-exec.ts`, `git-operations.ts`, `pr-creator.ts`, `worktree-meta.ts` have no intra-main imports.)

Example: `worktree-manager.ts` currently has:
- `./branch-namer` → stays `./branch-namer` (same folder)
- `./git-exec` → stays `./git-exec`
- `./worktree-meta` → stays `./worktree-meta`

Example: `branch-checkout-manager.ts`:
- `./git-exec` → stays `./git-exec` (same folder)

Example: `branch-namer.ts`:
- `./git-exec` → stays `./git-exec` (same folder)

Example: `diff-provider.ts`:
- `./git-exec` → stays `./git-exec` (same folder)

All git/ files only import from each other — no cross-folder changes needed here.

#### 2c: Fix `store/` imports

**Files to fix:** `project-registry.ts`

(`settings-store.ts`, `shell-tab-store.ts`, `view-state-store.ts`, `dock-layout-store.ts` have no intra-main imports.)

`project-registry.ts`:
- `./git-exec` → `../git/git-exec`

#### 2d: Fix `agent/` imports

**Files to fix:** `pty-pool.ts`, `status-detector.ts`

(`chat-adapter.ts`, `runtimes.ts`, `ollama-models.ts` have no intra-main imports.)

`pty-pool.ts`:
- `./debug-log` → `../app/debug-log`

`status-detector.ts`:
- `./runtimes` → stays `./runtimes` (same folder)

#### 2e: Fix `fs/` imports

No files in `fs/` have intra-main imports. Nothing to fix.

#### 2f: Fix `app/` imports

**Files to fix:** `index.ts`, `window-factory.ts`, `ipc-handlers.ts`, `mode-switcher.ts`, `auto-updater.ts`, `shell-path.ts`, `dev-server-manager.ts`

`index.ts` (entry point) — all imports change from `./` to `../subfolder/`:
- `./shell-path` → stays `./shell-path` (same folder)
- `./settings-store` → `../store/settings-store`
- `./project-registry` → `../store/project-registry`
- `./worktree-manager` → `../git/worktree-manager`
- `./pty-pool` → `../agent/pty-pool`
- `./session-manager` → `../session/session-manager`
- `./file-watcher` → `../fs/file-watcher`
- `./diff-provider` → `../git/diff-provider`
- `./pr-creator` → `../git/pr-creator`
- `./view-state-store` → `../store/view-state-store`
- `./shell-tab-store` → `../store/shell-tab-store`
- `./git-operations` → `../git/git-operations`
- `./branch-checkout-manager` → `../git/branch-checkout-manager`
- `./dock-layout-store` → `../store/dock-layout-store`
- `./chat-adapter` → `../agent/chat-adapter`
- `./deployment-manager` → stays `./deployment-manager` (same folder)
- `./auto-updater` → stays `./auto-updater`
- `./mode-switcher` → stays `./mode-switcher`
- `./window-factory` → stays `./window-factory`

`window-factory.ts`:
- `./app-menu` → stays `./app-menu` (same folder)
- `./debug-log` → stays `./debug-log`
- `./ipc-handlers` → stays `./ipc-handlers`

`ipc-handlers.ts`:
- imports from `./ipc/` → `../ipc/` (now sibling folder)

`mode-switcher.ts`:
- `./debug-log` → stays `./debug-log` (same folder)
- `./session-manager` → `../session/session-manager`
- `./settings-store` → `../store/settings-store`

`auto-updater.ts`:
- `./debug-log` → stays `./debug-log` (same folder)

`shell-path.ts`:
- `./debug-log` → stays `./debug-log` (same folder)

`dev-server-manager.ts`:
- `./chat-adapter` → `../agent/chat-adapter`
- `./debug-log` → stays `./debug-log` (same folder)
- `./git-exec` → `../git/git-exec`
- `./project-registry` → `../store/project-registry`
- `./pty-pool` → `../agent/pty-pool`
- `./runtimes` → `../agent/runtimes`
- `./session-stream-wirer` → `../session/session-stream-wirer`
- `./session-types` → `../session/session-types`
- `./url-detector` → `../fs/url-detector`

#### 2g: Fix `ipc/` imports (existing subfolder)

**Files to fix:** `types.ts`, `agent-handlers.ts`, `git-handlers.ts`, `project-handlers.ts`, `settings-handlers.ts`

All `../` imports in these files must change from `../filename` to `../subfolder/filename`. See the Cross-Reference table above.

For `ipc-handlers.ts` (now in `app/`), its `./ipc/agent-handlers` import becomes `../ipc/agent-handlers`.

#### 2h: Fix test file imports

Test files that mock `../` paths or import from siblings need updating. Review each `.test.ts` file — if it uses `vi.mock('./foo')` the mock path must match the new relative location.

**Step: Commit**

```bash
git add -A
git commit -m "refactor: update all import paths for main/ subfolder structure"
```

---

### Task 3: Update electron.vite.config.ts entry point

**File:** `electron.vite.config.ts`

**Step 1: Update main entry**

Change:
```typescript
input: resolve(__dirname, 'src/main/index.ts')
```
To:
```typescript
input: resolve(__dirname, 'src/main/app/index.ts')
```

**Step 2: Commit**

```bash
git add electron.vite.config.ts
git commit -m "refactor: update main entry point to src/main/app/index.ts"
```

---

### Task 4: Create barrel files (optional, for cleaner cross-folder imports)

Create `index.ts` barrel files in each subfolder that re-export all public symbols. This allows other subfolders to import from `../session` instead of `../session/session-manager`.

**Note:** This is optional. The plan works without barrel files — direct file imports are fine and more explicit. Skip this task if you prefer direct imports.

---

### Task 5: Verify everything works

**Step 1: Run typecheck**

```bash
npx tsc --noEmit -p tsconfig.node.json
```

Expected: 0 errors

**Step 2: Run tests**

```bash
./node_modules/.bin/vitest run
```

Expected: 33 test files, 440 tests passing

**Step 3: Run dev mode smoke test**

```bash
npm run dev
```

Expected: App launches without errors

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "refactor: fix remaining import issues from folder grouping"
```

---

## Verification Checklist

- [ ] All 58 files moved to correct subfolders
- [ ] All intra-main imports updated
- [ ] All `ipc/` handler imports updated
- [ ] `electron.vite.config.ts` entry point updated
- [ ] `npx tsc --noEmit -p tsconfig.node.json` passes
- [ ] 440 tests pass
- [ ] `npm run dev` launches successfully
- [ ] No files left in `src/main/` root (except subfolders and `ipc/`)
- [ ] Git history preserved via `git mv`
