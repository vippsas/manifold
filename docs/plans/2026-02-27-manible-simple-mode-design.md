# Manible: Simple Mode for Non-Technical Users

## Problem

Non-technical people at Vipps cannot create and deploy applications today. The current flow requires Backstage, GitHub workflows, IDEs, Dockerfiles, and Kubernetes knowledge. Manifold's developer UI is too complex for this audience.

## Solution

A separate "Simple Mode" renderer within Manifold that lets non-technical users describe what they want in natural language, see a live preview, and deploy to AKS — all without touching code or infrastructure.

## Architecture

The Electron app gets a second renderer entry point. Both renderers share the same main process (SessionManager, PtyPool, WorktreeManager, etc.). On first launch, the user chooses their mode. The choice is stored in `~/.manifold/config.json`.

```
┌─────────────────────────────────────┐
│          Electron Main Process       │
│  SessionManager, PtyPool, Worktree  │
│  GitOps, Runtimes, SettingsStore    │
│  + DeploymentManager                │
│           │              │          │
│     ┌─────┘              └─────┐    │
│     ▼                          ▼    │
│  Preload A                Preload B │
│  (dev channels)      (simple channels)│
│     │                          │    │
└─────┼──────────────────────────┼────┘
      ▼                          ▼
  Developer UI              Simple UI
  (existing)             (new: Manible)
  src/renderer/          src/renderer-simple/
```

Key decisions:
- Separate renderer entry point via electron-vite (not a mode toggle in the existing renderer)
- Preload B exposes a smaller set of IPC channels
- Both renderers can operate on the same session data, enabling mode switching
- Agent is auto-selected (Claude Code) — no agent picker in the simple UI
- Reuses the existing web preview feature (PR #134): `WebPreview` component, `url-detector.ts`, and `preview:url-detected` IPC channel — no custom preview implementation needed

## User Flow

### Dashboard

A clean grid of app cards. Each card shows app name, status badge (Building / Deploying / Live / Error), a thumbnail, and last updated timestamp. A prominent "New App" button.

### New App

1. User clicks "New App"
2. Simple form: app name + text area ("Describe what you want to build")
3. User clicks "Start"

### App View (Chat + Preview)

Split pane:
- Left: Chat — conversational messages from the agent, text input at bottom for refinement
- Right: Preview — embedded webview showing local dev server while building, switches to deployed AKS URL once live

### What the User Sees

Friendly chat messages: "Setting up your project...", "Here's a first version", "Your app is live at https://..."

### What the User Never Sees

Terminal output, file trees, code, git branches, Dockerfiles, k8s config, agent selection.

### Mode Switching

Users can switch to the full developer UI at any time via a "Developer View" button. The developer UI picks up the same session. A "Simple View" button in the developer UI switches back.

## New Main Process Modules

### DeploymentManager

Orchestrates the end-to-end pipeline:
1. Triggers VippsService GitHub workflow (via `gh` CLI) to scaffold the repo
2. Polls workflow status until repo is created
3. Clones repo into a worktree via WorktreeManager
4. Spawns Claude Code in that worktree with a crafted system prompt
5. Agent generates webapp code + Dockerfile, commits, pushes
6. On user "Deploy" action, triggers the deployment workflow
7. Polls until deployment completes, reports live URL

### ChatAdapter

Sits between PTY output and the simple renderer. Parses agent terminal output and translates it into structured chat messages (text, status updates, progress indicators).

## Simple Renderer Structure

Located at `src/renderer-simple/`.

### Components

| Component | Purpose |
|---|---|
| `Dashboard` | Grid of app cards, "New App" button |
| `AppCard` | Single app: name, status badge, thumbnail, last updated |
| `NewAppForm` | App name + description textarea + "Start" button |
| `AppView` | Split pane container for chat + preview |
| `ChatPane` | Scrolling message list + text input at bottom |
| `ChatMessage` | Single message bubble (agent or user) |
| `PreviewPane` | Embedded webview (local dev server or deployed URL) |
| `StatusBanner` | Top bar: Building / Deploying / Live / Error |
| `DevModeToggle` | Switch to full developer UI |

### Hooks

- `useApps()` — list of apps with status
- `useChat(sessionId)` — messages and send function
- `usePreview(sessionId)` — local dev URL or deployed URL
- `useDeployment(sessionId)` — deployment status and actions

### Styling

Clean, friendly aesthetic. Big type, whitespace, no technical jargon. Co-located `*.styles.ts` files.

## Deployment Pipeline

```
User clicks "Start"
  → DeploymentManager triggers VippsService GitHub workflow
  → Polls until repo is scaffolded
  → WorktreeManager clones repo into worktree
  → SessionManager spawns Claude Code with system prompt
  → Agent generates code + Dockerfile, commits, pushes
  → Local dev server starts → preview pane shows it
  → User refines via chat, agent iterates
  → User clicks "Deploy"
  → DeploymentManager triggers deployment workflow
  → Polls until deployed
  → Preview switches to live AKS URL
```

## Scope (v1)

### Included
- Single tech stack: basic webapp
- One agent: Claude Code (auto-selected)
- Deployment via existing VippsService GitHub workflow
- Local preview via embedded webview
- Deploy button triggers deployment workflow
- Mode switching between simple and developer UI

### Deferred
- Database support
- Terraform / custom Azure resources
- Multiple tech stacks
- Collaboration / multi-user
- Custom domains
