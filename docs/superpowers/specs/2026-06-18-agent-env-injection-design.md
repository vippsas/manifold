# Agent environment injection from `~/.manifold/agent.env`

**Date:** 2026-06-18
**Status:** Design — pending implementation

## Problem

Manifold spawns AI agents (Codex, Claude, …) as child PTY processes. The child
environment is built in `PtyPool.spawn` (`src/main/agent/pty-pool.ts:35`):

```ts
const env = { ...process.env, COLORTERM, FORCE_COLOR, ...(options.env ?? {}) }
```

so agents inherit Manifold's own `process.env` plus whatever the caller passes as
`options.env` (which is `runtime.env`). For the built-in runtimes
(`src/main/agent/runtimes.ts`) `runtime.env` is `undefined`.

When Manifold is launched as a macOS GUI app (Dock/Spotlight → launchd), its
`process.env` does **not** contain variables exported by the user's interactive
shell startup (`~/.zshrc`), because no interactive shell ever ran for it. A user
who keeps a provider key in `.env` and exports it via `~/.zshrc` therefore sees
their terminal tabs work (they spawn `/bin/zsh -il`, which sources `~/.zshrc`)
while agent panes fail — e.g. Codex against an Azure provider reports:

```
Missing environment variable: `AZURE_OPENAI_API_KEY`.
```

The agent's model/provider config (a file Codex reads) is correct; only the
*environment variable* the provider resolves at runtime is absent.

## Goal

Let Manifold inject environment variables into the agents it spawns, read from a
Manifold-owned dotenv file, without requiring the user to put secrets into the
macOS launchd session or to launch Manifold from a terminal.

## Non-goals

- No per-project / per-runtime env files (YAGNI — a single global file solves the
  reported problem and generalizes). Per-project support can be added later.
- No new setting, IPC surface, or UI. (Manifold `CLAUDE.md` §2: no configurability
  that wasn't requested.)
- No change to terminal/shell PTYs — those already source `~/.zshrc` via the
  `createManifoldZdotdir` shim (`src/main/session/shell-prompt.ts`).
- Not a secrets manager; the file is plain text owned by the user, same trust
  level as their existing `.env`.

## Design

### New module: `src/main/agent/agent-env.ts`

```ts
// Pure parser — no I/O. Same stripping semantics as the user's load-env.sh:
// skip blank lines and `#` comments, split on the first `=`, trim surrounding
// whitespace, strip one matching pair of single or double quotes.
export function parseEnvFile(contents: string): Record<string, string>

// Default path matches the existing store convention (homedir()/.manifold).
export function agentEnvFilePath(): string   // ~/.manifold/agent.env

// Reads the file fresh on each call (agent spawns are infrequent, so edits take
// effect without an app restart). Returns {} when the file is absent or
// unreadable. Never logs values. The optional filePath keeps unit/spawn-site
// tests deterministic (no dependence on a real ~/.manifold/agent.env).
export function loadAgentEnv(filePath?: string): Record<string, string>

// Merge helper used at the spawn sites. File values are overridden by any
// runtime-specific env (currently none), and themselves override process.env
// via the existing pty-pool merge. Returns undefined when there is nothing to
// inject, preserving today's `env: undefined` so spawns are unchanged when no
// agent.env exists. The optional filePath is for tests only.
export function agentSpawnEnv(
  runtimeEnv?: Record<string, string>,
  filePath?: string,
): Record<string, string> | undefined
//   const merged = { ...loadAgentEnv(filePath), ...(runtimeEnv ?? {}) }
//   return Object.keys(merged).length > 0 ? merged : undefined
```

**Path:** `path.join(os.homedir(), '.manifold', 'agent.env')`, matching
`view-state-store.ts`, `dock-layout-store.ts`, and `debug-log.ts`, which all use
`homedir()/.manifold`.

**Parser semantics (`parseEnvFile`):**
- Ignore blank lines and lines whose first non-whitespace char is `#`.
- Split on the first `=`; key = left side trimmed, value = right side.
- Trim whitespace around the value, then strip a single surrounding `"…"` or
  `'…'` pair.
- Lines without `=`, or with an empty key, are ignored.
- `=` characters inside the value are preserved (only the first `=` splits).

### Wiring (the four agent-spawn sites)

Each currently passes `env: runtime.env`; change to `env: agentSpawnEnv(runtime.env)`:

| Site | File:line | Spawn |
|------|-----------|-------|
| Interactive / first message | `src/main/session/session-creator.ts:147` | `this.ptyPool.spawn(commandBinary, runtimeArgs, …)` |
| Resume | `src/main/session/session-resume.ts:55` | `ptyPool.spawn(runtime.binary, runtimeArgs, …)` |
| Print-mode follow-up | `src/main/app/dev-server-manager.ts:190` | `this.ptyPool.spawn(simpleCommand.binary, …)` |
| Slash-command probe (claude) | `src/main/app/dev-server-manager.ts:227` | `this.ptyPool.spawn(command.binary, …)` |

`PtyPool.spawn` is unchanged; it keeps doing `{ ...process.env, ...options.env }`,
so the merged agent env layers on top of `process.env` exactly as `runtime.env`
would have.

### Data flow

```
~/.manifold/agent.env ──parseEnvFile──▶ {AZURE_OPENAI_API_KEY, …}
                                          │  agentSpawnEnv(runtime.env)
spawn site: env = agentSpawnEnv(...) ─────┘
                                          ▼
PtyPool.spawn: { ...process.env, COLORTERM, FORCE_COLOR, ...env }
                                          ▼
                                  codex / claude inherit the key
```

### Error handling

- Missing / unreadable file → `loadAgentEnv` returns `{}` (no throw, no log). Agent
  spawn behaves exactly as today.
- Malformed lines are skipped individually; a bad line never aborts the parse.
- Values are never written to `debugLog` (which today logs only a truncated
  `PATH`). The presence of a key may be logged by count, never by value.

### Security

- The file is user-owned plain text, same trust level as the existing `.env`.
- Recommended one-time setup reuses the user's single source of truth:
  ```bash
  ln -s ~/.codex-switch/.env ~/.manifold/agent.env
  ```
- No secret enters the launchd session env or Manifold's persisted config.

## Testing (vitest, TDD)

New `src/main/agent/agent-env.test.ts`:
- `parseEnvFile`: basic `K=V`; double- and single-quoted values; surrounding
  whitespace; `#` comment and blank lines; `=` inside the value; empty/`=`-less
  lines ignored.
- `loadAgentEnv(tmpPath)`: reads a temp file; returns `{}` for a missing path;
  returns `{}` for an empty file.
- `agentSpawnEnv`: file values present; `runtimeEnv` overrides file; returns
  `undefined` when the file is missing and no `runtimeEnv`; returns `runtimeEnv`
  when there is no file.

Spawn-site tests stay deterministic because the loader path is a parameter
(default `agentEnvFilePath()`); site tests assert that the spawn receives the
merged env without depending on a real `~/.manifold/agent.env`.

## Rollout / verification

1. Implement + unit tests green; `tsc`/lint clean.
2. Manual: `ln -s ~/.codex-switch/.env ~/.manifold/agent.env`, restart Manifold,
   open a Codex agent against the Azure provider, confirm no "Missing environment
   variable" error and the agent responds.
3. Confirm terminal tabs are unaffected (still source `~/.zshrc`).

## Affected files

- New: `src/main/agent/agent-env.ts`, `src/main/agent/agent-env.test.ts`
- Edited (one line each): `session-creator.ts`, `session-resume.ts`,
  `dev-server-manager.ts` (two sites)
