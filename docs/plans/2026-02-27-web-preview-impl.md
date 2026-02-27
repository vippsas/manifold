# Web Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect dev server URLs in agent PTY output and auto-open an Electron `<webview>` preview panel as a tab alongside the editor.

**Architecture:** A new `url-detector.ts` module pattern-matches PTY output for localhost URLs (same pattern as `add-dir-detector.ts`). Detection triggers a `preview:url-detected` IPC push event. The renderer's `useWebPreview` hook listens and dynamically adds a `webPreview` Dockview panel positioned within the editor group.

**Tech Stack:** Electron `<webview>`, Dockview, React hooks, IPC push channels

---

### Task 1: Create URL Detector Module

**Files:**
- Create: `src/main/url-detector.ts`
- Create: `src/main/url-detector.test.ts`

**Step 1: Write the failing test**

```typescript
// src/main/url-detector.test.ts
import { describe, it, expect } from 'vitest'
import { detectUrl } from './url-detector'

describe('detectUrl', () => {
  it('returns null for output without URLs', () => {
    expect(detectUrl('Hello world')).toBeNull()
  })

  it('detects http://localhost:3000', () => {
    const result = detectUrl('Server running at http://localhost:3000')
    expect(result).toEqual({ url: 'http://localhost:3000', port: 3000 })
  })

  it('detects http://127.0.0.1:5173', () => {
    const result = detectUrl('  ➜  Local:   http://127.0.0.1:5173/')
    expect(result).toEqual({ url: 'http://127.0.0.1:5173/', port: 5173 })
  })

  it('detects http://0.0.0.0:8080', () => {
    const result = detectUrl('Listening on http://0.0.0.0:8080')
    expect(result).toEqual({ url: 'http://0.0.0.0:8080', port: 8080 })
  })

  it('detects localhost URL without http prefix', () => {
    const result = detectUrl('Server started on localhost:4000')
    expect(result).toEqual({ url: 'http://localhost:4000', port: 4000 })
  })

  it('strips ANSI escape codes before matching', () => {
    const result = detectUrl('\x1b[32mhttp://localhost:3000\x1b[0m')
    expect(result).toEqual({ url: 'http://localhost:3000', port: 3000 })
  })

  it('strips cursor movement codes before matching', () => {
    const result = detectUrl('\x1b[1Chttp://localhost:3000')
    expect(result).toEqual({ url: 'http://localhost:3000', port: 3000 })
  })

  it('ignores port 9229 (Node debugger)', () => {
    expect(detectUrl('Debugger listening on ws://127.0.0.1:9229')).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/url-detector.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/main/url-detector.ts
const CURSOR_FORWARD = /\x1b\[\d*C/g
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

const URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})\/?[^\s]*/
const BARE_LOCALHOST_PATTERN = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/

const IGNORED_PORTS = new Set([9229])

export interface DetectedUrl {
  url: string
  port: number
}

export function detectUrl(output: string): DetectedUrl | null {
  const clean = output.replace(CURSOR_FORWARD, ' ').replace(ANSI_ESCAPE, '')

  const fullMatch = clean.match(URL_PATTERN)
  if (fullMatch) {
    const port = parseInt(fullMatch[1], 10)
    if (IGNORED_PORTS.has(port)) return null
    return { url: fullMatch[0], port }
  }

  const bareMatch = clean.match(BARE_LOCALHOST_PATTERN)
  if (bareMatch) {
    const port = parseInt(bareMatch[1], 10)
    if (IGNORED_PORTS.has(port)) return null
    return { url: `http://${bareMatch[0]}`, port }
  }

  return null
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/url-detector.test.ts`
Expected: PASS (all 8 tests)

**Step 5: Commit**

```bash
git add src/main/url-detector.ts src/main/url-detector.test.ts
git commit -m "feat: add URL detector for dev server output"
```

---

### Task 2: Wire URL Detection into SessionManager

**Files:**
- Modify: `src/main/session-manager.ts` (lines 1-10 imports, lines 343-371 wireOutputStreaming)

**Step 1: Add import and tracking field**

In `src/main/session-manager.ts`, add the import alongside the existing `detectAddDir` import (line 9):

```typescript
import { detectUrl } from './url-detector'
```

Add a `detectedUrl` field to `InternalSession` (line 16-20):

```typescript
interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
  taskDescription?: string
  detectedUrl?: string
}
```

**Step 2: Add URL detection in wireOutputStreaming**

In `wireOutputStreaming()`, after the `detectAddDir` block (after line 366), add:

```typescript
        const urlResult = detectUrl(session.outputBuffer.slice(-2000))
        if (urlResult && !session.detectedUrl) {
          session.detectedUrl = urlResult.url
          this.sendToRenderer('preview:url-detected', {
            sessionId: session.id,
            url: urlResult.url,
          })
        }
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/main/session-manager.ts
git commit -m "feat: wire URL detection into PTY output stream"
```

---

### Task 3: Add IPC Channel to Preload Whitelist

**Files:**
- Modify: `src/preload/index.ts` (line 63-74, ALLOWED_LISTEN_CHANNELS)

**Step 1: Add the channel**

Add `'preview:url-detected'` to the `ALLOWED_LISTEN_CHANNELS` array (after line 73, before the closing `] as const`):

```typescript
  'view:toggle-panel',
  'preview:url-detected',
] as const
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: whitelist preview:url-detected IPC channel"
```

---

### Task 4: Enable webviewTag in Electron BrowserWindow

**Files:**
- Modify: `src/main/index.ts` (line 113, webPreferences)

**Step 1: Add webviewTag to webPreferences**

In the `BrowserWindow` constructor's `webPreferences` object (around line 113), add `webviewTag: true`:

```typescript
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: enable webviewTag for web preview"
```

---

### Task 5: Create useWebPreview Hook

**Files:**
- Create: `src/renderer/hooks/useWebPreview.ts`

**Step 1: Create the hook**

```typescript
// src/renderer/hooks/useWebPreview.ts
import { useState, useCallback } from 'react'
import { useIpcListener } from './useIpc'

interface PreviewUrlEvent {
  sessionId: string
  url: string
}

export interface UseWebPreviewResult {
  previewUrl: string | null
  openPreview: (url: string) => void
  closePreview: () => void
}

export function useWebPreview(sessionId: string | null): UseWebPreviewResult {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useIpcListener<PreviewUrlEvent>(
    'preview:url-detected',
    useCallback(
      (event: PreviewUrlEvent) => {
        if (event.sessionId === sessionId && !previewUrl) {
          setPreviewUrl(event.url)
        }
      },
      [sessionId, previewUrl]
    )
  )

  const openPreview = useCallback((url: string) => {
    setPreviewUrl(url)
  }, [])

  const closePreview = useCallback(() => {
    setPreviewUrl(null)
  }, [])

  return { previewUrl, openPreview, closePreview }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/hooks/useWebPreview.ts
git commit -m "feat: add useWebPreview hook"
```

---

### Task 6: Create WebPreview Component

**Files:**
- Create: `src/renderer/components/WebPreview.tsx`

**Step 1: Create the component**

```tsx
// src/renderer/components/WebPreview.tsx
import React, { useRef, useCallback, useState, useEffect } from 'react'

interface WebPreviewProps {
  url: string
}

export function WebPreview({ url }: WebPreviewProps): React.JSX.Element {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const [currentUrl, setCurrentUrl] = useState(url)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCurrentUrl(url)
    setError(null)
    setLoading(true)
  }, [url])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleStartLoading = (): void => {
      setLoading(true)
      setError(null)
    }
    const handleStopLoading = (): void => setLoading(false)
    const handleFailLoad = (e: Electron.DidFailLoadEvent): void => {
      // errorCode -3 is ERR_ABORTED (navigating away before load finishes), ignore it
      if (e.errorCode !== -3) {
        setError(`Failed to load: ${e.errorDescription}`)
        setLoading(false)
      }
    }
    const handleNavigate = (e: Electron.DidNavigateEvent): void => {
      setCurrentUrl(e.url)
    }

    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('did-fail-load', handleFailLoad as EventListener)
    webview.addEventListener('did-navigate', handleNavigate as EventListener)

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('did-fail-load', handleFailLoad as EventListener)
      webview.removeEventListener('did-navigate', handleNavigate as EventListener)
    }
  }, [])

  const handleReload = useCallback(() => {
    const webview = webviewRef.current
    if (webview) {
      setError(null)
      setLoading(true)
      webview.reload()
    }
  }, [])

  const handleOpenExternal = useCallback(() => {
    void window.electronAPI.invoke('app:beep') // placeholder — could open in browser
    window.open(currentUrl, '_blank')
  }, [currentUrl])

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.url} title={currentUrl}>{currentUrl}</span>
        <div style={styles.actions}>
          {loading && <span style={styles.loading}>Loading...</span>}
          <button onClick={handleReload} style={styles.button} title="Reload">
            &#x21bb;
          </button>
          <button onClick={handleOpenExternal} style={styles.button} title="Open in browser">
            &#x2197;
          </button>
        </div>
      </div>
      {error ? (
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button onClick={handleReload} style={styles.retryButton}>Retry</button>
        </div>
      ) : (
        <webview
          ref={webviewRef as React.Ref<Electron.WebviewTag>}
          src={currentUrl}
          style={styles.webview}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-primary)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    gap: '8px',
    flexShrink: 0,
  },
  url: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    fontFamily: 'monospace',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  loading: {
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  button: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px 4px',
    borderRadius: '3px',
  },
  webview: {
    flex: 1,
    border: 'none',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '12px',
    color: 'var(--text-muted)',
  },
  errorText: {
    fontSize: '12px',
    margin: 0,
  },
  retryButton: {
    padding: '4px 16px',
    fontSize: '12px',
    color: 'var(--bg-primary)',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/components/WebPreview.tsx
git commit -m "feat: add WebPreview component with webview and toolbar"
```

---

### Task 7: Register Panel and Wire into App

**Files:**
- Modify: `src/renderer/components/dock-panels.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Add WebPreviewPanel to dock-panels.tsx**

Add import at the top of `dock-panels.tsx`:

```typescript
import { WebPreview } from './WebPreview'
```

Add `previewUrl` to `DockAppState` interface (after line 66):

```typescript
  // Web preview
  previewUrl: string | null
```

Add the panel function (after `ProjectsPanel`, before the closing of the file):

```typescript
function WebPreviewPanel(): React.JSX.Element {
  const s = useDockState()
  if (!s.previewUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '12px' }}>
        No preview available
      </div>
    )
  }
  return <WebPreview url={s.previewUrl} />
}
```

Add to `PANEL_COMPONENTS` (after `projects: ProjectsPanel`):

```typescript
  webPreview: WebPreviewPanel,
```

**Step 2: Wire useWebPreview in App.tsx**

Add import at the top of `App.tsx`:

```typescript
import { useWebPreview } from './hooks/useWebPreview'
```

After the `useDockLayout` call (around line 44), add:

```typescript
  const webPreview = useWebPreview(activeSessionId)
```

Add an effect to dynamically add/remove the webPreview panel. Place it after the `useEffect` for `view:toggle-panel` (around line 52):

```typescript
  // Auto-open web preview panel when a URL is detected
  useEffect(() => {
    const api = dockLayout.apiRef.current
    if (!api) return

    if (webPreview.previewUrl) {
      // Add panel if not already present
      if (!api.getPanel('webPreview')) {
        const editorPanel = api.getPanel('editor')
        api.addPanel({
          id: 'webPreview',
          component: 'webPreview',
          title: 'Preview',
          position: editorPanel
            ? { referencePanel: editorPanel, direction: 'within' }
            : undefined,
        })
      }
    }
  }, [webPreview.previewUrl, dockLayout.apiRef])
```

Add `previewUrl` to the `dockState` object (around line 213, before the closing `}`):

```typescript
    // Web preview
    previewUrl: webPreview.previewUrl,
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Run all tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/components/dock-panels.tsx src/renderer/App.tsx
git commit -m "feat: register web preview panel and auto-open on URL detection"
```

---

### Task 8: Manual Integration Test

**Step 1: Start dev mode**

Run: `npm run dev`

**Step 2: Test the feature**

1. Create an agent session with a task that starts a dev server (e.g., "Create a React app and start the dev server")
2. Verify that when the agent's terminal output contains a localhost URL, a "Preview" tab appears alongside the editor
3. Verify the webview loads the URL
4. Verify the reload and open-in-browser buttons work
5. Verify closing the Preview tab does not break other panels
6. Verify switching sessions clears the preview state
7. Verify the existing layout (agent, editor, file tree, shell, projects) is unaffected

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration test adjustments for web preview"
```
