# Simple View Vercel Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable non-developers in Simple View to deploy their apps to Vercel with one click, handling CLI installation and GitHub-based authentication automatically.

**Architecture:** Hybrid approach — new `VercelHealthCheck` module in main process handles CLI detection/install/auth. The existing agent PTY handles the actual `vercel deploy --prod` command. StatusDetector is extended to capture Vercel production URLs from agent output. A new `DeployModal` component guides first-time setup, and `StatusBanner` gains deploy lifecycle states.

**Tech Stack:** Electron IPC, `execFile` (node:child_process — same pattern as `PrCreator`), React state + modal component, regex pattern matching in StatusDetector.

**Spec:** `docs/superpowers/designs/2026-03-28-simple-view-vercel-deploy-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/main/deploy/vercel-health-check.ts` | CLI detection, installation, and authentication |
| Create | `src/main/deploy/vercel-health-check.test.ts` | Unit tests for VercelHealthCheck |
| Create | `src/renderer-simple/components/DeployModal.tsx` | Setup modal (CLI install + GitHub auth) |
| Create | `src/renderer-simple/components/DeployModal.styles.ts` | Styles for DeployModal |
| Create | `src/renderer-simple/hooks/useDeploy.ts` | Deploy state management + IPC calls |
| Modify | `src/shared/simple-types.ts:29-34` | Add VercelHealth interface |
| Modify | `src/main/ipc/simple-handlers.ts:27-33` | Replace deploy stubs with real handlers |
| Modify | `src/main/ipc/types.ts:18-34` | Add VercelHealthCheck to IpcDependencies |
| Modify | `src/main/app/index.ts` | Instantiate VercelHealthCheck |
| Modify | `src/main/agent/status-detector.ts` | Add Vercel URL detection function |
| Modify | `src/preload/simple.ts:3-36` | Add new IPC channels |
| Modify | `src/renderer-simple/components/StatusBanner.tsx` | Add deploying/live/failed states + liveUrl display |
| Modify | `src/renderer-simple/components/StatusBanner.styles.ts` | Add styles for new deploy states |
| Modify | `src/renderer-simple/components/AppView.tsx:13-25` | Add liveUrl + deployStatus props |
| Modify | `src/renderer-simple/App.tsx:71-119` | Wire deploy flow in AppViewWrapper |

---

### Task 1: VercelHealthCheck Module

**Files:**
- Create: `src/main/deploy/vercel-health-check.ts`
- Create: `src/main/deploy/vercel-health-check.test.ts`

- [ ] **Step 1: Write failing tests for VercelHealthCheck**

Create `src/main/deploy/vercel-health-check.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VercelHealthCheck } from './vercel-health-check'

// Mock node:child_process execFile
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}))

import { execFile } from 'node:child_process'
const mockExecFile = vi.mocked(execFile)

describe('VercelHealthCheck', () => {
  let healthCheck: VercelHealthCheck

  beforeEach(() => {
    healthCheck = new VercelHealthCheck()
    vi.clearAllMocks()
  })

  describe('isCliInstalled', () => {
    it('returns true when vercel --version succeeds', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'vercel 33.0.0', stderr: '' } as never)
      expect(await healthCheck.isCliInstalled()).toBe(true)
    })

    it('returns false when vercel --version fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('command not found'))
      expect(await healthCheck.isCliInstalled()).toBe(false)
    })
  })

  describe('isAuthenticated', () => {
    it('returns true when vercel whoami succeeds', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'username', stderr: '' } as never)
      expect(await healthCheck.isAuthenticated()).toBe(true)
    })

    it('returns false when vercel whoami fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('not authenticated'))
      expect(await healthCheck.isAuthenticated()).toBe(false)
    })
  })

  describe('installCli', () => {
    it('runs npm install -g vercel', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' } as never)
      await healthCheck.installCli()
      expect(mockExecFile).toHaveBeenCalledWith('npm', ['install', '-g', 'vercel'], expect.any(Object))
    })

    it('throws on installation failure', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('EACCES'))
      await expect(healthCheck.installCli()).rejects.toThrow()
    })
  })

  describe('getHealthStatus', () => {
    it('returns ready when CLI installed and authenticated', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'vercel 33.0.0', stderr: '' } as never)
      mockExecFile.mockResolvedValueOnce({ stdout: 'username', stderr: '' } as never)
      const status = await healthCheck.getHealthStatus()
      expect(status).toEqual({ cliInstalled: true, authenticated: true })
    })

    it('returns not-installed when CLI missing', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('command not found'))
      const status = await healthCheck.getHealthStatus()
      expect(status).toEqual({ cliInstalled: false, authenticated: false })
    })

    it('returns not-authenticated when CLI present but not logged in', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'vercel 33.0.0', stderr: '' } as never)
      mockExecFile.mockRejectedValueOnce(new Error('not authenticated'))
      const status = await healthCheck.getHealthStatus()
      expect(status).toEqual({ cliInstalled: true, authenticated: false })
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/deploy/vercel-health-check.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement VercelHealthCheck**

Create `src/main/deploy/vercel-health-check.ts`. Uses `execFile` (not `exec`) following the same pattern as `PrCreator` (`src/main/git/pr-creator.ts`):

```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VercelHealth } from '../../shared/simple-types'

const execFileAsync = promisify(execFile)

export class VercelHealthCheck {
  async isCliInstalled(): Promise<boolean> {
    try {
      await execFileAsync('vercel', ['--version'])
      return true
    } catch {
      return false
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('vercel', ['whoami'])
      return stdout.trim().length > 0
    } catch {
      return false
    }
  }

  async installCli(): Promise<void> {
    await execFileAsync('npm', ['install', '-g', 'vercel'], { timeout: 120_000 })
  }

  async login(): Promise<void> {
    await execFileAsync('vercel', ['login', '--github'], { timeout: 120_000 })
  }

  async getHealthStatus(): Promise<VercelHealth> {
    const cliInstalled = await this.isCliInstalled()
    if (!cliInstalled) {
      return { cliInstalled: false, authenticated: false }
    }
    const authenticated = await this.isAuthenticated()
    return { cliInstalled, authenticated }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/deploy/vercel-health-check.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/deploy/vercel-health-check.ts src/main/deploy/vercel-health-check.test.ts
git commit -m "feat(deploy): add VercelHealthCheck module for CLI detection and auth"
```

---

### Task 2: Add VercelHealth Type to Shared Types

**Files:**
- Modify: `src/shared/simple-types.ts`

- [ ] **Step 1: Add VercelHealth interface**

In `src/shared/simple-types.ts`, add after the existing `DeploymentStatus` interface (after line 34):

```typescript
export interface VercelHealth {
  cliInstalled: boolean
  authenticated: boolean
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/simple-types.ts
git commit -m "feat(deploy): add VercelHealth type to shared types"
```

---

### Task 3: Wire VercelHealthCheck into IPC Dependencies

**Files:**
- Modify: `src/main/ipc/types.ts`
- Modify: `src/main/app/index.ts` (where deps are constructed)

- [ ] **Step 1: Add VercelHealthCheck to IpcDependencies**

In `src/main/ipc/types.ts`, add the import and interface field.

Add import:
```typescript
import type { VercelHealthCheck } from '../deploy/vercel-health-check'
```

Add to the `IpcDependencies` interface (after `memoryStore: MemoryStore`):
```typescript
  vercelHealthCheck: VercelHealthCheck
```

- [ ] **Step 2: Instantiate VercelHealthCheck where dependencies are created**

Find where `IpcDependencies` is constructed in `src/main/app/index.ts` (search for where `registerIpcHandlers` is called and the deps object is built). Add:

Import:
```typescript
import { VercelHealthCheck } from '../deploy/vercel-health-check'
```

Instantiation (near other module instantiations):
```typescript
const vercelHealthCheck = new VercelHealthCheck()
```

Add `vercelHealthCheck` to the deps object passed to `registerIpcHandlers(deps)`.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/types.ts src/main/app/index.ts
git commit -m "feat(deploy): wire VercelHealthCheck into IPC dependencies"
```

---

### Task 4: Implement Deploy IPC Handlers

**Files:**
- Modify: `src/main/ipc/simple-handlers.ts`
- Modify: `src/preload/simple.ts`

- [ ] **Step 1: Replace deploy stub handlers**

In `src/main/ipc/simple-handlers.ts`, add `BrowserWindow` to the electron import (line 1), then replace lines 27–33 (the two deploy stubs) with:

```typescript
  ipcMain.handle('simple:deploy', async (_event, sessionId: string) => {
    const health = await deps.vercelHealthCheck.getHealthStatus()
    if (!health.cliInstalled || !health.authenticated) {
      return { needsSetup: true, health }
    }

    sessionManager.sendInput(
      sessionId,
      'Deploy this application to Vercel production using `vercel deploy --prod --yes`. Report the production URL when complete.\n'
    )

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('simple:deploy-status-update', {
          sessionId,
          stage: 'deploying',
          message: 'Deploying to Vercel...',
        })
      }
    }

    return { needsSetup: false }
  })

  ipcMain.handle('simple:deploy-status', (_event, sessionId: string) => {
    return deps.vercelHealthCheck.getHealthStatus()
  })

  ipcMain.handle('simple:deploy-install-cli', async () => {
    await deps.vercelHealthCheck.installCli()
  })

  ipcMain.handle('simple:deploy-login', async () => {
    await deps.vercelHealthCheck.login()
  })
```

Note: `BrowserWindow` must be imported from `electron` at line 1 (it's already imported there).

- [ ] **Step 2: Add new IPC channels to preload whitelist**

In `src/preload/simple.ts`, add to `ALLOWED_INVOKE_CHANNELS` (after `'simple:deploy-status'` on line 32):

```typescript
  'simple:deploy-install-cli',
  'simple:deploy-login',
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/simple-handlers.ts src/preload/simple.ts
git commit -m "feat(deploy): implement deploy IPC handlers with health check"
```

---

### Task 5: Extend StatusDetector for Vercel URL Detection

**Files:**
- Modify: `src/main/agent/status-detector.ts`

- [ ] **Step 1: Add Vercel URL detection function**

In `src/main/agent/status-detector.ts`, add at the end of the file (after the `detectStatus` function):

```typescript
const VERCEL_URL_PATTERN = /https:\/\/[\w-]+\.vercel\.app/

/**
 * Scans agent output for a Vercel production URL.
 * Returns the first matched URL or null.
 */
export function detectVercelUrl(output: string): string | null {
  const match = output.match(VERCEL_URL_PATTERN)
  return match ? match[0] : null
}
```

- [ ] **Step 2: Run existing tests**

Run: `npm test`
Expected: PASS — existing tests unaffected

- [ ] **Step 3: Commit**

```bash
git add src/main/agent/status-detector.ts
git commit -m "feat(deploy): add Vercel URL detection to status-detector"
```

---

### Task 6: Hook Vercel URL Detection into Agent Output Stream

**Files:**
- Find and modify the file where agent PTY output is processed

The session manager or a listener on PTY output currently detects preview URLs (localhost dev server) and emits `preview:url-detected`. We need to add Vercel URL detection alongside it.

- [ ] **Step 1: Find where preview:url-detected is emitted**

Run: `grep -rn 'preview:url-detected' src/main/`

This will show the file and line where preview URLs are detected from agent output.

- [ ] **Step 2: Add Vercel URL detection alongside preview URL detection**

In the file found in step 1, import `detectVercelUrl`:

```typescript
import { detectVercelUrl } from '../agent/status-detector'
```

In the output handler, after the existing preview URL detection logic, add:

```typescript
const vercelUrl = detectVercelUrl(accumulatedOutput)
if (vercelUrl) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('simple:deploy-status-update', {
        sessionId,
        stage: 'live',
        message: 'Deployed successfully',
        url: vercelUrl,
      })
    }
  }
}
```

Use the accumulated output buffer (not just the latest chunk) to avoid missing URLs that span chunks. The exact variable name depends on the file found in step 1.

Note: Use a guard (e.g., a `Set` of already-emitted URLs or a boolean flag) to avoid emitting the same URL multiple times as more output arrives.

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add <modified-files>
git commit -m "feat(deploy): emit deploy-status-update on Vercel URL detection"
```

---

### Task 7: DeployModal Component

**Files:**
- Create: `src/renderer-simple/components/DeployModal.tsx`
- Create: `src/renderer-simple/components/DeployModal.styles.ts`

- [ ] **Step 1: Create DeployModal styles**

Create `src/renderer-simple/components/DeployModal.styles.ts`:

```typescript
import type { CSSProperties } from 'react'

export const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

export const modal: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 12,
  padding: 32,
  width: 400,
  textAlign: 'center',
  border: '1px solid var(--border)',
}

export const logo: CSSProperties = {
  marginBottom: 24,
}

export const title: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--text)',
  margin: '0 0 8px 0',
}

export const subtitle: CSSProperties = {
  fontSize: 14,
  color: 'var(--text-muted)',
  margin: '0 0 24px 0',
  lineHeight: 1.5,
}

export const githubButton: CSSProperties = {
  background: '#fff',
  color: '#000',
  border: 'none',
  borderRadius: 8,
  padding: '12px 24px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 16,
}

export const cancelButton: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 13,
  cursor: 'pointer',
  padding: '8px 16px',
}

export const progressBox: CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 24,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

export const spinner: CSSProperties = {
  width: 20,
  height: 20,
  border: '2px solid var(--accent)',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
}

export const errorText: CSSProperties = {
  color: 'var(--error)',
  fontSize: 14,
  margin: '0 0 16px 0',
}

export const hint: CSSProperties = {
  opacity: 0.4,
  fontSize: 12,
  margin: 0,
}
```

- [ ] **Step 2: Create DeployModal component**

Create `src/renderer-simple/components/DeployModal.tsx`:

```typescript
import React, { useState } from 'react'
import type { VercelHealth } from '../../shared/simple-types'
import * as styles from './DeployModal.styles'

interface Props {
  health: VercelHealth
  onComplete: () => void
  onCancel: () => void
}

type ModalStage = 'installing' | 'auth' | 'error'

export function DeployModal({ health, onComplete, onCancel }: Props): React.JSX.Element {
  const initialStage: ModalStage = health.cliInstalled ? 'auth' : 'installing'
  const [stage, setStage] = useState<ModalStage>(initialStage)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    if (stage !== 'installing') return
    let cancelled = false
    void (async () => {
      try {
        await window.electronAPI.invoke('simple:deploy-install-cli')
        if (cancelled) return
        setStage('auth')
      } catch {
        if (cancelled) return
        setError('Could not install Vercel CLI. You may need to install Node.js first.')
        setStage('error')
      }
    })()
    return () => { cancelled = true }
  }, [stage])

  const handleLogin = async (): Promise<void> => {
    try {
      await window.electronAPI.invoke('simple:deploy-login')
      onComplete()
    } catch {
      setError('Sign-in timed out or was cancelled. Please try again.')
      setStage('error')
    }
  }

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.logo}>
          <svg width="48" height="48" viewBox="0 0 76 65" fill="var(--text)">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/>
          </svg>
        </div>

        {stage === 'installing' && (
          <>
            <h3 style={styles.title}>Setting up Vercel</h3>
            <p style={styles.subtitle}>Installing the Vercel CLI so your app can go live...</p>
            <div style={styles.progressBox}>
              <div style={styles.spinner} />
              <span style={{ fontFamily: 'monospace', fontSize: 13, opacity: 0.7, color: 'var(--text)' }}>
                npm install -g vercel
              </span>
            </div>
            <p style={styles.hint}>This only needs to happen once</p>
          </>
        )}

        {stage === 'auth' && (
          <>
            <h3 style={styles.title}>Connect to Vercel</h3>
            <p style={styles.subtitle}>
              Sign in to deploy your app to the web.<br/>
              If you don&apos;t have an account, one will be created for you.
            </p>
            <button style={styles.githubButton} onClick={handleLogin}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#000">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>
            <p style={styles.hint}>Opens your browser to sign in securely</p>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button style={styles.cancelButton} onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}

        {stage === 'error' && (
          <>
            <h3 style={styles.title}>Setup Failed</h3>
            <p style={styles.errorText}>{error}</p>
            <button
              style={styles.githubButton}
              onClick={() => {
                setError(null)
                setStage(health.cliInstalled ? 'auth' : 'installing')
              }}
            >
              Try Again
            </button>
            <div style={{ marginTop: 12 }}>
              <button style={styles.cancelButton} onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer-simple/components/DeployModal.tsx src/renderer-simple/components/DeployModal.styles.ts
git commit -m "feat(deploy): add DeployModal component for Vercel setup flow"
```

---

### Task 8: useDeploy Hook

**Files:**
- Create: `src/renderer-simple/hooks/useDeploy.ts`

- [ ] **Step 1: Create useDeploy hook**

Create `src/renderer-simple/hooks/useDeploy.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { AppStatus, DeploymentStatus, VercelHealth } from '../../shared/simple-types'

interface DeployState {
  deployStatus: AppStatus | null
  liveUrl: string | null
  showSetupModal: boolean
  setupHealth: VercelHealth | null
  deploy: () => void
  dismissModal: () => void
  onSetupComplete: () => void
}

export function useDeploy(sessionId: string | null): DeployState {
  const [deployStatus, setDeployStatus] = useState<AppStatus | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [setupHealth, setSetupHealth] = useState<VercelHealth | null>(null)

  useEffect(() => {
    if (!sessionId) return
    const unsub = window.electronAPI.on('simple:deploy-status-update', (event: unknown) => {
      const e = event as DeploymentStatus
      if (e.sessionId === sessionId) {
        setDeployStatus(e.stage)
        if (e.url) {
          setLiveUrl(e.url)
        }
      }
    })
    return unsub
  }, [sessionId])

  const deploy = useCallback(async () => {
    if (!sessionId) return
    try {
      const result = (await window.electronAPI.invoke('simple:deploy', sessionId)) as {
        needsSetup: boolean
        health?: VercelHealth
      }
      if (result.needsSetup && result.health) {
        setSetupHealth(result.health)
        setShowSetupModal(true)
      } else {
        setDeployStatus('deploying')
      }
    } catch (err) {
      console.error('[useDeploy] deploy failed:', err)
      setDeployStatus('error')
    }
  }, [sessionId])

  const dismissModal = useCallback(() => {
    setShowSetupModal(false)
    setSetupHealth(null)
  }, [])

  const onSetupComplete = useCallback(() => {
    setShowSetupModal(false)
    setSetupHealth(null)
    void deploy()
  }, [deploy])

  return {
    deployStatus,
    liveUrl,
    showSetupModal,
    setupHealth,
    deploy,
    dismissModal,
    onSetupComplete,
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer-simple/hooks/useDeploy.ts
git commit -m "feat(deploy): add useDeploy hook for deploy state management"
```

---

### Task 9: Update StatusBanner for Deploy Lifecycle States

**Files:**
- Modify: `src/renderer-simple/components/StatusBanner.tsx`
- Modify: `src/renderer-simple/components/StatusBanner.styles.ts`

- [ ] **Step 1: Add new styles for deploy states**

In `src/renderer-simple/components/StatusBanner.styles.ts`, add after the existing `deployButton` (after line 66):

```typescript
export const deployingSpinner: CSSProperties = {
  width: 14,
  height: 14,
  border: '2px solid var(--accent)',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  display: 'inline-block',
}

export const liveUrlButton: CSSProperties = {
  fontSize: 13,
  color: 'var(--success)',
  textDecoration: 'underline',
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  fontWeight: 600,
}

export const copyButton: CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: 'none',
  color: 'var(--text)',
  borderRadius: 'var(--radius)',
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer',
}

export const openButton: CSSProperties = {
  background: 'var(--success)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

export const retryButton: CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: 'var(--text)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '6px 14px',
  fontSize: 13,
  cursor: 'pointer',
}
```

- [ ] **Step 2: Update StatusBanner component**

Replace the content of `src/renderer-simple/components/StatusBanner.tsx` with:

```typescript
import React from 'react'
import type { AppStatus } from '../../shared/simple-types'
import * as styles from './StatusBanner.styles'

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: 'Ready',
  scaffolding: 'Setting up project...',
  building: 'Building your app...',
  previewing: 'Preview ready',
  deploying: 'Deploying to Vercel...',
  live: 'Live',
  error: 'Something went wrong',
}

const STATUS_COLORS: Record<AppStatus, string> = {
  idle: 'var(--text-muted)',
  scaffolding: 'var(--accent)',
  building: 'var(--accent)',
  previewing: 'var(--success)',
  deploying: 'var(--accent)',
  live: 'var(--success)',
  error: 'var(--error)',
}

interface Props {
  status: AppStatus
  isAgentWorking?: boolean
  onBack: () => void
  onDeploy?: () => void
  runtimeLabel?: string
  onDevMode?: () => void
  liveUrl?: string | null
  deployStatus?: AppStatus | null
}

export function StatusBanner({ status, isAgentWorking, onBack, onDeploy, runtimeLabel, onDevMode, liveUrl, deployStatus }: Props): React.JSX.Element {
  const isDeploying = deployStatus === 'deploying'
  const isLive = deployStatus === 'live' && liveUrl
  const deployFailed = deployStatus === 'error'

  const displayStatus = isDeploying ? 'deploying' : isLive ? 'live' : status
  const displayLabel = isLive ? 'Live at' : STATUS_LABELS[displayStatus]
  const displayColor = STATUS_COLORS[displayStatus]

  return (
    <div style={styles.container}>
      <button onClick={onBack} style={styles.backButton}>
        Back
      </button>
      <span style={styles.statusLabel(displayColor)}>
        {isDeploying && <span style={styles.deployingSpinner} />}
        {' '}{displayLabel}
      </span>
      {isLive && liveUrl && (
        <button
          style={styles.liveUrlButton}
          onClick={() => window.open(liveUrl, '_blank')}
          title={liveUrl}
        >
          {liveUrl.replace('https://', '')}
        </button>
      )}
      {runtimeLabel && (
        <div style={styles.runtimeBadge}>
          AI Assistant: {runtimeLabel}
        </div>
      )}
      <div style={styles.spacer} />
      {onDevMode && (
        <button
          onClick={isAgentWorking ? undefined : onDevMode}
          disabled={isAgentWorking}
          style={{ ...styles.devModeButton, opacity: isAgentWorking ? 0.4 : 1, cursor: isAgentWorking ? 'not-allowed' : 'pointer' }}
          title={isAgentWorking ? 'Unavailable while app is building' : 'Switch to full developer mode'}
        >
          Developer View
        </button>
      )}
      {isLive && liveUrl && (
        <>
          <button
            style={styles.copyButton}
            onClick={() => navigator.clipboard.writeText(liveUrl)}
          >
            Copy URL
          </button>
          <button
            style={styles.openButton}
            onClick={() => window.open(liveUrl, '_blank')}
          >
            Open ↗
          </button>
        </>
      )}
      {isLive && onDeploy && status === 'previewing' && (
        <button onClick={onDeploy} style={styles.deployButton}>
          Redeploy ▲
        </button>
      )}
      {deployFailed && onDeploy && (
        <button onClick={onDeploy} style={styles.retryButton}>
          Retry
        </button>
      )}
      {onDeploy && status === 'previewing' && !isDeploying && !isLive && !deployFailed && (
        <button onClick={onDeploy} style={styles.deployButton} disabled={isDeploying}>
          Deploy ▲
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer-simple/components/StatusBanner.tsx src/renderer-simple/components/StatusBanner.styles.ts
git commit -m "feat(deploy): update StatusBanner with deploying/live/failed states"
```

---

### Task 10: Wire Everything in AppView and App.tsx

**Files:**
- Modify: `src/renderer-simple/components/AppView.tsx`
- Modify: `src/renderer-simple/App.tsx`

- [ ] **Step 1: Add deploy props to AppView**

In `src/renderer-simple/components/AppView.tsx`:

Add to the `Props` interface (after `onDeploy: () => void` on line 22):
```typescript
  liveUrl?: string | null
  deployStatus?: AppStatus | null
```

Destructure the new props in the function signature (line 27-38), adding `liveUrl` and `deployStatus`.

Pass them to `StatusBanner` in the JSX (lines 81-88), adding:
```typescript
        liveUrl={liveUrl}
        deployStatus={deployStatus}
```

- [ ] **Step 2: Wire useDeploy and DeployModal into AppViewWrapper**

In `src/renderer-simple/App.tsx`:

Add imports at top:
```typescript
import { useDeploy } from './hooks/useDeploy'
import { DeployModal } from './components/DeployModal'
```

Replace the `AppViewWrapper` function body (lines 71-119) with:

```typescript
function AppViewWrapper({ app, onBack }: { app: SimpleApp; onBack: () => void }): React.JSX.Element {
  const { status: agentStatus, durationMs } = useAgentStatus(app.sessionId)
  const { messages, sendMessage } = useChat(app.sessionId)
  const { previewUrl } = usePreview(app.sessionId)
  const { deployStatus, liveUrl, showSetupModal, setupHealth, deploy, dismissModal, onSetupComplete } = useDeploy(app.sessionId)
  const devServerStartedRef = React.useRef(false)

  React.useEffect(() => {
    if (agentStatus === 'done' && !previewUrl && !devServerStartedRef.current) {
      devServerStartedRef.current = true
      window.electronAPI.invoke('agent:start-dev-server', app.sessionId)
    }
  }, [agentStatus, previewUrl, app.sessionId])

  const status: SimpleApp['status'] =
    agentStatus === 'done' ? (previewUrl ? 'previewing' : 'live')
    : agentStatus === 'error' ? 'error'
    : agentStatus === 'waiting' ? (previewUrl ? 'previewing' : 'idle')
    : previewUrl ? 'building'
    : app.status

  const interruptAgent = useCallback(() => {
    window.electronAPI.invoke('agent:interrupt', app.sessionId)
  }, [app.sessionId])

  return (
    <>
      <AppView
        status={status}
        messages={messages}
        previewUrl={previewUrl}
        isAgentWorking={agentStatus === 'running'}
        agentDurationMs={durationMs}
        onSendMessage={sendMessage}
        onInterrupt={interruptAgent}
        onBack={onBack}
        onDeploy={deploy}
        runtimeLabel={getSimpleRuntimeLabel(app.runtimeId)}
        onDevMode={() => {
          window.electronAPI.invoke('app:switch-mode', 'developer', app.projectId, app.sessionId, app.runtimeId)
        }}
        liveUrl={liveUrl}
        deployStatus={deployStatus}
      />
      {showSetupModal && setupHealth && (
        <DeployModal
          health={setupHealth}
          onComplete={onSetupComplete}
          onCancel={dismissModal}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer-simple/components/AppView.tsx src/renderer-simple/App.tsx
git commit -m "feat(deploy): wire deploy flow into AppView and AppViewWrapper"
```

---

### Task 11: Add CSS Keyframe for Spinner Animation

The `spin` animation referenced in `DeployModal.styles.ts` and `StatusBanner.styles.ts` needs a global `@keyframes` rule.

**Files:**
- Modify: `src/renderer-simple/index.html` (or global CSS file)

- [ ] **Step 1: Find the simple view HTML entry**

Run: `cat src/renderer-simple/index.html` to check if there's already a `<style>` block.

- [ ] **Step 2: Add the spin keyframe**

If a `<style>` block exists, add the keyframe inside it. If not, add a new one in the `<head>`:

```html
<style>
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer-simple/index.html
git commit -m "feat(deploy): add spin keyframe animation for deploy spinners"
```

---

### Task 12: Final Typecheck and Test Run

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All existing tests PASS, new VercelHealthCheck tests PASS

- [ ] **Step 3: Fix any issues found**

If any errors, fix them and commit:

```bash
git commit -m "fix(deploy): resolve typecheck/test issues"
```
