# Token-usage view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface token usage + turn count per session, per runtime, in the Statistics panel — captured from Claude's records and finalized into each session's verdict at session end.

**Architecture:** Two capture sources converge on `VerdictRecorder.onSessionTerminated`, which writes `tokenUsage` + `turns` into `VerdictMetrics`. Interactive Claude usage is read from its on-disk JSONL transcript (located via a `--session-id` we now pass); chat-mode usage is accumulated live from the `result` stream-json event. The Statistics plugin sums the new metrics per runtime.

**Tech Stack:** TypeScript, Node (main), React (plugin webview), vitest.

## Global Constraints

- Tokens only — **no cost/dollar estimation, no budget warnings** (deferred follow-up).
- Coverage: Claude interactive + chat-mode. Codex/other runtimes → n/a (no fields written).
- New `VerdictMetrics` fields are **optional** — backward-compatible with existing `verdicts.json`.
- Capture timing: **session end only**. Never throw into the lifecycle path (wrap reads in `safe`/try-catch).
- A "turn" = one human prompt→response cycle. Tool calls/results inside one response are not turns.
- Real gates: `npm run typecheck:web`, `npm run typecheck:node`, `npm test` (vitest). Worktree: `npm install` first (already done).
- Max 300 LOC per touched file; match existing style; surgical changes only.

---

### Task 1: Extend shared verdict types

**Files:**
- Modify: `src/shared/verdict-types.ts:18-24`
- Modify: `src/shared/plugins/api-types.ts:7`
- Modify: `src/shared/plugins/manifold-module.d.ts:10,13`

**Interfaces:**
- Produces: `TokenUsage { inputTokens; outputTokens; cacheReadTokens; cacheCreationTokens }`; `VerdictMetrics.tokenUsage?: TokenUsage`; `VerdictMetrics.turns?: number`.

- [ ] **Step 1: Add the type + fields** in `src/shared/verdict-types.ts`, replacing the `VerdictMetrics` interface:

```ts
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface VerdictMetrics {
  agentCommits: number
  humanEdits: number
  diffLines: { added: number; removed: number }
  filesChanged: number
  prUrl?: string
  /** Token usage for the session; absent when the runtime exposes none (n/a). */
  tokenUsage?: TokenUsage
  /** Human prompt→response cycles in the session; absent when unknown (n/a). */
  turns?: number
}
```

- [ ] **Step 2: Re-export `TokenUsage` to plugins.** In `src/shared/plugins/api-types.ts:7`, add `TokenUsage` to the re-export:

```ts
export type { TaskPrompt, TokenUsage, VerdictMetrics, VerdictOutcome, VerdictRecord } from '../verdict-types'
```

- [ ] **Step 3: Thread `TokenUsage` through the plugin module shim.** In `src/shared/plugins/manifold-module.d.ts`, add `TokenUsage` to BOTH the import list (line 10) and the `export type` list (line 13), next to `VerdictMetrics`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: PASS (node baseline ~10 errors unchanged, web=0). No new `error TS`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/verdict-types.ts src/shared/plugins/api-types.ts src/shared/plugins/manifold-module.d.ts
git commit -m "feat(#728): add optional tokenUsage + turns to VerdictMetrics"
```

---

### Task 2: Transcript usage reader (interactive Claude)

**Files:**
- Create: `src/main/session/transcript-usage-reader.ts`
- Test: `src/main/session/transcript-usage-reader.test.ts`

**Interfaces:**
- Consumes: `TokenUsage` from `../../shared/verdict-types`.
- Produces:
  - `interface SessionUsage { tokenUsage: TokenUsage; turns: number }`
  - `encodeClaudeProjectDir(absPath: string): string`
  - `readClaudeTranscriptUsage(opts: { claudeProjectsDir: string; worktreePath: string; sessionId: string }): Promise<SessionUsage | null>`

**Background (verified against real transcripts):** Each assistant entry is `{ type: 'assistant', message: { id, usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } } }`. **Entries are duplicated** — the same `message.id` appears multiple times (≈half were dupes in a real file), so usage MUST be deduped by `message.id`. A turn is a `{ type: 'user' }` entry whose `message.content` is a string (human prompt); `tool_result` user entries have an **array** `content` and are not turns; `isMeta`/`isSidechain` entries are excluded.

- [ ] **Step 1: Write the failing test** at `src/main/session/transcript-usage-reader.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { encodeClaudeProjectDir, readClaudeTranscriptUsage } from './transcript-usage-reader'

function line(obj: unknown): string { return JSON.stringify(obj) }

function assistant(id: string, u: Partial<Record<string, number>>): string {
  return line({ type: 'assistant', message: { id, usage: {
    input_tokens: u.input ?? 0, output_tokens: u.output ?? 0,
    cache_read_input_tokens: u.cr ?? 0, cache_creation_input_tokens: u.cc ?? 0,
  } } })
}
const humanTurn = (text: string) => line({ type: 'user', message: { role: 'user', content: text } })
const toolResult = () => line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } })

describe('encodeClaudeProjectDir', () => {
  it('replaces slashes and dots with dashes', () => {
    expect(encodeClaudeProjectDir('/Users/sv/.manifold/wt/foo-3'))
      .toBe('-Users-sv--manifold-wt-foo-3')
  })
})

describe('readClaudeTranscriptUsage', () => {
  let dir: string
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tx-')) })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  async function writeTranscript(worktreePath: string, sessionId: string, lines: string[]): Promise<void> {
    const projDir = path.join(dir, encodeClaudeProjectDir(worktreePath))
    await fs.mkdir(projDir, { recursive: true })
    await fs.writeFile(path.join(projDir, `${sessionId}.jsonl`), lines.join('\n') + '\n')
  }

  it('sums usage deduped by message.id and counts human turns', async () => {
    const wt = '/Users/sv/wt/foo'
    await writeTranscript(wt, 'sid-1', [
      humanTurn('hello'),
      assistant('a1', { input: 100, output: 10, cr: 5, cc: 2 }),
      assistant('a1', { input: 100, output: 10, cr: 5, cc: 2 }), // duplicate id — must not double count
      toolResult(),
      assistant('a2', { input: 50, output: 20, cr: 0, cc: 0 }),
      humanTurn('again'),
      assistant('a3', { input: 7, output: 3, cr: 1, cc: 1 }),
    ])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-1' })
    expect(r).toEqual({
      tokenUsage: { inputTokens: 157, outputTokens: 33, cacheReadTokens: 6, cacheCreationTokens: 3 },
      turns: 2,
    })
  })

  it('skips malformed lines, returns zeros-with-turns for a prompt-only file', async () => {
    const wt = '/Users/sv/wt/bar'
    await writeTranscript(wt, 'sid-2', ['not json', humanTurn('hi')])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-2' })
    expect(r).toEqual({ tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, turns: 1 })
  })

  it('returns null when no transcript exists for the session id', async () => {
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: '/Users/sv/wt/none', sessionId: 'missing' })
    expect(r).toBeNull()
  })

  it('falls back to scanning project dirs when the encoded dir does not match', async () => {
    const wt = '/Users/sv/wt/scan'
    // Write under an unrelated dir name to force the scan path.
    const projDir = path.join(dir, 'some-other-encoding')
    await fs.mkdir(projDir, { recursive: true })
    await fs.writeFile(path.join(projDir, 'sid-3.jsonl'), assistant('a1', { input: 5, output: 1 }) + '\n')
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-3' })
    expect(r?.tokenUsage.inputTokens).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/session/transcript-usage-reader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/main/session/transcript-usage-reader.ts`:

```ts
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import type { TokenUsage } from '../../shared/verdict-types'

export interface SessionUsage {
  tokenUsage: TokenUsage
  turns: number
}

/** Default Claude transcript root: ~/.claude/projects. */
export function claudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

/** Claude encodes a project's cwd into a dir name by replacing every non-alphanumeric char with '-'. */
export function encodeClaudeProjectDir(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Read per-session token usage + turn count from Claude's on-disk JSONL transcript. */
export async function readClaudeTranscriptUsage(opts: {
  claudeProjectsDir: string
  worktreePath: string
  sessionId: string
}): Promise<SessionUsage | null> {
  const file = await locateTranscript(opts)
  if (!file) return null
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
  return parseTranscriptUsage(raw)
}

async function locateTranscript(opts: {
  claudeProjectsDir: string
  worktreePath: string
  sessionId: string
}): Promise<string | null> {
  const fileName = `${opts.sessionId}.jsonl`
  const direct = path.join(opts.claudeProjectsDir, encodeClaudeProjectDir(opts.worktreePath), fileName)
  if (await exists(direct)) return direct
  // Fallback: encoding can vary, but the session id is unique — scan project dirs.
  let entries: string[]
  try {
    entries = await fs.readdir(opts.claudeProjectsDir)
  } catch {
    return null
  }
  for (const entry of entries) {
    const candidate = path.join(opts.claudeProjectsDir, entry, fileName)
    if (await exists(candidate)) return candidate
  }
  return null
}

function parseTranscriptUsage(raw: string): SessionUsage {
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  const seen = new Set<string>()
  let turns = 0
  for (const lineText of raw.split('\n')) {
    const trimmed = lineText.trim()
    if (!trimmed) continue
    let e: Record<string, unknown>
    try { e = JSON.parse(trimmed) } catch { continue }
    if (e.type === 'assistant') {
      const message = e.message as { id?: string; usage?: Record<string, number> } | undefined
      const id = message?.id
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      const u = message?.usage
      if (u) {
        usage.inputTokens += u.input_tokens ?? 0
        usage.outputTokens += u.output_tokens ?? 0
        usage.cacheReadTokens += u.cache_read_input_tokens ?? 0
        usage.cacheCreationTokens += u.cache_creation_input_tokens ?? 0
      }
    } else if (e.type === 'user' && isHumanTurn(e)) {
      turns += 1
    }
  }
  return { tokenUsage: usage, turns }
}

/** A human turn: a user entry whose message.content is a string, excluding meta/sidechain rows. */
function isHumanTurn(e: Record<string, unknown>): boolean {
  if (e.isMeta === true || e.isSidechain === true) return false
  const message = e.message as { content?: unknown } | undefined
  return typeof message?.content === 'string'
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/transcript-usage-reader.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/session/transcript-usage-reader.ts src/main/session/transcript-usage-reader.test.ts
git commit -m "feat(#728): read interactive Claude token usage from transcript"
```

---

### Task 3: Live usage accumulator (chat-mode)

**Files:**
- Create: `src/main/session/session-usage-accumulator.ts`
- Test: `src/main/session/session-usage-accumulator.test.ts`

**Interfaces:**
- Consumes: `TokenUsage` from `../../shared/verdict-types`; `SessionUsage` from `./transcript-usage-reader`.
- Produces: `class SessionUsageAccumulator` with:
  - `recordTurn(sessionId: string, usage: Partial<TokenUsage>): void` — add usage + increment turns by 1.
  - `take(sessionId: string): SessionUsage | null` — return totals and clear; null if nothing recorded.

- [ ] **Step 1: Write the failing test** `src/main/session/session-usage-accumulator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SessionUsageAccumulator } from './session-usage-accumulator'

describe('SessionUsageAccumulator', () => {
  it('accumulates usage across turns and counts each turn', () => {
    const acc = new SessionUsageAccumulator()
    acc.recordTurn('s1', { inputTokens: 100, outputTokens: 10 })
    acc.recordTurn('s1', { inputTokens: 50, outputTokens: 5, cacheReadTokens: 3 })
    expect(acc.take('s1')).toEqual({
      tokenUsage: { inputTokens: 150, outputTokens: 15, cacheReadTokens: 3, cacheCreationTokens: 0 },
      turns: 2,
    })
  })

  it('take() clears the session and returns null on the second call', () => {
    const acc = new SessionUsageAccumulator()
    acc.recordTurn('s1', { inputTokens: 1 })
    expect(acc.take('s1')).not.toBeNull()
    expect(acc.take('s1')).toBeNull()
  })

  it('returns null for an unknown session', () => {
    expect(new SessionUsageAccumulator().take('nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/session/session-usage-accumulator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `src/main/session/session-usage-accumulator.ts`:

```ts
import type { TokenUsage } from '../../shared/verdict-types'
import type { SessionUsage } from './transcript-usage-reader'

interface Entry {
  usage: TokenUsage
  turns: number
}

/**
 * Per-session token/turn accumulator for chat-mode (print-mode) Claude turns.
 * Lives independently of InternalSession so it survives session teardown; the
 * verdict recorder drains it at termination via `take`.
 */
export class SessionUsageAccumulator {
  private readonly entries = new Map<string, Entry>()

  recordTurn(sessionId: string, usage: Partial<TokenUsage>): void {
    const entry = this.entries.get(sessionId) ?? {
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      turns: 0,
    }
    entry.usage.inputTokens += usage.inputTokens ?? 0
    entry.usage.outputTokens += usage.outputTokens ?? 0
    entry.usage.cacheReadTokens += usage.cacheReadTokens ?? 0
    entry.usage.cacheCreationTokens += usage.cacheCreationTokens ?? 0
    entry.turns += 1
    this.entries.set(sessionId, entry)
  }

  take(sessionId: string): SessionUsage | null {
    const entry = this.entries.get(sessionId)
    if (!entry) return null
    this.entries.delete(sessionId)
    return { tokenUsage: entry.usage, turns: entry.turns }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/session-usage-accumulator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/session/session-usage-accumulator.ts src/main/session/session-usage-accumulator.test.ts
git commit -m "feat(#728): per-session live usage accumulator for chat mode"
```

---

### Task 4: Capture chat-mode usage in the stream handler

**Files:**
- Modify: `src/main/session/session-stream-json.ts:15-21,78-108`
- Modify: `src/main/session/session-stream-wirer.ts:47-68`
- Test: `src/main/session/session-stream-json.test.ts` (create if absent; otherwise extend)

**Interfaces:**
- Consumes: `SessionUsageAccumulator.recordTurn` (Task 3); `TokenUsage`.
- Produces: `StreamJsonCtx.onTurnUsage?: (session: InternalSession, usage: Partial<TokenUsage>) => void`, called once per Claude `result` event with the event's `usage` mapped to `TokenUsage` keys.

- [ ] **Step 1: Write the failing test** `src/main/session/session-stream-json.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { handleStreamJsonEvent, type StreamJsonCtx } from './session-stream-json'
import type { InternalSession } from './session-types'

function ctx(over: Partial<StreamJsonCtx> = {}): StreamJsonCtx {
  return {
    getChatAdapter: () => null,
    sendToRenderer: vi.fn(),
    onDevServerNeeded: vi.fn(),
    ...over,
  }
}
function session(): InternalSession {
  return { id: 's1', ptyId: 'p1', status: 'running' } as unknown as InternalSession
}

describe('chat-mode usage capture', () => {
  it('maps result-event usage to TokenUsage and calls onTurnUsage once', () => {
    const onTurnUsage = vi.fn()
    handleStreamJsonEvent(
      ctx({ onTurnUsage }),
      session(),
      { type: 'result', subtype: 'success', result: 'done', usage: {
        input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 4, cache_creation_input_tokens: 2,
      } },
      'p1',
      'claude-stream-json',
    )
    expect(onTurnUsage).toHaveBeenCalledTimes(1)
    expect(onTurnUsage).toHaveBeenCalledWith(expect.anything(), {
      inputTokens: 100, outputTokens: 10, cacheReadTokens: 4, cacheCreationTokens: 2,
    })
  })

  it('still fires onTurnUsage (turn count) when the result has no usage block', () => {
    const onTurnUsage = vi.fn()
    handleStreamJsonEvent(ctx({ onTurnUsage }), session(),
      { type: 'result', subtype: 'success', result: 'done' }, 'p1', 'claude-stream-json')
    expect(onTurnUsage).toHaveBeenCalledWith(expect.anything(),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/session/session-stream-json.test.ts`
Expected: FAIL — `onTurnUsage` never called (property doesn't exist / not invoked).

- [ ] **Step 3a: Add `onTurnUsage` to the context type.** In `src/main/session/session-stream-json.ts`, extend `StreamJsonCtx` (after `onSlashCommands?`):

```ts
  /** Record a completed Claude chat-mode turn's token usage (one call per `result` event). */
  onTurnUsage?: (session: InternalSession, usage: import('../../shared/verdict-types').TokenUsage) => void
```

- [ ] **Step 3b: Call it in the `result` branch.** In `handleClaudeStreamJsonEvent`, inside `else if (type === 'result') {`, immediately after `const subtype = event.subtype as string | undefined`, add:

```ts
    const u = event.usage as Record<string, number> | undefined
    ctx.onTurnUsage?.(session, {
      inputTokens: u?.input_tokens ?? 0,
      outputTokens: u?.output_tokens ?? 0,
      cacheReadTokens: u?.cache_read_input_tokens ?? 0,
      cacheCreationTokens: u?.cache_creation_input_tokens ?? 0,
    })
```

- [ ] **Step 3c: Plumb it through the wirer.** In `src/main/session/session-stream-wirer.ts`, add a constructor param after `onSlashCommands` (keep it optional so existing call sites compile):

```ts
    private onSlashCommands?: (session: InternalSession, commands: string[]) => void,
    private onTurnUsage?: (session: InternalSession, usage: import('../../shared/verdict-types').TokenUsage) => void,
```

and include it in `streamCtx()`:

```ts
  private streamCtx(): StreamJsonCtx {
    return {
      getChatAdapter: this.getChatAdapter,
      sendToRenderer: this.sendToRenderer,
      onDevServerNeeded: this.onDevServerNeeded,
      onSlashCommands: this.onSlashCommands,
      onTurnUsage: this.onTurnUsage,
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/session-stream-json.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/session/session-stream-json.ts src/main/session/session-stream-wirer.ts src/main/session/session-stream-json.test.ts
git commit -m "feat(#728): capture chat-mode token usage from result events"
```

---

### Task 5: Pass `--session-id` to interactive Claude

**Files:**
- Modify: `src/main/session/session-creator.ts:110-133,229-258`
- Test: `src/main/session/session-creator.test.ts` (extend)

**Interfaces:**
- Produces: interactive Claude spawn args include `--session-id <session.id>`; `InternalSession.id` equals that uuid.

**Why:** the transcript reader (Task 2) locates `~/.claude/projects/*/<session.id>.jsonl`. The id must be minted **before** the spawn and reused as the session id. `claude` v2.1.183 supports `--session-id <uuid>` (verified).

- [ ] **Step 1: Write the failing test** — add to `src/main/session/session-creator.test.ts` a check that interactive Claude args carry `--session-id` matching the created session id. (Mirror an existing spawn assertion in that file: capture `ptyPool.spawn` args, then assert.)

```ts
it('passes --session-id matching the session id for interactive Claude', async () => {
  // ...existing harness that creates an interactive claude session and captures spawn args as `spawnArgs`...
  const idx = spawnArgs.indexOf('--session-id')
  expect(idx).toBeGreaterThan(-1)
  expect(spawnArgs[idx + 1]).toBe(createdSession.id)
})
```

(Use the file's existing setup/mocks for `ptyPool.spawn`; do not invent a new harness.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/session/session-creator.test.ts`
Expected: FAIL — `--session-id` not present.

- [ ] **Step 3a: Mint the id before spawn.** In the create method, just before `let commandBinary = runtime.binary` (around line 110), add:

```ts
    const sessionId = uuidv4()
```

- [ ] **Step 3b: Add the arg for interactive Claude.** In the interactive-Claude theme block (around line 131), extend it:

```ts
    if (!options.nonInteractive && commandBinary === 'claude') {
      runtimeArgs.push('--session-id', sessionId)
      runtimeArgs.push(...claudeAnsiThemeArgs(this.getThemeType?.() ?? 'dark'))
    }
```

- [ ] **Step 3c: Use the pre-minted id.** Pass `sessionId` into `buildSession` and use it instead of generating a second uuid. Add a parameter to `buildSession`:

```ts
  private buildSession(
    sessionId: string,
    options: SpawnAgentOptions,
    worktree: { branch: string; path: string },
    ptyHandle: { id: string; pid: number },
    nonInteractiveOutputMode?: InternalSession['nonInteractiveOutputMode'],
    noWorktree = false,
  ): InternalSession {
    return {
      id: sessionId,
      // ...rest unchanged
```

and update the call site (around line 153): `this.buildSession(sessionId, options, worktree, ptyHandle, nonInteractiveOutputMode, noWorktree)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/session-creator.test.ts`
Expected: PASS (new test + existing suite green).

- [ ] **Step 5: Commit**

```bash
git add src/main/session/session-creator.ts src/main/session/session-creator.test.ts
git commit -m "feat(#728): pass --session-id to interactive Claude for transcript lookup"
```

---

### Task 6: Finalize usage in the verdict recorder

**Files:**
- Modify: `src/main/session/verdict-recorder.ts:18-31,124-163`
- Test: `src/main/session/verdict-recorder.test.ts` (extend)

**Interfaces:**
- Consumes: `SessionUsage` from `./transcript-usage-reader`.
- Produces: `VerdictRecorderDeps.resolveSessionUsage?: (sessionId, worktreePath, runtime) => Promise<SessionUsage | null>`; on termination, when it returns non-null, `metrics.tokenUsage` + `metrics.turns` are written.

- [ ] **Step 1: Write the failing test** — add to `src/main/session/verdict-recorder.test.ts`:

```ts
it('writes tokenUsage + turns from resolveSessionUsage at termination', async () => {
  const resolveSessionUsage = vi.fn(async () => ({
    tokenUsage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 50, cacheCreationTokens: 10 },
    turns: 4,
  }))
  const recorder = new VerdictRecorder({ ...baseDeps(), resolveSessionUsage })
  recorder.onSessionCreated({ sessionId: 's1', projectId: 'p', branch: 'b', runtime: 'claude',
    taskPrompt: 'x', worktreePath: '/wt', baseBranch: 'main' })
  await recorder.onSessionTerminated('s1')
  const rec = store.getBySessionId('s1')!
  expect(rec.metrics.tokenUsage).toEqual({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 50, cacheCreationTokens: 10 })
  expect(rec.metrics.turns).toBe(4)
})

it('leaves tokenUsage/turns undefined when resolver returns null', async () => {
  const recorder = new VerdictRecorder({ ...baseDeps(), resolveSessionUsage: async () => null })
  recorder.onSessionCreated({ sessionId: 's2', projectId: 'p', branch: 'b', runtime: 'codex',
    taskPrompt: 'x', worktreePath: '/wt', baseBranch: 'main' })
  await recorder.onSessionTerminated('s2')
  const rec = store.getBySessionId('s2')!
  expect(rec.metrics.tokenUsage).toBeUndefined()
  expect(rec.metrics.turns).toBeUndefined()
})
```

(`baseDeps()`/`store` mirror the existing test harness at the top of the file — reuse it, don't recreate.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/session/verdict-recorder.test.ts`
Expected: FAIL — `resolveSessionUsage` not a dep / metrics undefined.

- [ ] **Step 3a: Add the dep + import.** In `verdict-recorder.ts`, add the import near the top:

```ts
import type { SessionUsage } from './transcript-usage-reader'
```

and add to `VerdictRecorderDeps`:

```ts
  /** Resolve per-session token usage + turns at termination; null ⇒ runtime exposed none. */
  resolveSessionUsage?: (sessionId: string, worktreePath: string, runtime: string) => Promise<SessionUsage | null>
```

- [ ] **Step 3b: Resolve + merge in `onSessionTerminated`.** After the `prUrl` resolution block and before `const outcome = ...`, add:

```ts
    const usage = this.deps.resolveSessionUsage
      ? await safe(() => this.deps.resolveSessionUsage!(sessionId, tracked.worktreePath, existing.runtime), null)
      : null
```

Then extend the final `store.upsert` `metrics` object:

```ts
      metrics: {
        ...existing.metrics,
        diffLines,
        filesChanged,
        prUrl,
        ...(usage ? { tokenUsage: usage.tokenUsage, turns: usage.turns } : {}),
      },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/session/verdict-recorder.test.ts`
Expected: PASS (new tests + existing suite green).

- [ ] **Step 5: Commit**

```bash
git add src/main/session/verdict-recorder.ts src/main/session/verdict-recorder.test.ts
git commit -m "feat(#728): finalize session token usage into the verdict"
```

---

### Task 7: Wire the accumulator + resolver in the app

**Files:**
- Modify: `src/main/session/session-manager.ts:56-…` (construct accumulator, pass to wirer, expose drain)
- Modify: `src/main/app/index.ts:103-112`

**Interfaces:**
- Consumes: `SessionUsageAccumulator` (Task 3), `readClaudeTranscriptUsage` + `claudeProjectsDir` (Task 2), `SessionUsageAccumulator.recordTurn` via the wirer's new `onTurnUsage` param (Task 4), `resolveSessionUsage` dep (Task 6).
- Produces: `SessionManager.takeLiveUsage(sessionId): SessionUsage | null`.

- [ ] **Step 1: Construct the accumulator + pass to the wirer.** In `session-manager.ts`, add a field and instantiate before `new SessionStreamWirer(...)`:

```ts
  private readonly usageAccumulator = new SessionUsageAccumulator()
```

(import: `import { SessionUsageAccumulator } from './session-usage-accumulator'`)

Add the `onTurnUsage` callback as the new final argument to `new SessionStreamWirer(...)` (after `onSlashCommands`):

```ts
      (session, usage) => this.usageAccumulator.recordTurn(session.id, usage),
```

Add the drain method:

```ts
  takeLiveUsage(sessionId: string): import('./transcript-usage-reader').SessionUsage | null {
    return this.usageAccumulator.take(sessionId)
  }
```

- [ ] **Step 2: Wire `resolveSessionUsage` in `app/index.ts`.** Add the import:

```ts
import { readClaudeTranscriptUsage, claudeProjectsDir } from '../session/transcript-usage-reader'
```

and add to the `new VerdictRecorder({ ... })` deps (after `summarize`):

```ts
  resolveSessionUsage: async (sessionId, worktreePath, runtime) => {
    const live = sessionManager.takeLiveUsage(sessionId)        // chat-mode (drains accumulator)
    if (live && live.turns > 0) return live
    if (runtime !== 'claude') return null                       // interactive: Claude only
    return readClaudeTranscriptUsage({ claudeProjectsDir: claudeProjectsDir(), worktreePath, sessionId })
  },
```

- [ ] **Step 3: Typecheck + run the affected suites**

Run: `npm run typecheck:node && npx vitest run src/main/session/ src/main/app/dev-server-manager.test.ts`
Expected: PASS — no new `error TS`; session-manager / stream-wirer / dev-server suites green (the new wirer arg is optional, so untouched call sites still compile).

- [ ] **Step 4: Commit**

```bash
git add src/main/session/session-manager.ts src/main/app/index.ts
git commit -m "feat(#728): wire usage accumulator + transcript resolver into recorder"
```

---

### Task 8: Surface tokens + turns in the Statistics plugin

**Files:**
- Modify: `resources/plugins/manifold.statistics/src/webview/aggregates.ts:28-66`
- Test: `resources/plugins/manifold.statistics/src/webview/aggregates.test.ts` (extend)
- Modify: `resources/plugins/manifold.statistics/src/webview/StatisticsPanel.tsx:167-191`

**Interfaces:**
- Consumes: `VerdictRecord.metrics.tokenUsage?`, `.turns?`.
- Produces: `RuntimeStats` gains `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `turns` (all summed; 0 when absent).

- [ ] **Step 1: Write the failing test** — add to `aggregates.test.ts`:

```ts
it('sums token usage and turns per runtime, treating missing usage as zero', () => {
  const recs = [
    { runtime: 'claude', outcome: 'merged', createdAt: '2026-06-01', metrics: {
      agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0,
      tokenUsage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 5, cacheCreationTokens: 2 }, turns: 3 } },
    { runtime: 'claude', outcome: 'discarded', createdAt: '2026-06-02', metrics: {
      agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } }, // n/a
    { runtime: 'codex', outcome: 'merged', createdAt: '2026-06-03', metrics: {
      agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } },
  ] as unknown as VerdictRecord[]
  const claude = computeRuntimeStats(recs).find((s) => s.runtime === 'claude')!
  expect(claude.inputTokens).toBe(100)
  expect(claude.outputTokens).toBe(10)
  expect(claude.cacheReadTokens).toBe(5)
  expect(claude.cacheCreationTokens).toBe(2)
  expect(claude.turns).toBe(3)
})
```

(Ensure `VerdictRecord` is imported in the test — it already is via the existing suite.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resources/plugins/manifold.statistics/src/webview/aggregates.test.ts`
Expected: FAIL — `inputTokens` undefined on `RuntimeStats`.

- [ ] **Step 3a: Extend `RuntimeStats`** in `aggregates.ts`:

```ts
export interface RuntimeStats {
  runtime: string
  total: number
  merged: number
  discarded: number
  mergedPct: number
  discardedPct: number
  avgHumanEditsForMerged: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  turns: number
}
```

- [ ] **Step 3b: Sum them in `computeRuntimeStats`.** Inside the `for (const [runtime, bucket] of byRuntime)` loop, before `stats.push({`:

```ts
    const tokenSum = bucket.reduce((acc, r) => {
      const u = r.metrics.tokenUsage
      acc.inputTokens += u?.inputTokens ?? 0
      acc.outputTokens += u?.outputTokens ?? 0
      acc.cacheReadTokens += u?.cacheReadTokens ?? 0
      acc.cacheCreationTokens += u?.cacheCreationTokens ?? 0
      acc.turns += r.metrics.turns ?? 0
      return acc
    }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0 })
```

and spread it into the pushed object: `stats.push({ runtime, total, merged: merged.length, ..., avgHumanEditsForMerged: ..., ...tokenSum })`.

- [ ] **Step 3c: Render it** in `StatisticsPanel.tsx` `renderRuntimeGrid`, inside each runtime `<article>`, after the existing `runtimeFootnote` div, add:

```tsx
            <div style={s.runtimeFootnote}>{formatTokens(stat)}</div>
```

and add a small helper near the top of the file (after `OUTCOME_ORDER`):

```tsx
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function formatTokens(stat: RuntimeStats): string {
  if (stat.inputTokens === 0 && stat.outputTokens === 0 && stat.turns === 0) return 'tokens —'
  return `${compact(stat.inputTokens)} in · ${compact(stat.outputTokens)} out · ${stat.turns} turn${stat.turns === 1 ? '' : 's'}`
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run resources/plugins/manifold.statistics/src/webview/ && npm run typecheck:web`
Expected: PASS — aggregates test green; web typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.statistics/src/webview/aggregates.ts resources/plugins/manifold.statistics/src/webview/aggregates.test.ts resources/plugins/manifold.statistics/src/webview/StatisticsPanel.tsx
git commit -m "feat(#728): show token usage + turns per runtime in Statistics"
```

---

### Task 9: Docs + full verification

**Files:**
- Modify: the architecture page(s) covering `src/main/session/verdict-recorder.ts` and the statistics plugin (find via frontmatter `covers:`).
- Run: full gate.

- [ ] **Step 1: Find the covering pages**

Run: `git grep -l "verdict-recorder\|manifold.statistics\|session-stream" docs/architecture`
For each hit, update the prose to mention token-usage capture (transcript + chat-mode → `VerdictMetrics.tokenUsage`/`turns`), cite `src/main/session/transcript-usage-reader.ts` and `session-usage-accumulator.ts`, and bump the `updated:` frontmatter date to `2026-06-20`. If a new subsystem page is warranted, add it to `docs/README.md` doc map.

- [ ] **Step 2: Wiki-lint**

Run: `bash scripts/wiki-lint.sh`
Expected: no stale-page errors for the touched pages.

- [ ] **Step 3: Full gates**

Run: `npm run typecheck:web && npm run typecheck:node && npm test`
Expected: web=0; node unchanged from baseline (~10, no NEW errors from this work); vitest green except the known worktree-symlink `?url` editor suites (now irrelevant since we `npm install` — they should pass). Investigate any failure that traces to this feature.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(#728): sync architecture pages with token-usage capture"
```

---

## Self-Review

**Spec coverage:**
- Data model (`TokenUsage`, optional fields) → Task 1. ✓
- Interactive transcript capture → Tasks 2, 5. ✓
- Chat-mode live capture → Tasks 3, 4. ✓
- Finalize at session end → Task 6. ✓
- Wiring (accumulator + resolver) → Task 7. ✓
- Surface in Statistics → Task 8. ✓
- Error handling (null on missing/malformed, never throws) → Task 2 (try/catch, scan fallback), Task 6 (`safe`). ✓
- Testing → each task is TDD; full gate in Task 9. ✓
- Docs wiki rule → Task 9. ✓
- Out of scope (cost, budgets, Codex, live meter, time-series) → not built. ✓

**Type consistency:** `SessionUsage { tokenUsage; turns }` defined in Task 2, consumed identically in Tasks 3, 6, 7. `TokenUsage` keys (`inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens`) consistent across Tasks 1–8. `onTurnUsage(session, TokenUsage)` signature matches between Task 4 (ctx + wirer) and Task 7 (call site). `resolveSessionUsage(sessionId, worktreePath, runtime)` matches between Task 6 (dep) and Task 7 (impl). `RuntimeStats` token fields match between Task 8 aggregate and render.

**Placeholder scan:** none — every code step shows full code.
