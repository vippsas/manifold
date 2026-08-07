---
description: The AI runtimes layer and PTY pool — the runtime registry, command building (interactive vs print-mode), theme/ANSI sync, and the process boundary the session subsystem spawns into.
covers: [src/main/agent]
updated: 2026-07-31
owner: see .github/CODEOWNERS
---

# Agent — AI runtimes and the PTY process boundary

This subsystem is the seam between Manifold and the external agent CLIs (Claude Code,
Codex, Copilot, Gemini, Ollama-backed variants). It owns the static **runtime registry**
(binary + base args + status patterns per agent), the **command builders** that turn a
runtime + prompt into a concrete `binary`/`args`/`env` for interactive or print mode, the
theme/working-set arg helpers, and `PtyPool` — the thin wrapper over `node-pty` that every
long-running agent process is spawned through. The *session* subsystem (`src/main/session`)
calls into here; this layer holds no session state of its own and is pure given its inputs.

## Covered code

- `src/main/agent/runtimes.ts` — `BUILT_IN_RUNTIMES` registry, `getRuntimeById()`, `listRuntimes()`, `listRuntimesWithStatus()` (binary-presence probe via `which`).
- `src/main/agent/pty-pool.ts` — `PtyPool`: `spawn`/`write`/`kill`/`resize`/`onData`/`onExit`/`pushOutput`/`killAll`. The process boundary.
- `src/main/agent/simple-runtime.ts` — `buildSimpleRuntimeCommand()`: print-mode (`-p`) args + output mode per runtime, for chat/simple sessions, with any workspace folders spliced in ahead of the prompt.
- `src/main/agent/ai-runtime-command.ts` — `buildAiRuntimeCommand()` / `parseAiRuntimeOutput()` / `parseAiRuntimeFailure()`: one-shot prompts for git/commit helpers.
- `src/main/agent/ai-runtime-output-parsers.ts` — per-format extractors (`extractClaudeText`, `extractCodexText`, `extractSlashCommands`, failure extractors, `dedupeTexts`).
- `src/main/agent/claude-theme-args.ts` — `claudeAnsiThemeArgs()`: maps Manifold's light/dark theme to Claude Code's `--settings` ANSI theme.
- `src/main/agent/working-set-args.ts` — `buildWorkingSetArgs()`: per-runtime `--add-dir`/`--include-directories` flags for workspace agents.
- `src/main/agent/status-detector.ts` — `detectStatus()`: maps recent PTY output to an `AgentStatus` using per-runtime regex patterns.
- `src/main/agent/ollama-models.ts` — `listOllamaModels()`: parses `ollama list`.
- `src/main/agent/ai-prompt.ts` — `runAiPrompt()`: stdin-fed one-shot child process (used by memory compression).
- `src/main/agent/chat-adapter.ts` — `ChatAdapter` + `stripAnsi`/`parseOptions`: turns raw PTY chunks into persisted `ChatMessage`s. `clearSession(id, true, storageKey)` also removes persisted history when agent settings intentionally replace an agent with a fresh session, including a discovered session whose chat has not yet been opened.

## How it works

**The registry.** `BUILT_IN_RUNTIMES` (`runtimes.ts:4`) is a frozen array of `AgentRuntime`
(`src/shared/types.ts:1`) — each has an `id`, a `binary`, base `args`, an optional
`aiModelArgs` (the small model used for non-chat helper prompts), an optional `waitingPattern`,
and an optional `needsModel`. The six entries today: `claude`, `codex`, `copilot`, `gemini`,
and the two `ollama-*` variants (`binary: 'ollama'`, `args: ['launch', …]`, `needsModel: true`).
`getRuntimeById()` (`runtimes.ts:54`) is the single resolver everyone calls.
`listRuntimesWithStatus()` (`runtimes.ts:70`) decorates each entry with `installed` by running
`which <binary>` — that flag drives the settings UI and picks a usable runtime for memory
compression.

**Command building has three shapes.** They differ by *who* consumes the output:

1. *Interactive* (the persistent TUI) — there is no builder here; `SessionCreator` starts from
   `runtime.args` and appends the helper flags below, then spawns directly
   (`session-creator.ts:110`).
2. *Print mode / chat* — `buildSimpleRuntimeCommand(runtimeId, prompt, additionalDirs)`
   (`simple-runtime.ts:18`).
   Claude gets `--permission-mode bypassPermissions -p <prompt> --output-format stream-json --verbose`
   (`outputMode: 'claude-stream-json'`); Codex gets `exec --dangerously-bypass-approvals-and-sandbox
   --json <prompt>` (`'codex-jsonl'`); everything else gets `-p <prompt>` (`'plain-text'`). A
   workspace's extra folders can't be appended after the fact here — `-p` takes the prompt and
   Codex's `exec` takes it positionally — so this builder splices `buildWorkingSetArgs` in ahead
   of the prompt itself (`simple-runtime.ts:27`).
3. *One-shot helper* — `buildAiRuntimeCommand(runtime, prompt, extraArgs)` (`ai-runtime-command.ts:20`),
   used by git/commit-message generation. Claude uses `--output-format text` (`'plain-text'`),
   Codex uses `exec --full-auto --json` and splits `--search` into a *global* flag ahead of `exec`
   (`splitCodexExtraArgs`, `ai-runtime-command.ts:79`). Its companions
   `parseAiRuntimeOutput`/`parseAiRuntimeFailure` (`:94`, `:122`) walk the chosen output mode line by
   line, delegating to the extractors in `ai-runtime-output-parsers.ts`, dedupe, and return the last
   text (or a best-effort failure string from stderr/stdout).

**Per-runtime arg helpers** are appended by the *session* layer onto interactive args, not by a
builder here:
- `buildWorkingSetArgs(runtimeId, additionalDirs)` (`working-set-args.ts:6`) — workspace agents
  span multiple repos. Claude takes a variadic `--add-dir`; Codex/Copilot repeat `--add-dir` per
  dir; Gemini uses one comma-joined `--include-directories`. Empty input returns `[]`.
- `claudeAnsiThemeArgs(themeType)` (`claude-theme-args.ts:9`) — Claude Code paints its own colors
  and ignores the terminal palette **except** for its `light-ansi`/`dark-ansi` themes, which render
  through the 16-color palette. This returns `['--settings', JSON.stringify({ theme })]`, a
  high-precedence merge layer that preserves the user's other settings. Applied only for interactive
  Claude (`session-creator.ts:130`).
- Ollama models: when `needsModel`, the session layer pushes `--model <ollamaModel>`
  (`session-creator.ts:118`, mirrored on resume at `session-resume.ts:48`); `listOllamaModels()`
  (`ollama-models.ts:3`) feeds the model picker.

**PtyPool.** `spawn(file, args, { cwd, env, cols, rows })` (`pty-pool.ts:20`) mints a UUID id,
spawns an `xterm-256color` PTY (default 80×24), and returns `{ id, pid }`. Two env decisions are
load-bearing (`pty-pool.ts:26`): it advertises `COLORTERM=truecolor` + `FORCE_COLOR=3` and deletes
inherited `NO_COLOR` so themed agents emit color regardless of the host shell (#395); and it deletes
`CLAUDECODE` so a Manifold launched *from inside* Claude Code doesn't trip nested-session detection.
Listeners are fan-out arrays — `onData`/`onExit` push callbacks that `wireListeners`
(`pty-pool.ts:73`) invokes for every chunk/exit; on exit the entry is deleted from the map.
`pushOutput` (`pty-pool.ts:111`) injects text into the *listener* stream without writing to the
process (used for shell ghost suggestions and resumed-session welcome banners). `kill`/`killAll`
terminate; missing-id lookups throw for `write`/`resize`/`onData`/`onExit` but no-op for `kill`.
`kill` (`pty-pool.ts:123`) sends node-pty's default signal, drops the entry from the active map,
and parks the handle in `pendingKills` with a grace timer; if `onExit` hasn't fired after the
grace period it escalates to `SIGKILL` so a child that traps/ignores the default signal can't
linger as a zombie (#502).

**Status detection.** `detectStatus(output, runtimeId)` inspects the last
2000 chars against per-runtime regexes (`RUNTIME_PATTERNS`, `status-detector.ts:15`) plus the
runtime's `waitingPattern` (split on `|`, escaped) and common error patterns; Codex gets a dedicated
prompt-block heuristic (`hasCodexInteractivePrompt`). The Allow/Deny/Yes/No prompt regex is
word-boundary anchored so substrings like "yesterday"/"denying" don't falsely mark a session
waiting, and the compiled pattern set is memoized per runtime (`getPatternsForRuntime`) rather than
rebuilt on every chunk (#511). Anything with no match is `'running'`.

## Key types and entry points

- `AgentRuntime` — `src/shared/types.ts:1`. `{ id, name, binary, args?, aiModelArgs?, waitingPattern?, env?, installed?, needsModel? }`.
- `getRuntimeById(id)` — `runtimes.ts:54`. The universal resolver; consumers across `session`, `git`, `search`, `memory`, `plugins` start here.
- `PtyPool` — `pty-pool.ts:17`. Instantiated once in `src/main/app/index.ts:57`; handed to the session manager and dev-server manager.
- `buildSimpleRuntimeCommand(runtimeId, prompt, additionalDirs?)` — `simple-runtime.ts:18`. Print-mode args (working-set flags included) + `SimpleRuntimeOutputMode`.
- `buildAiRuntimeCommand(runtime, prompt, extraArgs)` — `ai-runtime-command.ts:20`. One-shot helper command; pair with `parseAiRuntimeOutput`/`parseAiRuntimeFailure`.
- `claudeAnsiThemeArgs(themeType)` / `buildWorkingSetArgs(runtimeId, dirs)` — `claude-theme-args.ts:9` / `working-set-args.ts:6`. Interactive arg adornments.
- `detectStatus(output, runtimeId)` — `status-detector.ts:85`. Output → `AgentStatus`.

## Interactions

- **Session** (`src/main/session`): `SessionCreator` resolves the runtime, assembles interactive args (base + working-set + theme, or `buildSimpleRuntimeCommand` for chat), and calls `PtyPool.spawn` (`session-creator.ts:110`); `session-resume.ts` re-spawns and re-adds `--model` for Ollama; the stream wirer subscribes via `PtyPool.onData`/`onExit` and uses `detectStatus`; shell suggestions use `PtyPool.pushOutput`.
- **App** (`src/main/app`): `index.ts:57` owns the single `PtyPool`; `dev-server-manager.ts` builds chat follow-up commands with `buildSimpleRuntimeCommand` (`:190`, `:231`) and reads `extractSlashCommands` to probe a runtime's `/` menu.
- **Git** (`src/main/git/git-operations.ts:127`): `aiGenerate` uses `buildAiRuntimeCommand` + the parse helpers for commit-message/PR text, passing `runtime.aiModelArgs`.
- **IPC** (`src/main/ipc`): `settings-handlers.ts` exposes `listRuntimesWithStatus`/`listOllamaModels`; `git-handlers.ts`/`project-handlers.ts` resolve runtimes via `getRuntimeById`.
- **Memory / Search / Plugins / Background-agent-host**: all resolve runtimes through `getRuntimeById` and reuse `aiModelArgs`; memory compression additionally uses `runAiPrompt` (`ai-prompt.ts`) and `listRuntimesWithStatus` to pick an installed helper runtime.

## Invariants & gotchas

- **The registry is static and the source of truth.** No custom/user runtimes today; `getRuntimeById` returns `undefined` for unknown ids and callers must guard (e.g. `simple-runtime.ts:14` throws). Adding an agent means a new `BUILT_IN_RUNTIMES` entry plus, usually, a `RUNTIME_PATTERNS` block and a `buildWorkingSetArgs` case.
- **Output mode is bound to the binary+flags, not chosen freely.** Claude must run with `--output-format stream-json` to yield `claude-stream-json`; Codex `--json` yields `codex-jsonl`; anything else is `plain-text`. Parsers key off these strings — changing the flag without the mode (or vice versa) silently drops all parsed text.
- **PTY env mutations are deliberate, not incidental.** Removing the `CLAUDECODE` delete reintroduces nested-session refusals; removing the `NO_COLOR`/`COLORTERM`/`FORCE_COLOR` handling collapses themed agents to a single foreground color on some hosts (#395). Both are documented inline in `pty-pool.ts`.
- **Theme args are interactive-Claude-only.** `claudeAnsiThemeArgs` is appended only when `commandBinary === 'claude'` and the session is interactive (`session-creator.ts:130`) — print-mode output isn't a themed TUI and other CLIs reject `--settings`.
- **PtyPool listeners are fan-out and never auto-removed.** Multiple `onData`/`onExit` callbacks coexist for one PTY and only clear when the process exits; there is no `off()`. `pushOutput` reaches listeners but bypasses the child process entirely.
