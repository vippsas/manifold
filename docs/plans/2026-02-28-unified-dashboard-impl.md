# Unified Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the simple view's Dashboard and NewAppForm into a single unified view with an always-visible create form at the top and app cards grid below.

**Architecture:** Inline the create form into the Dashboard component as a top section. Remove the `new-app` view state from App.tsx. Delete the standalone NewAppForm component.

**Tech Stack:** React, TypeScript, Electron renderer (simple mode)

---

### Task 1: Update Dashboard.styles.ts — Add create section styles, remove unused styles

**Files:**
- Modify: `src/renderer-simple/components/Dashboard.styles.ts`

**Step 1: Replace the styles file**

Replace the full contents of `Dashboard.styles.ts` with:

```typescript
import type { CSSProperties } from 'react'

export const container: CSSProperties = {
  padding: 40,
  maxWidth: 960,
  margin: '0 auto',
}

export const createSection: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 24,
  marginBottom: 40,
}

export const createTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 12,
}

export const techStackRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  marginBottom: 20,
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--text-muted)',
}

export const techItem: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

export const techDot: CSSProperties = {
  opacity: 0.4,
}

export const formRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-end',
}

export const fieldGroup: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

export const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 6,
}

export const input: CSSProperties = {
  padding: '10px 14px',
  fontSize: 14,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  outline: 'none',
  width: 200,
}

export const descriptionInput: CSSProperties = {
  padding: '10px 14px',
  fontSize: 14,
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  outline: 'none',
  flex: 1,
}

export const startButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

export const sectionTitle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginBottom: 20,
  color: 'var(--text-muted)',
}

export const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 20,
}
```

**Step 2: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: May fail (Dashboard.tsx still references old styles). That's fine — we fix it next.

**Step 3: Commit**

```bash
git add src/renderer-simple/components/Dashboard.styles.ts
git commit -m "refactor: update Dashboard styles for unified create+cards layout"
```

---

### Task 2: Rewrite Dashboard.tsx — Embed create form at top

**Files:**
- Modify: `src/renderer-simple/components/Dashboard.tsx`

**Step 1: Replace Dashboard.tsx with the unified component**

```tsx
import React, { useState } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import { AppCard } from './AppCard'
import { ConfirmDialog } from './ConfirmDialog'
import { techStackIcons } from './tech-stack-icons'
import * as styles from './Dashboard.styles'

function Spinner(): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  )
}

function TechIcon({ path, color, size = 14 }: { path: string; color: string; size?: number }): React.JSX.Element {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path d={path} />
    </svg>
  )
}

interface Props {
  apps: SimpleApp[]
  onStart: (name: string, description: string) => void
  onSelectApp: (app: SimpleApp) => void
  onDeleteApp: (app: SimpleApp) => Promise<void>
}

export function Dashboard({ apps, onStart, onSelectApp, onDeleteApp }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [appToDelete, setAppToDelete] = useState<SimpleApp | null>(null)

  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && !loading

  const handleStart = (): void => {
    if (!canSubmit) return
    setLoading(true)
    onStart(name.trim(), description.trim())
  }

  return (
    <div style={styles.container}>
      {/* Create Section */}
      <div style={styles.createSection}>
        <div style={styles.createTitle}>Create a new app</div>
        <div style={styles.techStackRow}>
          {techStackIcons.map((tech, i) => (
            <React.Fragment key={tech.label}>
              {i > 0 && <span style={styles.techDot}>&middot;</span>}
              <span style={styles.techItem}>
                <TechIcon path={tech.path} color={tech.color} />
                <span>{tech.label}</span>
              </span>
            </React.Fragment>
          ))}
        </div>
        <div style={styles.formRow}>
          <div style={styles.fieldGroup}>
            <label style={styles.fieldLabel}>App name</label>
            <input
              style={styles.input}
              placeholder="e.g. customer-feedback"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div style={{ ...styles.fieldGroup, flex: 1 }}>
            <label style={styles.fieldLabel}>Describe what you want to build</label>
            <input
              style={styles.descriptionInput}
              placeholder="e.g. A feedback page where customers submit their name and a message"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart() }}
            />
          </div>
          <button
            style={{ ...styles.startButton, opacity: canSubmit ? 1 : 0.5 }}
            onClick={handleStart}
            disabled={!canSubmit}
          >
            {loading ? <><Spinner /> Setting up...</> : 'Start Building'}
          </button>
        </div>
      </div>

      {/* App Grid */}
      {apps.length > 0 && (
        <>
          <div style={styles.sectionTitle}>My Apps</div>
          <div style={styles.grid}>
            {apps.map((app) => (
              <AppCard
                key={app.sessionId}
                app={app}
                onClick={() => onSelectApp(app)}
                onDelete={() => setAppToDelete(app)}
              />
            ))}
          </div>
        </>
      )}

      {appToDelete && (
        <ConfirmDialog
          title={`Delete ${appToDelete.name}?`}
          message={`This will remove the app and its files at ${appToDelete.projectPath}. This cannot be undone.`}
          onConfirm={async () => {
            await onDeleteApp(appToDelete)
            setAppToDelete(null)
          }}
          onCancel={() => setAppToDelete(null)}
        />
      )}
    </div>
  )
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: May fail on App.tsx (still passes `onNewApp` instead of `onStart`). Fixed in next task.

**Step 3: Commit**

```bash
git add src/renderer-simple/components/Dashboard.tsx
git commit -m "feat: embed create form into Dashboard as top section"
```

---

### Task 3: Update App.tsx — Remove new-app view state, wire new props

**Files:**
- Modify: `src/renderer-simple/App.tsx`

**Step 1: Rewrite App.tsx**

The key changes:
- Remove `{ kind: 'new-app' }` from `View` type
- Remove `NewAppForm` import
- Move the app-creation logic from `onStart` into the Dashboard prop
- Replace `onNewApp` with `onStart`

```tsx
import React, { useState, useLayoutEffect } from 'react'
import { Dashboard } from './components/Dashboard'
import { AppView } from './components/AppView'
import { useApps } from './hooks/useApps'
import { useAgentStatus } from './hooks/useAgentStatus'
import { useChat } from './hooks/useChat'
import { usePreview } from './hooks/usePreview'
import { buildSimplePrompt } from '../shared/simple-prompts'
import type { SimpleApp } from '../shared/simple-types'
import { loadTheme, migrateLegacyTheme } from '../shared/themes/registry'
import { applyThemeCssVars } from '../shared/themes/adapter'
import type { ConvertedTheme } from '../shared/themes/types'

/** Apply theme CSS vars + alias the developer-view names to simple-mode names */
function applySimpleThemeVars(theme: ConvertedTheme): void {
  const vars = theme.cssVars
  applyThemeCssVars(vars)
  const root = document.documentElement
  root.style.setProperty('--bg', vars['--bg-primary'])
  root.style.setProperty('--surface', vars['--bg-secondary'])
  root.style.setProperty('--text', vars['--text-primary'])
}

function AppViewWrapper({ app, onBack }: { app: SimpleApp; onBack: () => void }): React.JSX.Element {
  const { status: agentStatus, durationMs } = useAgentStatus(app.sessionId)
  const { messages, sendMessage } = useChat(app.sessionId)
  const { previewUrl } = usePreview(app.sessionId)

  return (
    <AppView
      status={app.status}
      messages={messages}
      previewUrl={previewUrl}
      isAgentWorking={agentStatus === 'running'}
      agentDurationMs={durationMs}
      onSendMessage={sendMessage}
      onBack={onBack}
      onDeploy={() => {
        /* TODO: deployment in later task */
      }}
      onDevMode={() => {
        window.electronAPI.invoke('app:switch-mode', 'developer', app.projectId)
      }}
    />
  )
}

type View = { kind: 'dashboard' } | { kind: 'app'; app: SimpleApp }

export function App(): React.JSX.Element {
  const { apps, refreshApps, deleteApp } = useApps()
  const [view, setView] = useState<View>({ kind: 'dashboard' })

  useLayoutEffect(() => {
    let cancelled = false
    void (async () => {
      const settings = (await window.electronAPI.invoke('settings:get')) as { theme?: string }
      if (cancelled) return
      const themeId = migrateLegacyTheme(settings.theme ?? 'dracula')
      const theme = loadTheme(themeId)
      applySimpleThemeVars(theme)
      window.electronAPI.send('theme:changed', {
        type: theme.type,
        background: theme.cssVars['--bg-primary'],
      })
    })()
    return () => { cancelled = true }
  }, [])

  if (view.kind === 'app') {
    return <AppViewWrapper app={view.app} onBack={() => setView({ kind: 'dashboard' })} />
  }

  return (
    <Dashboard
      apps={apps}
      onStart={async (name, description) => {
        const project = (await window.electronAPI.invoke(
          'projects:create-new',
          `${name}: ${description}`,
        )) as { id: string; path: string }

        const session = (await window.electronAPI.invoke('agent:spawn', {
          projectId: project.id,
          runtimeId: 'claude',
          prompt: buildSimplePrompt(description),
          userMessage: description,
          noWorktree: true,
          nonInteractive: true,
        })) as { id: string; branchName: string; worktreePath: string; status: string }

        await window.electronAPI.invoke('simple:subscribe-chat', session.id)

        const newApp: SimpleApp = {
          sessionId: session.id,
          projectId: project.id,
          name,
          description,
          status: 'building',
          previewUrl: null,
          liveUrl: null,
          projectPath: project.path,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        setView({ kind: 'app', app: newApp })
        refreshApps()
      }}
      onSelectApp={(app) => setView({ kind: 'app', app })}
      onDeleteApp={(app) => deleteApp(app.sessionId, app.projectId)}
    />
  )
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — all types should align now.

**Step 3: Commit**

```bash
git add src/renderer-simple/App.tsx
git commit -m "refactor: remove new-app view state, wire create form through Dashboard"
```

---

### Task 4: Delete NewAppForm files

**Files:**
- Delete: `src/renderer-simple/components/NewAppForm.tsx`
- Delete: `src/renderer-simple/components/NewAppForm.styles.ts`

**Step 1: Remove the files**

```bash
rm src/renderer-simple/components/NewAppForm.tsx
rm src/renderer-simple/components/NewAppForm.styles.ts
```

**Step 2: Verify no stale imports**

Run: `npm run typecheck`
Expected: PASS — App.tsx no longer imports NewAppForm.

**Step 3: Commit**

```bash
git add -u src/renderer-simple/components/NewAppForm.tsx src/renderer-simple/components/NewAppForm.styles.ts
git commit -m "chore: delete unused NewAppForm component and styles"
```

---

### Task 5: Visual verification and polish

**Files:**
- Possibly tweak: `src/renderer-simple/components/Dashboard.styles.ts`

**Step 1: Run the dev server**

Run: `npm run dev`

**Step 2: Visual check**

In the simple view:
1. Verify the create form appears at the top as a card-like section
2. Verify tech stack icons display correctly with colored SVGs
3. Verify name + description inputs are side by side with "Start Building" button
4. Verify "My Apps" heading + card grid appear below when apps exist
5. Verify no "My Apps" heading when no apps exist
6. Verify creating an app: fill both fields → click Start → transitions to AppView
7. Verify delete still works: hover card → delete → confirm dialog → card removed
8. Verify the loading state: button shows spinner, inputs disable

**Step 3: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: All pass.

**Step 4: Final commit if any polish tweaks were needed**

```bash
git add -A
git commit -m "fix: polish unified dashboard layout"
```
