# Manible Simple Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a simplified "Manible" renderer to Manifold that lets non-technical users describe a webapp in natural language, preview it locally, and deploy to AKS — all through a chat interface.

**Architecture:** A second electron-vite renderer entry point (`src/renderer-simple/`) sharing the same main process. New main-process modules: `DeploymentManager` (orchestrates VippsService GitHub workflows) and `ChatAdapter` (translates PTY output into structured chat messages). A mode switcher in `src/main/index.ts` loads the appropriate renderer based on user preference in settings.

**Tech Stack:** Electron, React 18, electron-vite (multi-renderer), existing IPC pattern, `gh` CLI for GitHub workflow triggers.

**Reused from main:** The web preview feature (merged in PR #134) provides URL detection from PTY output (`src/main/url-detector.ts`), a production-ready `WebPreview` component with webview toolbar/error handling (`src/renderer/components/WebPreview.tsx`), a `useWebPreview` hook, and the `preview:url-detected` IPC push channel. The simple renderer reuses these directly instead of building custom preview components.

---

### Task 1: Add `uiMode` to settings and shared types

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/defaults.ts`
- Modify: `src/main/settings-store.test.ts`

**Step 1: Add `uiMode` field to `ManifoldSettings`**

In `src/shared/types.ts`, add to the `ManifoldSettings` interface:

```typescript
uiMode: 'developer' | 'simple'
```

**Step 2: Set default value**

In `src/shared/defaults.ts`, add to `DEFAULT_SETTINGS`:

```typescript
uiMode: 'simple'
```

**Step 3: Write a test for the new default**

In `src/main/settings-store.test.ts`, add a test:

```typescript
it('includes uiMode in default settings', () => {
  const settings = store.getSettings()
  expect(settings.uiMode).toBe('simple')
})
```

**Step 4: Run tests**

Run: `npx vitest run src/main/settings-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/settings-store.test.ts
git commit -m "feat: add uiMode setting (developer/simple)"
```

---

### Task 2: Add simple-mode preload

**Files:**
- Create: `src/preload/simple.ts`

**Step 1: Create the simple preload**

Create `src/preload/simple.ts` — a stripped-down version of the existing preload. Only whitelist the channels the simple UI needs:

```typescript
import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_INVOKE_CHANNELS = [
  'projects:list',
  'projects:add',
  'projects:open-dialog',
  'projects:clone',
  'agent:spawn',
  'agent:kill',
  'agent:input',
  'agent:resize',
  'agent:sessions',
  'agent:replay',
  'settings:get',
  'settings:update',
  'app:version',
  'updater:install',
  'updater:check',
  'simple:chat-messages',
  'simple:deploy',
  'simple:deploy-status',
] as const

const ALLOWED_SEND_CHANNELS = [
  'theme:changed',
] as const

const ALLOWED_LISTEN_CHANNELS = [
  'agent:status',
  'agent:exit',
  'simple:chat-message',
  'simple:deploy-status-update',
  'preview:url-detected',
  'updater:status',
  'show-about',
  'show-settings',
  'settings:changed',
] as const

type InvokeChannel = (typeof ALLOWED_INVOKE_CHANNELS)[number]
type SendChannel = (typeof ALLOWED_SEND_CHANNELS)[number]
type ListenChannel = (typeof ALLOWED_LISTEN_CHANNELS)[number]

function isAllowedInvokeChannel(channel: string): channel is InvokeChannel {
  return (ALLOWED_INVOKE_CHANNELS as readonly string[]).includes(channel)
}

function isAllowedSendChannel(channel: string): channel is SendChannel {
  return (ALLOWED_SEND_CHANNELS as readonly string[]).includes(channel)
}

function isAllowedListenChannel(channel: string): channel is ListenChannel {
  return (ALLOWED_LISTEN_CHANNELS as readonly string[]).includes(channel)
}

type IpcCallback = (...args: unknown[]) => void

const electronAPI = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!isAllowedInvokeChannel(channel)) {
      return Promise.reject(new Error(`IPC invoke channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  send(channel: string, ...args: unknown[]): void {
    if (isAllowedSendChannel(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },

  on(channel: string, callback: IpcCallback): () => void {
    if (!isAllowedListenChannel(channel)) {
      return () => {}
    }
    const wrappedCallback = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      callback(...args)
    }
    ipcRenderer.on(channel, wrappedCallback)
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
```

**Step 2: Commit**

```bash
git add src/preload/simple.ts
git commit -m "feat: add simple-mode preload with reduced channel whitelist"
```

---

### Task 3: Add simple renderer entry point to electron-vite

**Files:**
- Modify: `electron.vite.config.ts`
- Create: `src/renderer-simple/index.html`
- Create: `src/renderer-simple/index.tsx`
- Create: `src/renderer-simple/App.tsx`
- Create: `src/renderer-simple/styles/theme.css`

**Step 1: Update electron-vite config for multi-renderer**

In `electron.vite.config.ts`, add a second preload input and a second renderer config. electron-vite doesn't natively support two renderers in one config, so we use rollup multi-input for preload and handle the simple renderer as a separate page:

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          simple: resolve(__dirname, 'src/preload/simple.ts'),
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          simple: resolve(__dirname, 'src/renderer-simple/index.html'),
        }
      }
    }
  }
})
```

**Step 2: Create simple renderer HTML entry**

Create `src/renderer-simple/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>Manible</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

**Step 3: Create simple renderer React entry**

Create `src/renderer-simple/index.tsx`:

```typescript
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/theme.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

const root = createRoot(container)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 4: Create minimal App shell**

Create `src/renderer-simple/App.tsx`:

```typescript
import React from 'react'

export function App(): React.JSX.Element {
  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Manible</h1>
      <p>Simple mode is loading...</p>
    </div>
  )
}
```

**Step 5: Create minimal theme CSS**

Create `src/renderer-simple/styles/theme.css`:

```css
:root {
  --bg: #1a1a2e;
  --surface: #16213e;
  --text: #e0e0e0;
  --text-muted: #8888aa;
  --accent: #6c63ff;
  --accent-hover: #7c74ff;
  --success: #4caf50;
  --error: #f44336;
  --warning: #ff9800;
  --border: #2a2a4a;
  --radius: 12px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

**Step 6: Verify the build works**

Run: `npm run build`
Expected: Build succeeds with both renderer outputs in `out/`

**Step 7: Commit**

```bash
git add electron.vite.config.ts src/renderer-simple/
git commit -m "feat: add simple renderer entry point with electron-vite multi-renderer"
```

---

### Task 4: Wire mode-based renderer loading in main process

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Update `createWindow()` to load the correct preload and renderer**

Modify `createWindow()` in `src/main/index.ts` to check `uiMode` from settings:

```typescript
function createWindow(): void {
  const settings = settingsStore.getSettings()
  const theme = settings.theme ?? 'dracula'
  const isSimple = settings.uiMode === 'simple'

  nativeTheme.themeSource = resolveThemeType(theme)

  mainWindow = new BrowserWindow({
    width: isSimple ? 1100 : 1400,
    height: isSimple ? 800 : 900,
    minWidth: 800,
    minHeight: 600,
    title: isSimple ? 'Manible' : 'Manifold',
    backgroundColor: resolveInitialBackground(theme),
    webPreferences: {
      preload: join(__dirname, isSimple ? '../preload/simple.js' : '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  wireModules(mainWindow)
  loadRenderer(mainWindow, isSimple)
  // ... rest of createWindow unchanged
}
```

**Step 2: Update `loadRenderer()` to accept mode**

```typescript
function loadRenderer(window: BrowserWindow, simple: boolean): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL
    window.loadURL(simple ? `${base}/simple.html` : base)
  } else {
    const page = simple ? '../renderer-simple/index.html' : '../renderer/index.html'
    window.loadFile(join(__dirname, page))
  }
}
```

**Step 3: Verify dev mode works**

Run: `npm run dev`
Expected: App launches in simple mode (shows "Manible" placeholder). Change `uiMode` to `'developer'` in `~/.manifold/config.json` and re-launch to verify developer mode still works.

**Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: load simple or developer renderer based on uiMode setting"
```

---

### Task 5: Add shared simple-mode types

**Files:**
- Create: `src/shared/simple-types.ts`

**Step 1: Define the chat and deployment types used by both main and renderer-simple**

Create `src/shared/simple-types.ts`:

```typescript
export type ChatRole = 'user' | 'agent' | 'system'

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatRole
  text: string
  timestamp: number
}

export type AppStatus = 'idle' | 'scaffolding' | 'building' | 'previewing' | 'deploying' | 'live' | 'error'

export interface SimpleApp {
  sessionId: string
  projectId: string
  name: string
  description: string
  status: AppStatus
  previewUrl: string | null
  liveUrl: string | null
  createdAt: number
  updatedAt: number
}

export interface DeploymentStatus {
  sessionId: string
  stage: AppStatus
  message: string
  url?: string
}
```

**Step 2: Commit**

```bash
git add src/shared/simple-types.ts
git commit -m "feat: add shared types for simple mode (ChatMessage, SimpleApp, DeploymentStatus)"
```

---

### Task 6: Build the ChatAdapter main-process module

**Files:**
- Create: `src/main/chat-adapter.ts`
- Create: `src/main/chat-adapter.test.ts`

**Step 1: Write failing tests for ChatAdapter**

Create `src/main/chat-adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatAdapter } from './chat-adapter'

describe('ChatAdapter', () => {
  let adapter: ChatAdapter

  beforeEach(() => {
    adapter = new ChatAdapter()
  })

  it('stores a user message', () => {
    adapter.addUserMessage('session-1', 'Build me a landing page')
    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].text).toBe('Build me a landing page')
    expect(messages[0].sessionId).toBe('session-1')
  })

  it('stores a system message', () => {
    adapter.addSystemMessage('session-1', 'Setting up your project...')
    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('system')
  })

  it('returns empty array for unknown session', () => {
    expect(adapter.getMessages('unknown')).toEqual([])
  })

  it('notifies listeners when a message is added', () => {
    const listener = vi.fn()
    adapter.onMessage('session-1', listener)
    adapter.addUserMessage('session-1', 'hello')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }))
  })

  it('processes PTY output into agent messages', () => {
    const listener = vi.fn()
    adapter.onMessage('session-1', listener)
    adapter.processPtyOutput('session-1', 'I have created a basic landing page with a header and hero section.')
    const messages = adapter.getMessages('session-1')
    expect(messages.some(m => m.role === 'agent')).toBe(true)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/chat-adapter.test.ts`
Expected: FAIL — module does not exist

**Step 3: Implement ChatAdapter**

Create `src/main/chat-adapter.ts`:

```typescript
import type { ChatMessage } from '@shared/simple-types'

type MessageListener = (message: ChatMessage) => void

export class ChatAdapter {
  private messages = new Map<string, ChatMessage[]>()
  private listeners = new Map<string, Set<MessageListener>>()
  private nextId = 1

  addUserMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'user', text)
  }

  addSystemMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'system', text)
  }

  addAgentMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'agent', text)
  }

  processPtyOutput(sessionId: string, rawOutput: string): void {
    // Strip ANSI escape codes and extract meaningful text
    const cleaned = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
    if (cleaned.length === 0) return
    this.addAgentMessage(sessionId, cleaned)
  }

  getMessages(sessionId: string): ChatMessage[] {
    return this.messages.get(sessionId) ?? []
  }

  onMessage(sessionId: string, listener: MessageListener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set())
    }
    this.listeners.get(sessionId)!.add(listener)
    return () => {
      this.listeners.get(sessionId)?.delete(listener)
    }
  }

  private addMessage(sessionId: string, role: ChatMessage['role'], text: string): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${this.nextId++}`,
      sessionId,
      role,
      text,
      timestamp: Date.now(),
    }
    if (!this.messages.has(sessionId)) {
      this.messages.set(sessionId, [])
    }
    this.messages.get(sessionId)!.push(message)
    this.listeners.get(sessionId)?.forEach(fn => fn(message))
    return message
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/main/chat-adapter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/chat-adapter.ts src/main/chat-adapter.test.ts
git commit -m "feat: add ChatAdapter for translating PTY output to chat messages"
```

---

### Task 7: Build the DeploymentManager main-process module

**Files:**
- Create: `src/main/deployment-manager.ts`
- Create: `src/main/deployment-manager.test.ts`

**Step 1: Write failing tests**

Create `src/main/deployment-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeploymentManager } from './deployment-manager'

describe('DeploymentManager', () => {
  let manager: DeploymentManager

  beforeEach(() => {
    manager = new DeploymentManager()
  })

  it('builds the gh workflow command for scaffolding', () => {
    const cmd = manager.buildScaffoldCommand('my-webapp', 'vippsas/service-templates')
    expect(cmd.binary).toBe('gh')
    expect(cmd.args).toContain('workflow')
    expect(cmd.args).toContain('run')
    expect(cmd.args.some(a => a.includes('my-webapp'))).toBe(true)
  })

  it('builds the gh workflow command for deployment', () => {
    const cmd = manager.buildDeployCommand('vippsas/my-webapp')
    expect(cmd.binary).toBe('gh')
    expect(cmd.args).toContain('workflow')
    expect(cmd.args).toContain('run')
  })

  it('builds the agent system prompt with app description', () => {
    const prompt = manager.buildAgentPrompt('A landing page for collecting customer feedback')
    expect(prompt).toContain('landing page')
    expect(prompt).toContain('customer feedback')
    expect(prompt).toContain('Dockerfile')
    expect(prompt).not.toContain('Terraform')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/deployment-manager.test.ts`
Expected: FAIL

**Step 3: Implement DeploymentManager**

Create `src/main/deployment-manager.ts`:

```typescript
export interface ShellCommand {
  binary: string
  args: string[]
}

export class DeploymentManager {
  buildScaffoldCommand(appName: string, templateRepo: string): ShellCommand {
    return {
      binary: 'gh',
      args: [
        'workflow', 'run', 'vipps-service.yml',
        '--repo', templateRepo,
        '--field', `name=${appName}`,
      ],
    }
  }

  buildDeployCommand(repoFullName: string): ShellCommand {
    return {
      binary: 'gh',
      args: [
        'workflow', 'run', 'deploy.yml',
        '--repo', repoFullName,
      ],
    }
  }

  buildAgentPrompt(appDescription: string): string {
    return [
      'You are building a webapp. The repository has already been scaffolded with Kubernetes config and deployment workflows — do not modify those files.',
      '',
      `The user wants: ${appDescription}`,
      '',
      'Your tasks:',
      '1. Create the webapp application code (HTML, CSS, JavaScript or a simple framework)',
      '2. Create a Dockerfile that builds and serves the webapp',
      '3. Make sure the app runs on port 3000',
      '4. Commit and push your changes',
      '',
      'Keep it simple and working. Do not add unnecessary dependencies.',
    ].join('\n')
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/main/deployment-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/deployment-manager.ts src/main/deployment-manager.test.ts
git commit -m "feat: add DeploymentManager for VippsService workflow orchestration"
```

---

### Task 8: Register simple-mode IPC handlers

**Files:**
- Create: `src/main/ipc/simple-handlers.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/ipc/types.ts`

**Step 1: Add new dependencies to IPC types**

In `src/main/ipc/types.ts`, add `ChatAdapter` and `DeploymentManager` to the `IpcDependencies` interface:

```typescript
import type { ChatAdapter } from '../chat-adapter'
import type { DeploymentManager } from '../deployment-manager'

// Add to IpcDependencies:
chatAdapter: ChatAdapter
deploymentManager: DeploymentManager
```

**Step 2: Create simple-handlers.ts**

Create `src/main/ipc/simple-handlers.ts`:

```typescript
import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'

export function registerSimpleHandlers(deps: IpcDependencies): void {
  const { chatAdapter, deploymentManager, sessionManager } = deps

  ipcMain.handle('simple:chat-messages', (_event, sessionId: string) => {
    return chatAdapter.getMessages(sessionId)
  })

  ipcMain.handle('simple:deploy', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const repoName = `vippsas/${session.branchName.replace('manifold/', '')}`
    const cmd = deploymentManager.buildDeployCommand(repoName)
    return { command: cmd.binary, args: cmd.args }
  })

  ipcMain.handle('simple:deploy-status', (_event, _sessionId: string) => {
    // Placeholder — will be expanded when we wire up actual workflow polling
    return { stage: 'idle', message: 'Not deployed yet' }
  })

  // Preview URL is handled by the existing `preview:url-detected` push channel
  // from SessionManager (web preview feature, PR #134) — no handler needed here.
}
```

**Step 3: Register in ipc-handlers.ts**

In `src/main/ipc-handlers.ts`, import and call `registerSimpleHandlers`:

```typescript
import { registerSimpleHandlers } from './ipc/simple-handlers'

// Inside registerIpcHandlers():
registerSimpleHandlers(deps)
```

**Step 4: Wire new modules in index.ts**

In `src/main/index.ts`, instantiate and pass the new modules:

```typescript
import { ChatAdapter } from './chat-adapter'
import { DeploymentManager } from './deployment-manager'

const chatAdapter = new ChatAdapter()
const deploymentManager = new DeploymentManager()

// In wireModules(), add to the deps object:
chatAdapter,
deploymentManager,
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/main/ipc/simple-handlers.ts src/main/ipc-handlers.ts src/main/ipc/types.ts src/main/index.ts
git commit -m "feat: register simple-mode IPC handlers for chat and deployment"
```

---

### Task 9: Build the Dashboard component

**Files:**
- Create: `src/renderer-simple/components/Dashboard.tsx`
- Create: `src/renderer-simple/components/Dashboard.styles.ts`
- Create: `src/renderer-simple/components/AppCard.tsx`
- Create: `src/renderer-simple/components/AppCard.styles.ts`
- Create: `src/renderer-simple/hooks/useApps.ts`
- Modify: `src/renderer-simple/App.tsx`

**Step 1: Create useApps hook**

Create `src/renderer-simple/hooks/useApps.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { SimpleApp } from '@shared/simple-types'

declare global {
  interface Window {
    electronAPI: {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>
      send(channel: string, ...args: unknown[]): void
      on(channel: string, callback: (...args: unknown[]) => void): () => void
    }
  }
}

export function useApps(): {
  apps: SimpleApp[]
  loading: boolean
  refreshApps: () => Promise<void>
} {
  const [apps, setApps] = useState<SimpleApp[]>([])
  const [loading, setLoading] = useState(true)

  const refreshApps = useCallback(async () => {
    setLoading(true)
    try {
      const sessions = await window.electronAPI.invoke('agent:sessions') as Array<{
        id: string
        projectId: string
        branchName: string
        status: string
        taskDescription?: string
      }>
      const simpleApps: SimpleApp[] = sessions.map(s => ({
        sessionId: s.id,
        projectId: s.projectId,
        name: s.branchName.replace('manifold/', ''),
        description: s.taskDescription ?? '',
        status: s.status === 'done' ? 'live' : s.status === 'running' ? 'building' : 'idle',
        previewUrl: null,
        liveUrl: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))
      setApps(simpleApps)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshApps()
  }, [refreshApps])

  return { apps, loading, refreshApps }
}
```

**Step 2: Create AppCard component**

Create `src/renderer-simple/components/AppCard.styles.ts`:

```typescript
import type { CSSProperties } from 'react'

export const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  padding: 24,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  transition: 'border-color 0.2s',
}

export const name: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginBottom: 8,
}

export const description: CSSProperties = {
  fontSize: 14,
  color: 'var(--text-muted)',
  marginBottom: 16,
  lineHeight: 1.4,
}

export const statusBadge: (status: string) => CSSProperties = (status) => ({
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: 20,
  background: status === 'live' ? 'var(--success)' : status === 'error' ? 'var(--error)' : 'var(--accent)',
  color: '#fff',
})
```

Create `src/renderer-simple/components/AppCard.tsx`:

```typescript
import React from 'react'
import type { SimpleApp } from '@shared/simple-types'
import * as styles from './AppCard.styles'

interface Props {
  app: SimpleApp
  onClick: () => void
}

export function AppCard({ app, onClick }: Props): React.JSX.Element {
  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.name}>{app.name}</div>
      <div style={styles.description}>{app.description || 'No description'}</div>
      <span style={styles.statusBadge(app.status)}>{app.status}</span>
    </div>
  )
}
```

**Step 3: Create Dashboard component**

Create `src/renderer-simple/components/Dashboard.styles.ts`:

```typescript
import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  padding: 40,
  maxWidth: 960,
  margin: '0 auto',
}

export const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 40,
}

export const title: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
}

export const newButton: CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '12px 24px',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
}

export const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 20,
}

export const emptyState: CSSProperties = {
  textAlign: 'center',
  padding: 80,
  color: 'var(--text-muted)',
  fontSize: 18,
}
```

Create `src/renderer-simple/components/Dashboard.tsx`:

```typescript
import React from 'react'
import type { SimpleApp } from '@shared/simple-types'
import { AppCard } from './AppCard'
import * as styles from './Dashboard.styles'

interface Props {
  apps: SimpleApp[]
  onNewApp: () => void
  onSelectApp: (app: SimpleApp) => void
}

export function Dashboard({ apps, onNewApp, onSelectApp }: Props): React.JSX.Element {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>My Apps</div>
        <button style={styles.newButton} onClick={onNewApp}>
          New App
        </button>
      </div>
      {apps.length === 0 ? (
        <div style={styles.emptyState}>
          No apps yet. Click "New App" to get started.
        </div>
      ) : (
        <div style={styles.grid}>
          {apps.map(app => (
            <AppCard key={app.sessionId} app={app} onClick={() => onSelectApp(app)} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 4: Wire Dashboard into App.tsx**

Update `src/renderer-simple/App.tsx`:

```typescript
import React, { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { useApps } from './hooks/useApps'
import type { SimpleApp } from '@shared/simple-types'

type View = { kind: 'dashboard' } | { kind: 'new-app' } | { kind: 'app'; app: SimpleApp }

export function App(): React.JSX.Element {
  const { apps } = useApps()
  const [view, setView] = useState<View>({ kind: 'dashboard' })

  if (view.kind === 'dashboard') {
    return (
      <Dashboard
        apps={apps}
        onNewApp={() => setView({ kind: 'new-app' })}
        onSelectApp={(app) => setView({ kind: 'app', app })}
      />
    )
  }

  // Placeholder for new-app and app views (built in later tasks)
  return (
    <div style={{ padding: 40 }}>
      <button onClick={() => setView({ kind: 'dashboard' })}>Back</button>
      <p>{view.kind === 'new-app' ? 'New app form coming soon...' : `App: ${view.app.name}`}</p>
    </div>
  )
}
```

**Step 5: Verify in dev mode**

Run: `npm run dev`
Expected: Manible launches showing the dashboard with "No apps yet" empty state and a "New App" button.

**Step 6: Commit**

```bash
git add src/renderer-simple/
git commit -m "feat: add Dashboard and AppCard components for simple mode"
```

---

### Task 10: Build the NewAppForm component

**Files:**
- Create: `src/renderer-simple/components/NewAppForm.tsx`
- Create: `src/renderer-simple/components/NewAppForm.styles.ts`
- Modify: `src/renderer-simple/App.tsx`

**Step 1: Create styles**

Create `src/renderer-simple/components/NewAppForm.styles.ts`:

```typescript
import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  padding: 40,
  maxWidth: 600,
  margin: '60px auto',
}

export const title: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginBottom: 32,
}

export const label: CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 8,
  color: 'var(--text-muted)',
}

export const input: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 16,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  marginBottom: 24,
  outline: 'none',
}

export const textarea: CSSProperties = {
  ...input,
  minHeight: 120,
  resize: 'vertical',
  fontFamily: 'inherit',
}

export const buttonRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'flex-end',
}

export const startButton: CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '12px 32px',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
}

export const cancelButton: CSSProperties = {
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '12px 24px',
  fontSize: 16,
  cursor: 'pointer',
}
```

**Step 2: Create NewAppForm component**

Create `src/renderer-simple/components/NewAppForm.tsx`:

```typescript
import React, { useState } from 'react'
import * as styles from './NewAppForm.styles'

interface Props {
  onStart: (name: string, description: string) => void
  onCancel: () => void
}

export function NewAppForm({ onStart, onCancel }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const canSubmit = name.trim().length > 0 && description.trim().length > 0

  return (
    <div style={styles.container}>
      <div style={styles.title}>Create a new app</div>

      <label style={styles.label}>App name</label>
      <input
        style={styles.input}
        placeholder="e.g. customer-feedback"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />

      <label style={styles.label}>Describe what you want to build</label>
      <textarea
        style={styles.textarea}
        placeholder="e.g. A simple page where customers can submit feedback with their name and a message. Show a list of recent feedback entries."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div style={styles.buttonRow}>
        <button style={styles.cancelButton} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...styles.startButton, opacity: canSubmit ? 1 : 0.5 }}
          onClick={() => canSubmit && onStart(name.trim(), description.trim())}
          disabled={!canSubmit}
        >
          Start Building
        </button>
      </div>
    </div>
  )
}
```

**Step 3: Wire into App.tsx**

Update the `new-app` case in `src/renderer-simple/App.tsx` to render `NewAppForm` instead of the placeholder. The `onStart` handler should call `agent:spawn` via IPC and transition to the app view. For now, just log and go back to dashboard:

```typescript
import { NewAppForm } from './components/NewAppForm'

// In the App component, replace the new-app placeholder:
if (view.kind === 'new-app') {
  return (
    <NewAppForm
      onCancel={() => setView({ kind: 'dashboard' })}
      onStart={(name, description) => {
        // TODO: spawn agent session in Task 12
        console.log('Starting app:', name, description)
        setView({ kind: 'dashboard' })
      }}
    />
  )
}
```

**Step 4: Verify in dev mode**

Run: `npm run dev`
Expected: Clicking "New App" shows the form. Fill in fields, click "Start Building", returns to dashboard.

**Step 5: Commit**

```bash
git add src/renderer-simple/
git commit -m "feat: add NewAppForm component for simple mode"
```

---

### Task 11: Build the AppView (Chat + Preview) component

> **Note:** The PreviewPane reuses the existing `WebPreview` component from `src/renderer/components/WebPreview.tsx` (merged in PR #134). This gives us a production-ready webview with toolbar, reload, error handling, and crash recovery for free. The `useWebPreview` hook pattern is also reused. No custom preview component needed.

**Files:**
- Create: `src/renderer-simple/components/AppView.tsx`
- Create: `src/renderer-simple/components/AppView.styles.ts`
- Create: `src/renderer-simple/components/ChatPane.tsx`
- Create: `src/renderer-simple/components/ChatPane.styles.ts`
- Create: `src/renderer-simple/components/ChatMessage.tsx`
- Create: `src/renderer-simple/components/ChatMessage.styles.ts`
- Create: `src/renderer-simple/components/PreviewPane.tsx` (thin wrapper around existing `WebPreview`)
- Create: `src/renderer-simple/components/StatusBanner.tsx`
- Create: `src/renderer-simple/hooks/useChat.ts`
- Create: `src/renderer-simple/hooks/usePreview.ts`
- Modify: `src/renderer-simple/App.tsx`

**Step 1: Create useChat hook**

Create `src/renderer-simple/hooks/useChat.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { ChatMessage } from '@shared/simple-types'

export function useChat(sessionId: string | null): {
  messages: ChatMessage[]
  sendMessage: (text: string) => void
} {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    if (!sessionId) return
    // Load existing messages
    window.electronAPI.invoke('simple:chat-messages', sessionId).then((msgs) => {
      setMessages(msgs as ChatMessage[])
    })
    // Listen for new messages
    const unsub = window.electronAPI.on('simple:chat-message', (msg: unknown) => {
      const chatMsg = msg as ChatMessage
      if (chatMsg.sessionId === sessionId) {
        setMessages(prev => [...prev, chatMsg])
      }
    })
    return unsub
  }, [sessionId])

  const sendMessage = useCallback((text: string) => {
    if (!sessionId) return
    window.electronAPI.invoke('agent:input', sessionId, text + '\n')
    // Optimistically add the user message
    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      sessionId,
      role: 'user',
      text,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
  }, [sessionId])

  return { messages, sendMessage }
}
```

**Step 2: Create ChatMessage component**

Create `src/renderer-simple/components/ChatMessage.styles.ts`:

```typescript
import type { CSSProperties } from 'react'

export const wrapper: (isUser: boolean) => CSSProperties = (isUser) => ({
  display: 'flex',
  justifyContent: isUser ? 'flex-end' : 'flex-start',
  marginBottom: 12,
})

export const bubble: (isUser: boolean) => CSSProperties = (isUser) => ({
  maxWidth: '80%',
  padding: '12px 16px',
  borderRadius: 16,
  fontSize: 15,
  lineHeight: 1.5,
  background: isUser ? 'var(--accent)' : 'var(--surface)',
  color: isUser ? '#fff' : 'var(--text)',
  border: isUser ? 'none' : '1px solid var(--border)',
})
```

Create `src/renderer-simple/components/ChatMessage.tsx`:

```typescript
import React from 'react'
import type { ChatMessage as ChatMessageType } from '@shared/simple-types'
import * as styles from './ChatMessage.styles'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div style={styles.wrapper(isUser)}>
      <div style={styles.bubble(isUser)}>{message.text}</div>
    </div>
  )
}
```

**Step 3: Create ChatPane component**

Create `src/renderer-simple/components/ChatPane.styles.ts`:

```typescript
import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

export const messages: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 20,
}

export const inputRow: CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: 16,
  borderTop: '1px solid var(--border)',
}

export const input: CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  fontSize: 15,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  outline: 'none',
}

export const sendButton: CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '12px 20px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}
```

Create `src/renderer-simple/components/ChatPane.tsx`:

```typescript
import React, { useState, useRef, useEffect } from 'react'
import type { ChatMessage as ChatMessageType } from '@shared/simple-types'
import { ChatMessage } from './ChatMessage'
import * as styles from './ChatPane.styles'

interface Props {
  messages: ChatMessageType[]
  onSend: (text: string) => void
}

export function ChatPane({ messages, onSend }: Props): React.JSX.Element {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = (): void => {
    if (input.trim()) {
      onSend(input.trim())
      setInput('')
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.messages}>
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Tell the agent what to change..."
        />
        <button style={styles.sendButton} onClick={handleSend}>Send</button>
      </div>
    </div>
  )
}
```

**Step 4: Create PreviewPane (thin wrapper around existing WebPreview)**

Create `src/renderer-simple/components/PreviewPane.tsx` — reuses the existing `WebPreview` component from the developer renderer, which already has webview toolbar, reload, error handling, and crash recovery:

```typescript
import React from 'react'
import { WebPreview } from '../../renderer/components/WebPreview'

interface Props {
  url: string | null
}

export function PreviewPane({ url }: Props): React.JSX.Element {
  if (!url) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: 'var(--text-muted)', fontSize: 16,
        background: 'var(--surface)',
      }}>
        Preview will appear here once the app is running...
      </div>
    )
  }

  return <WebPreview url={url} />
}
```

**Step 5: Create usePreview hook (reuses existing pattern)**

Create `src/renderer-simple/hooks/usePreview.ts` — follows the same pattern as `useWebPreview` from the developer renderer but simplified for the simple UI:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'

interface PreviewUrlEvent {
  sessionId: string
  url: string
}

export function usePreview(sessionId: string | null): {
  previewUrl: string | null
  liveUrl: string | null
  setLiveUrl: (url: string) => void
} {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const previewUrlRef = useRef(previewUrl)
  previewUrlRef.current = previewUrl

  useEffect(() => {
    setPreviewUrl(null)
    setLiveUrl(null)
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const unsub = window.electronAPI.on('preview:url-detected', (event: unknown) => {
      const e = event as PreviewUrlEvent
      if (e.sessionId === sessionId && !previewUrlRef.current) {
        setPreviewUrl(e.url)
      }
    })
    return unsub
  }, [sessionId])

  return {
    previewUrl: liveUrl ?? previewUrl,
    liveUrl,
    setLiveUrl: useCallback((url: string) => setLiveUrl(url), []),
  }
}
```

**Step 6: Create StatusBanner**

Create `src/renderer-simple/components/StatusBanner.tsx`:

```typescript
import React from 'react'
import type { AppStatus } from '@shared/simple-types'

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: 'Ready',
  scaffolding: 'Setting up project...',
  building: 'Building your app...',
  previewing: 'Preview ready',
  deploying: 'Deploying...',
  live: 'Live',
  error: 'Something went wrong',
}

const STATUS_COLORS: Record<AppStatus, string> = {
  idle: 'var(--text-muted)',
  scaffolding: 'var(--accent)',
  building: 'var(--accent)',
  previewing: 'var(--success)',
  deploying: 'var(--warning)',
  live: 'var(--success)',
  error: 'var(--error)',
}

interface Props {
  status: AppStatus
  onBack: () => void
  onDeploy?: () => void
  onDevMode?: () => void
}

export function StatusBanner({ status, onBack, onDeploy, onDevMode }: Props): React.JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 16px',
      borderBottom: '1px solid var(--border)',
      gap: 12,
    }}>
      <button onClick={onBack} style={{
        background: 'transparent', border: 'none', color: 'var(--text-muted)',
        cursor: 'pointer', fontSize: 14,
      }}>
        Back
      </button>
      <span style={{
        fontSize: 13, fontWeight: 600, color: STATUS_COLORS[status],
      }}>
        {STATUS_LABELS[status]}
      </span>
      <div style={{ flex: 1 }} />
      {onDevMode && (
        <button onClick={onDevMode} style={{
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '6px 12px', fontSize: 12,
          color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          Developer View
        </button>
      )}
      {onDeploy && status === 'previewing' && (
        <button onClick={onDeploy} style={{
          background: 'var(--success)', color: '#fff', border: 'none',
          borderRadius: 'var(--radius)', padding: '6px 16px', fontSize: 13,
          fontWeight: 600, cursor: 'pointer',
        }}>
          Deploy
        </button>
      )}
    </div>
  )
}
```

**Step 7: Create AppView container**

Create `src/renderer-simple/components/AppView.styles.ts`:

```typescript
import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
}

export const splitPane: CSSProperties = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
}

export const chatSide: CSSProperties = {
  width: '40%',
  borderRight: '1px solid var(--border)',
}

export const previewSide: CSSProperties = {
  flex: 1,
}
```

Create `src/renderer-simple/components/AppView.tsx`:

```typescript
import React from 'react'
import type { AppStatus } from '@shared/simple-types'
import type { ChatMessage as ChatMessageType } from '@shared/simple-types'
import { StatusBanner } from './StatusBanner'
import { ChatPane } from './ChatPane'
import { PreviewPane } from './PreviewPane'
import * as styles from './AppView.styles'

interface Props {
  status: AppStatus
  messages: ChatMessageType[]
  previewUrl: string | null
  onSendMessage: (text: string) => void
  onBack: () => void
  onDeploy: () => void
  onDevMode: () => void
}

export function AppView({
  status, messages, previewUrl,
  onSendMessage, onBack, onDeploy, onDevMode,
}: Props): React.JSX.Element {
  return (
    <div style={styles.container}>
      <StatusBanner
        status={status}
        onBack={onBack}
        onDeploy={onDeploy}
        onDevMode={onDevMode}
      />
      <div style={styles.splitPane}>
        <div style={styles.chatSide}>
          <ChatPane messages={messages} onSend={onSendMessage} />
        </div>
        <div style={styles.previewSide}>
          <PreviewPane url={previewUrl} />
        </div>
      </div>
    </div>
  )
}
```

**Step 8: Wire AppView into App.tsx**

Update `src/renderer-simple/App.tsx` to render `AppView` when `view.kind === 'app'`. Uses both `useChat` and the new `usePreview` hook (which listens for `preview:url-detected` from the existing web preview feature):

```typescript
import { AppView } from './components/AppView'
import { useChat } from './hooks/useChat'
import { usePreview } from './hooks/usePreview'

// Inside App component, for the app view:
if (view.kind === 'app') {
  return (
    <AppViewWrapper
      app={view.app}
      onBack={() => setView({ kind: 'dashboard' })}
    />
  )
}

// Create a wrapper component to use hooks per-app:
function AppViewWrapper({ app, onBack }: { app: SimpleApp; onBack: () => void }): React.JSX.Element {
  const { messages, sendMessage } = useChat(app.sessionId)
  const { previewUrl } = usePreview(app.sessionId)

  return (
    <AppView
      status={app.status}
      messages={messages}
      previewUrl={previewUrl}
      onSendMessage={sendMessage}
      onBack={onBack}
      onDeploy={() => { /* TODO: Task 12 */ }}
      onDevMode={() => { /* TODO: mode switch in later task */ }}
    />
  )
}
```

**Step 9: Verify in dev mode**

Run: `npm run dev`
Expected: Dashboard shows, can navigate to app view (shows chat + preview layout).

**Step 10: Commit**

```bash
git add src/renderer-simple/
git commit -m "feat: add AppView with ChatPane, reused WebPreview, and StatusBanner"
```

---

### Task 12: Wire up the full New App → Agent → Chat flow

**Files:**
- Modify: `src/renderer-simple/App.tsx`
- Modify: `src/main/ipc/simple-handlers.ts`

**Step 1: Update App.tsx onStart handler to spawn an agent session**

In `src/renderer-simple/App.tsx`, update the `onStart` callback from `NewAppForm`:

```typescript
const handleStartApp = async (name: string, description: string): Promise<void> => {
  // For now, use the first available project. Later this can be smarter.
  const projects = await window.electronAPI.invoke('projects:list') as Array<{ id: string }>
  if (projects.length === 0) {
    // TODO: auto-create project or show error
    return
  }
  const projectId = projects[0].id

  const session = await window.electronAPI.invoke('agent:spawn', {
    projectId,
    runtimeId: 'claude',
    prompt: description,
    branchName: name,
  }) as { id: string; branchName: string; worktreePath: string; status: string }

  const newApp: SimpleApp = {
    sessionId: session.id,
    projectId,
    name,
    description,
    status: 'building',
    previewUrl: null,
    liveUrl: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  setView({ kind: 'app', app: newApp })
  refreshApps()
}
```

**Step 2: Subscribe to agent output in simple-handlers and forward as chat messages**

In `src/main/ipc/simple-handlers.ts`, add logic to subscribe to PTY output and push chat messages to the renderer:

```typescript
import { BrowserWindow } from 'electron'

export function registerSimpleHandlers(deps: IpcDependencies): void {
  const { chatAdapter, sessionManager } = deps

  // When a new agent output arrives, process it through ChatAdapter
  // and push the chat message to the renderer
  ipcMain.handle('simple:subscribe-chat', (_event, sessionId: string) => {
    chatAdapter.onMessage(sessionId, (msg) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.webContents.send('simple:chat-message', msg)
      }
    })
    return true
  })

  // ... keep existing handlers
}
```

**Step 3: Verify end-to-end**

Run: `npm run dev`
Expected: Create a new app from the form → agent spawns → chat messages appear as the agent works.

**Step 4: Commit**

```bash
git add src/renderer-simple/App.tsx src/main/ipc/simple-handlers.ts
git commit -m "feat: wire new app flow to spawn agent and stream chat messages"
```

---

### Task 13: Add mode switching (Simple ↔ Developer)

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/simple.ts`
- Modify: `src/renderer-simple/components/StatusBanner.tsx`

**Step 1: Add IPC handler for mode switching**

In `src/main/index.ts`, add a handler that updates settings and reloads the window:

```typescript
ipcMain.handle('app:switch-mode', (_event, mode: 'developer' | 'simple') => {
  settingsStore.updateSettings({ uiMode: mode })
  if (mainWindow) {
    const isSimple = mode === 'simple'
    mainWindow.webPreferences.preload = join(__dirname, isSimple ? '../preload/simple.js' : '../preload/index.js')
    loadRenderer(mainWindow, isSimple)
  }
})
```

**Step 2: Add the channel to both preloads**

Add `'app:switch-mode'` to `ALLOWED_INVOKE_CHANNELS` in both `src/preload/index.ts` and `src/preload/simple.ts`.

**Step 3: Wire the "Developer View" button**

In the `AppViewWrapper` in `App.tsx`, implement `onDevMode`:

```typescript
onDevMode={() => {
  window.electronAPI.invoke('app:switch-mode', 'developer')
}}
```

**Step 4: Add "Simple View" button to the developer UI**

This will be a small addition to the existing developer renderer (e.g. in the menu or settings). For now, add the IPC channel to the developer preload so it's available. The UI button can be added later.

**Step 5: Verify mode switching**

Run: `npm run dev`
Expected: Click "Developer View" in simple mode → window reloads into developer UI. Can switch back via settings or `app:switch-mode` IPC.

**Step 6: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/preload/simple.ts src/renderer-simple/
git commit -m "feat: add mode switching between simple and developer UI"
```

---

### Task 14: Add tsconfig for simple renderer and fix typecheck

**Files:**
- Modify: `tsconfig.json`
- Create: `tsconfig.simple.json`

**Step 1: Create tsconfig.simple.json**

Create `tsconfig.simple.json` covering `src/renderer-simple/` and `src/shared/`:

```json
{
  "extends": "./tsconfig.web.json",
  "include": ["src/renderer-simple/**/*", "src/shared/**/*"],
  "compilerOptions": {
    "rootDir": "src"
  }
}
```

**Step 2: Add to project references**

In `tsconfig.json`, add the new reference:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" },
    { "path": "./tsconfig.simple.json" }
  ]
}
```

**Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS — no type errors in any project

**Step 4: Commit**

```bash
git add tsconfig.json tsconfig.simple.json
git commit -m "feat: add tsconfig for simple renderer and wire into project references"
```

---

### Task 15: Run full test suite and fix any issues

**Files:**
- Possibly various test files

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds, both renderers output to `out/`

**Step 4: Fix any failures**

Address any test failures, type errors, or build issues discovered.

**Step 5: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve test/type/build issues from simple mode integration"
```

---

## Summary

| Task | What it builds |
|------|---------------|
| 1 | `uiMode` setting |
| 2 | Simple-mode preload |
| 3 | Electron-vite multi-renderer config + HTML/React entry |
| 4 | Mode-based renderer loading in main process |
| 5 | Shared simple-mode types |
| 6 | ChatAdapter (PTY → chat messages) |
| 7 | DeploymentManager (GitHub workflow orchestration) |
| 8 | Simple-mode IPC handlers |
| 9 | Dashboard + AppCard components |
| 10 | NewAppForm component |
| 11 | AppView (Chat + Preview split pane) |
| 12 | End-to-end New App → Agent → Chat wiring |
| 13 | Mode switching (Simple ↔ Developer) |
| 14 | TypeScript config for simple renderer |
| 15 | Full test suite + build verification |
