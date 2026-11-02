---
description: How selected dormant interactive agents resume when their repo's session list arrives, without duplicate attempts.
covers: [src/renderer/hooks/agent-session/useAgentSession.ts, src/renderer/hooks/agent-session/useAutoResume.ts]
updated: 2026-11-02
owner: see .github/CODEOWNERS
---

# Agent auto-resume

`useAgentSession` owns the current repo's session list and invokes `useAutoResume`
with that list and the selected id (`src/renderer/hooks/agent-session/useAgentSession.ts:76`,
`:95`). A workspace tab selection also selects its agent's repo in the same batch
(`src/renderer/hooks/app/useWorkspaceEntry.ts:38`). The selected id can therefore arrive
before its session is in the current list. Loading the destination repo preserves that
explicit selection, so the id need not change when the list arrives
(`src/renderer/hooks/agent-session/useAgentSession.ts:39`, `:50`).

Discovery also exposes `settledProjectId` for startup auto-selection after success or
failure. Failed requests preserve the loaded session list and `loadedProjectId`, so they
introduce no sessions to auto-resume (`src/renderer/hooks/agent-session/useAgentSession.ts:164`,
`:153`, `:159`).

`useAutoResume` observes both the selected id and the session list. It leaves a
selection pending while its session is absent, then handles it once the session appears
(`src/renderer/hooks/agent-session/useAutoResume.ts:12`, `:43`). It marks the selection
handled before checking eligibility: only `status: 'done'`, `pid: null` sessions with a
runtime and without `nonInteractive` can resume. A selected running agent that later
exits therefore stays dormant, and rerenders or session resyncs cannot restart it
(`useAutoResume.ts:23`).

The handled flag survives StrictMode effect replay. An in-flight set additionally
prevents another request if the user selects away and back before the earlier request
settles (`useAutoResume.ts:9`, `:26`, `:28`). A successful `agent:resume` reply replaces
the matching session. Failure leaves the session dormant without retrying on resync;
a later selection can try again (`useAutoResume.ts:31`, `:36`, `:40`).

## Offline verification

- `src/renderer/hooks/app/useWorkspaceEntry.navigation.test.tsx:126` drives real dockview
  tab activation and workspace-card entry with a held destination `agent:sessions`
  reply, checking zero resumes before loading and one afterwards. Only the preload
  boundary is faked.
- `src/renderer/hooks/agent-session/useAutoResume.test.tsx:30` covers eligibility guards,
  StrictMode replay, exit while selected, reselection during resume, failure and retry,
  and same-repo selection with stale `agent:sessions-changed` replies.

These checks do not launch a CLI or prove watcher activation in the live app. Restarting
the macOS app and clicking a dormant cross-repo tab in a multi-repo workspace remains a
live verification step.
