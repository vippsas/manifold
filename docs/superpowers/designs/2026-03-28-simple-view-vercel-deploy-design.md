# Simple View: Vercel Deployment for Non-Developers

**Date:** 2026-03-28
**Status:** Approved
**Approach:** Hybrid — Manifold handles prerequisites, agent deploys

## Problem

Non-developers using Manifold's Simple View can build apps through chat and preview them locally, but have no way to deploy them to the public web. The `simple:deploy` IPC handler is a stub. The deploy button in the UI is a no-op.

## Solution

Add a one-click deploy-to-Vercel flow in Simple View. Manifold handles system-level concerns (CLI installation, Vercel authentication via GitHub OAuth). The agent handles the actual deployment (runs `vercel deploy --prod`). The URL is detected from agent output and surfaced in both chat and the StatusBanner.

## Deploy Flow

1. **User clicks "Deploy"** in StatusBanner (visible when app preview is running)
2. **Manifold checks CLI readiness** — main process runs `vercel --version` and `vercel whoami`
3. **Setup modal (one-time, if needed):**
   - CLI missing → auto-install via `npm i -g vercel` (spinner, no user action)
   - Not authenticated → modal with "Continue with GitHub" button → runs `vercel login --github` → browser opens for OAuth
   - If user doesn't have a Vercel account, Vercel creates one automatically during GitHub OAuth
4. **Agent deploys** — Manifold sends deploy instruction to agent PTY stdin
5. **URL detection** — StatusDetector pattern-matches `https://[\w-]+\.vercel\.app` from agent output
6. **UI update** — Chat shows "Your app is live at [URL]". StatusBanner transitions to "Live" state with persistent URL.

## Setup Modal

Two sequential states, shown only on first deploy:

### State 1: CLI Installation
- Shown when `vercel --version` fails (command not found)
- Automatic — runs `npm i -g vercel` with a spinner
- No user action required
- Transitions to State 2 if not authenticated, or closes if auth is already present

### State 2: Authentication
- Shown when `vercel whoami` fails (not logged in)
- Displays Vercel logo, explanation text: "Sign in to deploy your app to the web. If you don't have an account, one will be created for you."
- Primary action: "Continue with GitHub" button (GitHub logo + text)
- Secondary: "Cancel" link
- Clicking "Continue with GitHub" runs `vercel login --github` which opens the default browser
- Modal monitors for auth completion (polls `vercel whoami`), then auto-closes and starts deploy

## StatusBanner States

| State | Appearance | Actions |
|-------|------------|---------|
| Preview Running | Green dot, "Preview running" | Stop, **Deploy ▲** |
| Deploying | Purple spinner, "Deploying to Vercel..." | (disabled) |
| Live | Green dot, "Live at [url]" as clickable link | Copy URL, Open ↗ |
| Live + Redeploy | Green dot, "Live at [url]" | Open ↗, **Redeploy ▲** |
| Failed | Red ✕, "Deploy failed — check chat for details" | Retry |

The Deploy button is disabled while `deployStatus === 'deploying'` to prevent double-deploys.

## Deploy Triggers

- **Primary:** "Deploy ▲" button in StatusBanner (critical for discoverability by non-developers)
- **Secondary:** User types "deploy my app" or similar in chat — agent picks it up naturally via existing CLAUDE.md instructions

## Data Model Changes

**SimpleApp type** (`simple-types.ts`) — add:
```typescript
deployUrl?: string                              // persisted Vercel production URL
deployStatus?: 'deploying' | 'live' | 'failed'  // current deploy state
```

Both fields persist across app restarts (stored via existing SimpleApp persistence).

## IPC Changes

| Channel | Type | Purpose |
|---------|------|---------|
| `simple:deploy` | invoke | Triggers deploy flow: health check → modal → agent message |
| `simple:deploy-status` | listen | Pushes deploy status changes (`deploying`, `live`, `failed`) + URL to renderer |

Checklist per CLAUDE.md: handler in `simple-handlers.ts`, whitelist in `preload/simple.ts`, renderer hook call.

## New Main Process Module: VercelHealthCheck

Location: `src/main/deploy/vercel-health-check.ts`

```
isCliInstalled(): Promise<boolean>    — runs `vercel --version`
isAuthenticated(): Promise<boolean>   — runs `vercel whoami`
installCli(): Promise<void>           — runs `npm i -g vercel`, throws on failure
login(): Promise<void>                — runs `vercel login --github`, polls `whoami` for completion
```

All commands use `execFile` from `node:child_process` (promisified via `node:util`), following the same pattern as `PrCreator` (`src/main/git/pr-creator.ts`). Uses `execFile` not `exec` to prevent shell injection.

The `login()` method spawns `vercel login --github` (which opens the browser), then polls `vercel whoami` every 2 seconds for up to 120 seconds. Returns successfully when `whoami` returns a username. Throws on timeout.

## StatusDetector Extension

Add a URL detection pattern to the existing StatusDetector:

- Pattern: `https://[\w-]+\.vercel\.app`
- Event: new event type `deploy:url-detected` with the matched URL
- Trigger: sets `deployStatus: 'live'` and persists `deployUrl` on the SimpleApp

## Agent Deploy Message

When prerequisites pass, Manifold writes to the agent's PTY stdin:

```
Deploy this application to Vercel production using `vercel deploy --prod --yes`.
Report the production URL when complete.
```

The `--yes` flag skips Vercel's interactive setup prompts (critical for non-interactive agent use).

## Error Handling

### CLI installation fails
- Cause: npm not found, permissions error, network issue
- UX: Modal shows error message: "Couldn't install Vercel CLI. You may need to install Node.js first."
- Recovery: Deploy aborted, no agent message sent. Deploy button remains available.

### Auth flow fails or cancelled
- User closes browser / clicks Cancel → modal closes, nothing happens, Deploy button stays available
- `vercel login --github` times out → modal shows "Sign-in timed out. Try again?"
- Recovery: User can click Deploy again at any time.

### Agent deploy fails
- Agent output contains error details → visible in chat naturally
- StatusDetector pattern-matches Vercel error patterns (`Error:`, `Build failed`) → sets `deployStatus: 'failed'`
- StatusBanner shows error state with "Retry" button
- Retry re-triggers the same flow, skipping setup since CLI is already ready.

## Out of Scope (v1)

- Custom domains (Vercel assigns `*.vercel.app` automatically)
- Environment variables UI
- Deploy history / rollback
- Vercel dashboard deep links
- Multiple deploy targets (Netlify, Cloudflare, etc.)
- Vercel team/org selection (deploys to personal account)
