# Shell Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the shell panel from a raw terminal with a noisy powerline prompt into a refined, context-aware workspace terminal with a clean Manifold prompt, context bar, welcome message, better padding, and a settings toggle.

**Architecture:** Five changes layered bottom-up: (1) add `shellPrompt` boolean to settings type/defaults/UI, (2) thread settings into shell PTY creation and inject env vars + ZDOTDIR override for a clean zsh prompt, (3) write an ANSI welcome message to the PTY after spawn, (4) add a context bar component between the tab bar and terminal area, (5) increase terminal container padding.

**Tech Stack:** Electron, React, TypeScript, node-pty, xterm.js, zsh

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/shared/types.ts` | Modify | Add `shellPrompt` to `ManifoldSettings` |
| `src/shared/defaults.ts` | Modify | Set `shellPrompt: true` default |
| `src/main/session/session-resume.ts` | Modify | Accept options with env/welcome, inject ZDOTDIR + env vars, write welcome message |
| `src/main/session/shell-prompt.ts` | Create | Build env vars, ZDOTDIR temp dir, ANSI welcome message |
| `src/main/session/session-manager.ts` | Modify | Thread `shellPrompt` setting into `createShellSession` |
| `src/main/ipc/agent-handlers.ts` | Modify | Read `shellPrompt` from settings, pass to session manager |
| `src/renderer/components/terminal/ShellTabs.tsx` | Modify | Add context bar, accept new props |
| `src/renderer/components/terminal/ShellTabs.styles.ts` | Modify | Add context bar styles, increase terminal padding |
| `src/renderer/components/editor/dock-panels.tsx` | Modify | Pass `branchName` and `projectName` to ShellTabs |
| `src/renderer/components/editor/dock-panel-types.ts` | Modify | Add `branchName` and `projectName` to DockAppState |
| `src/renderer/components/modals/SettingsModal.tsx` | Modify | Add `shellPrompt` state + save |
| `src/renderer/components/modals/settings/SettingsModalBody.tsx` | Modify | Thread `shellPrompt` prop |
| `src/renderer/components/modals/settings/GeneralSettingsSection.tsx` | Modify | Add checkbox UI |
| `src/main/session/shell-prompt.test.ts` | Create | Tests for env var building, prompt script, welcome message |

---

### Task 1: Add `shellPrompt` setting to shared types and defaults

**Files:**
- Modify: `src/shared/types.ts:51-64`
- Modify: `src/shared/defaults.ts:3-40`

- [ ] **Step 1: Add `shellPrompt` to ManifoldSettings interface**

In `src/shared/types.ts`, add the field after `notificationSound`:

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
  uiMode: 'developer' | 'simple'
  memory?: import('./memory-types').MemorySettings
  search?: SearchSettings
  provisioning?: import('./provisioning-types').ProvisioningSettings
}
```

- [ ] **Step 2: Add default value**

In `src/shared/defaults.ts`, add after `notificationSound: true`:

```typescript
shellPrompt: true,
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in files that destructure/use ManifoldSettings (SettingsModal, etc.) — these will be fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts
git commit -m "feat(settings): add shellPrompt boolean to ManifoldSettings"
```

---

### Task 2: Create shell-prompt module

**Files:**
- Create: `src/main/session/shell-prompt.ts`
- Create: `src/main/session/shell-prompt.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/main/session/shell-prompt.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildShellEnv, buildWelcomeMessage, createManifoldZdotdir } from './shell-prompt'

describe('buildShellEnv', () => {
  it('sets MANIFOLD env vars from worktree path', () => {
    const env = buildShellEnv('/Users/me/.manifold/worktrees/myproject/manifold-oslo')
    expect(env.MANIFOLD_WORKTREE).toBe('1')
    expect(env.MANIFOLD_BRANCH).toBe('manifold/oslo')
    expect(env.MANIFOLD_AGENT_NAME).toBe('oslo')
  })

  it('handles paths without manifold- prefix gracefully', () => {
    const env = buildShellEnv('/some/random/path')
    expect(env.MANIFOLD_WORKTREE).toBe('1')
    expect(env.MANIFOLD_AGENT_NAME).toBe('path')
    expect(env.MANIFOLD_BRANCH).toBe('manifold/path')
  })
})

describe('buildWelcomeMessage', () => {
  it('returns ANSI-styled one-liner with branch and path', () => {
    const msg = buildWelcomeMessage('manifold/oslo', '/Users/me/.manifold/worktrees/myproject/manifold-oslo')
    expect(msg).toContain('manifold/oslo')
    expect(msg).toContain('manifold-oslo')
    expect(msg).toMatch(/\x1b\[/) // contains ANSI escape codes
    expect(msg).toEndWith('\r\n')
  })
})

describe('createManifoldZdotdir', () => {
  let zdotdir: string | null = null

  afterEach(() => {
    if (zdotdir) {
      fs.rmSync(zdotdir, { recursive: true, force: true })
      zdotdir = null
    }
  })

  it('creates a temp directory with a .zshrc that sets PROMPT', () => {
    zdotdir = createManifoldZdotdir('oslo')
    expect(fs.existsSync(zdotdir)).toBe(true)
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('ZDOTDIR_ORIG')
    expect(rc).toContain('oslo')
    expect(rc).toContain('PROMPT=')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/session/shell-prompt.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement shell-prompt module**

Create `src/main/session/shell-prompt.ts`:

```typescript
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

/**
 * Extract agent name from a worktree path.
 * Worktree dirs are named `manifold-<name>`, e.g. `manifold-oslo`.
 */
function agentNameFromCwd(cwd: string): string {
  const base = path.basename(cwd)
  return base.startsWith('manifold-') ? base.slice('manifold-'.length) : base
}

/**
 * Build environment variables to inject into a Manifold worktree shell.
 */
export function buildShellEnv(cwd: string): Record<string, string> {
  const agentName = agentNameFromCwd(cwd)
  return {
    MANIFOLD_WORKTREE: '1',
    MANIFOLD_AGENT_NAME: agentName,
    MANIFOLD_BRANCH: `manifold/${agentName}`,
  }
}

/**
 * Build an ANSI-styled welcome line printed once when the shell spawns.
 * Uses dim gray so it's informational but doesn't dominate.
 */
export function buildWelcomeMessage(branch: string, cwd: string): string {
  const dim = '\x1b[2m'
  const cyan = '\x1b[36m'
  const reset = '\x1b[0m'
  // Shorten home directory to ~
  const home = os.homedir()
  const displayPath = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd
  return `${dim}●  ${cyan}${branch}${dim}  ·  ${displayPath}${reset}\r\n`
}

/**
 * Create a temporary ZDOTDIR with a .zshrc that:
 * 1. Restores the user's real ZDOTDIR so their aliases/PATH still load
 * 2. Sources the user's .zshrc
 * 3. Overrides PROMPT with a clean Manifold prompt
 */
export function createManifoldZdotdir(agentName: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-shell-'))
  const userZdotdir = process.env.ZDOTDIR || os.homedir()

  // The .zshrc sources the user's config first (for PATH, aliases, etc.)
  // then overrides just the prompt. The precmd cleanup ensures we don't
  // leave stale hooks if the user's .zshrc sets precmd.
  const rc = `# Manifold shell prompt — sources user config then overrides PROMPT
ZDOTDIR_ORIG="${userZdotdir}"

# Source user's zshrc for PATH, aliases, functions, completions
if [[ -f "${userZdotdir}/.zshrc" ]]; then
  ZDOTDIR="${userZdotdir}"
  source "${userZdotdir}/.zshrc"
fi

# Override prompt with clean Manifold style
PROMPT='%F{cyan}${agentName}%f %F{white}❯%f '
RPROMPT=''
`

  fs.writeFileSync(path.join(dir, '.zshrc'), rc, 'utf-8')
  // Create empty .zshenv to prevent global /etc/zshenv from loading ZDOTDIR twice
  fs.writeFileSync(path.join(dir, '.zshenv'), '', 'utf-8')

  return dir
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/shell-prompt.test.ts`
Expected: PASS — all 3 tests green

- [ ] **Step 5: Commit**

```bash
git add src/main/session/shell-prompt.ts src/main/session/shell-prompt.test.ts
git commit -m "feat(shell): add shell-prompt module for env vars, welcome message, ZDOTDIR"
```

---

### Task 3: Thread `shellPrompt` setting into shell PTY creation

**Files:**
- Modify: `src/main/session/session-resume.ts:60-88`
- Modify: `src/main/session/session-manager.ts:291-293`
- Modify: `src/main/ipc/agent-handlers.ts:127-129`

- [ ] **Step 1: Update `createShellPtySession` to accept options**

In `src/main/session/session-resume.ts`, add the import and update the function:

```typescript
import { buildShellEnv, buildWelcomeMessage, createManifoldZdotdir } from './shell-prompt'
```

Replace the `createShellPtySession` function (lines 60-88):

```typescript
export function createShellPtySession(
  cwd: string,
  ptyPool: PtyPool,
  streamWirer: SessionStreamWirer,
  sessions: Map<string, InternalSession>,
  options?: { shellPrompt?: boolean },
): { sessionId: string } {
  const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh')
  const useManifoldPrompt = options?.shellPrompt ?? false
  const isZsh = shell.endsWith('/zsh') || shell === 'zsh'

  let env: Record<string, string> | undefined
  let zdotdir: string | undefined

  if (useManifoldPrompt) {
    const shellEnv = buildShellEnv(cwd)
    env = { ...shellEnv }

    if (isZsh) {
      const agentName = shellEnv.MANIFOLD_AGENT_NAME
      zdotdir = createManifoldZdotdir(agentName)
      env.ZDOTDIR = zdotdir
    }
  }

  const ptyHandle = ptyPool.spawn(shell, ['-il'], { cwd, env })
  const id = uuidv4()

  if (useManifoldPrompt) {
    const branch = env?.MANIFOLD_BRANCH ?? 'manifold'
    const welcome = buildWelcomeMessage(branch, cwd)
    // Small delay to let the shell initialize before printing
    setTimeout(() => {
      try { ptyPool.write(ptyHandle.id, `printf '${welcome.replace(/'/g, "'\\''")}'\\n`) } catch { /* PTY may have exited */ }
    }, 300)
  }

  const session: InternalSession = {
    id,
    projectId: '',
    runtimeId: '__shell__',
    branchName: '',
    worktreePath: cwd,
    status: 'running',
    pid: ptyHandle.pid,
    ptyId: ptyHandle.id,
    outputBuffer: '',
    additionalDirs: [],
  }

  sessions.set(id, session)
  streamWirer.wireOutputStreaming(ptyHandle.id, session)
  streamWirer.wireExitHandling(ptyHandle.id, session)

  return { sessionId: id }
}
```

- [ ] **Step 2: Update SessionManager.createShellSession**

In `src/main/session/session-manager.ts`, update `createShellSession` (around line 291):

```typescript
createShellSession(cwd: string, options?: { shellPrompt?: boolean }): { sessionId: string } {
  return createShellPtySession(cwd, this.ptyPool, this.streamWirer, this.sessions, options)
}
```

- [ ] **Step 3: Update IPC handler to read settings**

In `src/main/ipc/agent-handlers.ts`, update the `shell:create` handler (around line 127):

```typescript
ipcMain.handle('shell:create', (_event, cwd: string) => {
  const settings = deps.settingsStore.getSettings()
  return sessionManager.createShellSession(cwd, { shellPrompt: settings.shellPrompt })
})
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (or errors only from settings UI not yet updated)

- [ ] **Step 5: Commit**

```bash
git add src/main/session/session-resume.ts src/main/session/session-manager.ts src/main/ipc/agent-handlers.ts
git commit -m "feat(shell): inject Manifold prompt env vars and welcome message into worktree shells"
```

---

### Task 4: Add settings toggle UI

**Files:**
- Modify: `src/renderer/components/modals/SettingsModal.tsx`
- Modify: `src/renderer/components/modals/settings/SettingsModalBody.tsx`
- Modify: `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`

- [ ] **Step 1: Add state to SettingsModal**

In `src/renderer/components/modals/SettingsModal.tsx`:

Add state declaration after `notificationSound` state (around line 24):

```typescript
const [shellPrompt, setShellPrompt] = useState(settings.shellPrompt)
```

In the `useEffect` that syncs state when modal opens (around line 48), add:

```typescript
setShellPrompt(settings.shellPrompt)
```

In `handleSave` (around line 65), add `shellPrompt` to the save object:

```typescript
onSave({
  defaultRuntime,
  theme,
  scrollbackLines,
  terminalFontFamily,
  defaultBaseBranch,
  storagePath,
  notificationSound,
  shellPrompt,
  uiMode,
  search: { ai: searchAiSettings },
  provisioning: { provisioners },
})
```

Pass to `SettingsModalBody`:

```typescript
shellPrompt={shellPrompt}
onShellPromptChange={setShellPrompt}
```

- [ ] **Step 2: Thread through SettingsModalBody**

In `src/renderer/components/modals/settings/SettingsModalBody.tsx`:

Add to the `Props` interface:

```typescript
shellPrompt: boolean
onShellPromptChange: (enabled: boolean) => void
```

The `GeneralSettingsSection` already receives `{...props}`, so it will pick up the new props automatically.

- [ ] **Step 3: Add checkbox to GeneralSettingsSection**

In `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`:

Add to the `Props` interface:

```typescript
shellPrompt: boolean
onShellPromptChange: (enabled: boolean) => void
```

Add a checkbox in the "Appearance And Terminal" `SectionCard`, after the notification sound checkbox (around line 106):

```tsx
<label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
  <input type="checkbox" checked={props.shellPrompt} onChange={(event) => props.onShellPromptChange(event.target.checked)} style={modalStyles.checkboxInput} />
  Use Manifold prompt in worktree shells
  <span style={modalStyles.helpText}>Shows a clean minimal prompt instead of your shell theme. Disable to keep your own prompt.</span>
</label>
```

- [ ] **Step 4: Run typecheck and verify**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/SettingsModal.tsx src/renderer/components/modals/settings/SettingsModalBody.tsx src/renderer/components/modals/settings/GeneralSettingsSection.tsx
git commit -m "feat(settings): add shell prompt toggle to settings UI"
```

---

### Task 5: Add context bar to ShellTabs

**Files:**
- Modify: `src/renderer/components/terminal/ShellTabs.tsx`
- Modify: `src/renderer/components/terminal/ShellTabs.styles.ts`
- Modify: `src/renderer/components/editor/dock-panels.tsx:199-211`
- Modify: `src/renderer/components/editor/dock-panel-types.ts`

- [ ] **Step 1: Add context bar styles**

In `src/renderer/components/terminal/ShellTabs.styles.ts`, add to `shellTabStyles`:

```typescript
contextBar: {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 8px',
  fontSize: 'var(--type-ui-micro)',
  color: 'var(--text-muted)',
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.02em',
  overflow: 'hidden',
  whiteSpace: 'nowrap' as const,
  textOverflow: 'ellipsis',
},
contextSeparator: {
  color: 'var(--text-muted)',
  opacity: 0.4,
},
```

- [ ] **Step 2: Increase terminal padding**

In `src/renderer/components/terminal/ShellTabs.styles.ts`, update `terminalContainer`:

```typescript
terminalContainer: {
  width: '100%',
  height: '100%',
  padding: '8px',
  boxSizing: 'border-box' as const,
},
```

- [ ] **Step 3: Add props and context bar to ShellTabs component**

In `src/renderer/components/terminal/ShellTabs.tsx`, update the `ShellTabsProps` interface:

```typescript
interface ShellTabsProps {
  worktreeSessionId: string | null
  projectSessionId: string | null
  worktreeCwd: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
  branchName?: string | null
  projectName?: string | null
}
```

Update the `ShellTabs` function signature to destructure the new props:

```typescript
export function ShellTabs({
  worktreeSessionId, projectSessionId, worktreeCwd,
  scrollbackLines, terminalFontFamily, xtermTheme,
  branchName, projectName,
}: ShellTabsProps): React.JSX.Element {
```

Add a `ContextBar` component inside the same file (before the `ShellTabs` export):

```tsx
function ContextBar({ projectName, branchName, cwd }: {
  projectName?: string | null; branchName?: string | null; cwd?: string | null
}): React.JSX.Element | null {
  if (!cwd) return null
  const sep = <span style={styles.contextSeparator}>›</span>
  // Shorten cwd: show last two path segments
  const segments = cwd.split('/')
  const shortPath = segments.length > 2 ? segments.slice(-2).join('/') : cwd

  return (
    <div style={styles.contextBar}>
      {projectName && <><span>{projectName}</span>{sep}</>}
      {branchName && <><span>{branchName}</span>{sep}</>}
      <span style={{ opacity: 0.6 }}>{shortPath}</span>
    </div>
  )
}
```

In the `ShellTabs` return JSX, add the `ContextBar` between the tab bar and terminal area:

```tsx
return (
  <div style={styles.wrapper}>
    <ShellTabBar ... />
    {effectiveTab !== 'project' && (
      <ContextBar projectName={projectName} branchName={branchName} cwd={worktreeCwd} />
    )}
    <div style={styles.terminalArea}>
      ...
    </div>
  </div>
)
```

- [ ] **Step 4: Add branchName and projectName to DockAppState**

In `src/renderer/components/editor/dock-panel-types.ts`, add to the Shell section (around line 59):

```typescript
// Shell
worktreeShellSessionId: string | null
projectShellSessionId: string | null
worktreeCwd: string | null
shellBranchName: string | null
shellProjectName: string | null
```

- [ ] **Step 5: Pass new props in ShellPanel**

In `src/renderer/components/editor/dock-panels.tsx`, update `ShellPanel` (around line 199):

```tsx
function ShellPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <ShellTabs
      worktreeSessionId={s.worktreeShellSessionId}
      projectSessionId={s.projectShellSessionId}
      worktreeCwd={s.worktreeCwd}
      scrollbackLines={s.scrollbackLines}
      terminalFontFamily={s.terminalFontFamily}
      xtermTheme={s.xtermTheme}
      branchName={s.shellBranchName}
      projectName={s.shellProjectName}
    />
  )
}
```

- [ ] **Step 6: Wire branchName and projectName into DockAppState provider**

Find where `DockStateContext.Provider` is created (likely in `App.tsx` or the dock panel setup) and add `shellBranchName` (from the active session's branch) and `shellProjectName` (from the active project's name) to the state object. These values are already available in the app state — they just need to be threaded through.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/terminal/ShellTabs.tsx src/renderer/components/terminal/ShellTabs.styles.ts src/renderer/components/editor/dock-panels.tsx src/renderer/components/editor/dock-panel-types.ts
git commit -m "feat(shell): add context bar and increase terminal padding"
```

---

### Task 6: Final integration and verification

**Files:**
- All modified files

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS with zero errors

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass, including new shell-prompt tests

- [ ] **Step 3: Manual verification**

Run: `npm run dev`

Verify:
1. New worktree shell shows clean prompt: `tromso ❯ `
2. Welcome message appears once on shell spawn: `● manifold/tromso · ~/.manifold/worktrees/...`
3. Context bar visible above terminal: `project-name › manifold/tromso › manifold-tromso`
4. Context bar hidden on Repository tab
5. Terminal has more padding (8px vs 4px)
6. Settings modal has "Use Manifold prompt in worktree shells" checkbox
7. Unchecking it and opening a new shell tab shows the user's native prompt
8. User's aliases, PATH, and completions still work with Manifold prompt enabled

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(shell): shell improvements — prompt, context bar, welcome, padding, settings toggle"
```
