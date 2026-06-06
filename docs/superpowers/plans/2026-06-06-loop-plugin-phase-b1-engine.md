# Loop-as-a-Plugin — Phase B1: Headless Engine Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `resources/plugins/manifold.loop` — the autoresearch loop running entirely inside the plugin (extension host) via the Phase A APIs + Node, driven by contributed commands. No UI; the built-in loop is untouched.

**Architecture:** A self-contained `LoopEngine` ported from `src/main/loop/loop-runner.ts`, with injected adapters: git/eval via `node:child_process`, iteration-log via `node:fs`, judge via `manifold.lm`, agent-driving via `manifold.agents.activeAgent.runTurn` (replacing sendInput+waitForTurnEnd), worktree path via `manifold.workspace.workspaceFolders`, and config/status via `manifold.storage.global`. All domain logic + types are copied into the plugin so it is standalone. Seven `manifold.loop.*` commands form the control surface.

**Tech Stack:** TypeScript, esbuild (existing `build-plugins.mjs`), Vitest, Node (`child_process`/`fs`). Spec: `docs/superpowers/specs/2026-06-06-loop-plugin-phase-b1-engine-design.md`.

---

## Environment / conventions (read once)

- Worktree: if `node_modules` missing, symlink `ln -s ~/git/manifold/node_modules ./node_modules`.
- Single-file tests: `npx vitest run <path>`. If `better-sqlite3` ABI errors, run `npm run rebuild:node` once (unlikely here — plugin tests touch no sqlite).
- Typecheck gates: `npm run typecheck:node` (baseline 16), `typecheck:web` (baseline 36), `typecheck:plugins` (clean). No new errors in touched files.
- `.gitignore` has a global `out/` rule — the plugin's `out/plugin.js` is a build artifact, never committed. Commit only `package.json` + `src/`.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- The plugin's **testable** modules (`engine`, `git`, `eval`, `eval-runner`, `judge`, `store`, `iteration-log`, `types`) MUST NOT import `manifold` (so they run under vitest). Only `plugin.ts` imports `manifold`, and it has no unit test (covered by build + manual smoke).

## File Structure

All under `resources/plugins/manifold.loop/` unless noted.
- `package.json` — manifest (commands, capabilities, no views).
- `src/types.ts` — copy of `src/shared/loop-types.ts` (standalone domain types).
- `src/eval.ts` / `src/eval.test.ts` — copy of `loop-eval.ts` / its test.
- `src/iteration-log.ts` / `src/iteration-log.test.ts` — copy of `loop-iteration-log.ts` / its test.
- `src/git.ts` / `src/git.test.ts` — `createGitAdapter` (Node `child_process`) + real-repo test.
- `src/eval-runner.ts` / `src/eval-runner.test.ts` — `createEvalRunner` (Node `spawn`) + test.
- `src/judge.ts` / `src/judge.test.ts` — prompt/score helpers + `createJudge(lm)` + test.
- `src/store.ts` / `src/store.test.ts` — config/status over `storage.global` + test.
- `src/engine.ts` / `src/engine.test-helpers.ts` / `src/engine.test.ts` — the ported runner + tests.
- `src/plugin.ts` — `activate()`: wire deps from `manifold`, register commands.

Modified (repo):
- `src/shared/plugins/manifold-module.d.ts` — re-export Phase A types.
- `vitest.config.ts` — add `resources/plugins/**/*.test.{ts,tsx}` to `include`.

---

## Task 1: Re-export Phase A types + enable plugin tests

**Files:**
- Modify: `src/shared/plugins/manifold-module.d.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Re-export the new types from the ambient `manifold` module**

In `src/shared/plugins/manifold-module.d.ts`, extend both the `import type` list and the
`export type` list to include the Phase A types. Replace the two lines:

```ts
  import type { ManifoldApi, ManifoldContext, Disposable, ProjectInfo, SessionInfo, WebviewView, WebviewViewProvider, TreeItem, TreeDataProvider, TreeView } from './api-types'

  // Re-export named types so `import type { ManifoldContext } from 'manifold'` resolves.
  export type { ManifoldApi, ManifoldContext, Disposable, ProjectInfo, SessionInfo, WebviewView, WebviewViewProvider, TreeItem, TreeDataProvider, TreeView }
```

with:

```ts
  import type { ManifoldApi, ManifoldContext, Disposable, ProjectInfo, SessionInfo, WebviewView, WebviewViewProvider, TreeItem, TreeDataProvider, TreeView, AgentSession, LanguageModelChat, WorkspaceFolder, CancellationToken, TurnOutcome } from './api-types'

  // Re-export named types so `import type { ManifoldContext } from 'manifold'` resolves.
  export type { ManifoldApi, ManifoldContext, Disposable, ProjectInfo, SessionInfo, WebviewView, WebviewViewProvider, TreeItem, TreeDataProvider, TreeView, AgentSession, LanguageModelChat, WorkspaceFolder, CancellationToken, TurnOutcome }
```

- [ ] **Step 2: Add the plugin test glob to vitest**

In `vitest.config.ts`, change the `include` array to add the plugins glob:

```ts
    include: ['src/**/*.test.{ts,tsx}', 'provisioners/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}', 'resources/plugins/**/*.test.{ts,tsx}'],
```

- [ ] **Step 3: Verify typecheck unaffected**

Run: `npm run typecheck:node 2>&1 | grep -cE "error TS"`
Expected: `16` (baseline unchanged — these are additive type re-exports).

- [ ] **Step 4: Commit**

```bash
git add src/shared/plugins/manifold-module.d.ts vitest.config.ts
git commit -m "feat(plugins): re-export Phase A types from manifold module; run plugin tests in vitest

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Plugin manifest + domain types

**Files:**
- Create: `resources/plugins/manifold.loop/package.json`
- Create: `resources/plugins/manifold.loop/src/types.ts`

- [ ] **Step 1: Write the manifest**

Create `resources/plugins/manifold.loop/package.json`:

```json
{
  "name": "loop",
  "publisher": "manifold",
  "version": "0.0.1",
  "displayName": "Autoresearch Loop",
  "description": "Edit → eval → keep-or-discard loop, as a plugin.",
  "engines": { "manifold": "^0.3.0" },
  "main": "./out/plugin.js",
  "activationEvents": ["onCommand:manifold.loop.start", "onCommand:manifold.loop.status"],
  "capabilities": ["agent:control", "lm", "workspace:read", "storage"],
  "contributes": {
    "commands": [
      { "command": "manifold.loop.start", "title": "Loop: Start" },
      { "command": "manifold.loop.stop", "title": "Loop: Stop" },
      { "command": "manifold.loop.status", "title": "Loop: Status" },
      { "command": "manifold.loop.iterations", "title": "Loop: Iterations" },
      { "command": "manifold.loop.clear", "title": "Loop: Clear" },
      { "command": "manifold.loop.restoreBest", "title": "Loop: Restore Best" },
      { "command": "manifold.loop.setConfig", "title": "Loop: Set Config" }
    ]
  }
}
```

- [ ] **Step 2: Copy the domain types**

Copy `src/shared/loop-types.ts` verbatim to `resources/plugins/manifold.loop/src/types.ts`
(no edits — it has no imports). Quickest:

```bash
cp src/shared/loop-types.ts resources/plugins/manifold.loop/src/types.ts
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck:plugins 2>&1 | grep -E "manifold.loop" || echo "no loop errors"`
Expected: `no loop errors`.

- [ ] **Step 4: Commit**

```bash
git add resources/plugins/manifold.loop/package.json resources/plugins/manifold.loop/src/types.ts
git commit -m "feat(loop-plugin): manifest + domain types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Port eval (metric parsing)

**Files:**
- Create: `resources/plugins/manifold.loop/src/eval.ts`
- Test: `resources/plugins/manifold.loop/src/eval.test.ts`

- [ ] **Step 1: Copy the source, fixing the import path**

Copy `src/main/loop/loop-eval.ts` to `resources/plugins/manifold.loop/src/eval.ts`, then change
its first import line from:

```ts
import type { MetricDirection, MetricSpec } from '../../shared/loop-types'
```
to:
```ts
import type { MetricDirection, MetricSpec } from './types'
```
(Everything else is unchanged: `parseMetric`, `isImprovement`, `resolveJsonPath`, `extractLastJsonBlock`.)

- [ ] **Step 2: Copy the test, fixing import paths**

Copy `src/main/loop/loop-eval.test.ts` to `resources/plugins/manifold.loop/src/eval.test.ts`,
then change its imports from:
```ts
import { parseMetric, isImprovement } from './loop-eval'
import type { MetricSpec } from '../../shared/loop-types'
```
to:
```ts
import { parseMetric, isImprovement } from './eval'
import type { MetricSpec } from './types'
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run resources/plugins/manifold.loop/src/eval.test.ts`
Expected: PASS (all parseMetric/isImprovement cases). If it reports "No test files found", re-check Task 1 Step 2 (the vitest glob).

- [ ] **Step 4: Commit**

```bash
git add resources/plugins/manifold.loop/src/eval.ts resources/plugins/manifold.loop/src/eval.test.ts
git commit -m "feat(loop-plugin): port metric parsing (eval)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Port iteration log

**Files:**
- Create: `resources/plugins/manifold.loop/src/iteration-log.ts`
- Test: `resources/plugins/manifold.loop/src/iteration-log.test.ts`

- [ ] **Step 1: Copy the source, fixing the import path**

Copy `src/main/loop/loop-iteration-log.ts` to `resources/plugins/manifold.loop/src/iteration-log.ts`,
then change its type import from:
```ts
import type { LoopIteration } from '../../shared/loop-types'
```
to:
```ts
import type { LoopIteration } from './types'
```
(Everything else unchanged: `iterationLogPath`, `appendIteration`, `clearIterations`, `readAllIterations`, writing to `~/.manifold/loop-logs/<sha256(worktree)[:16]>.jsonl`.)

- [ ] **Step 2: Copy the test, fixing import paths**

Copy `src/main/loop/loop-iteration-log.test.ts` to
`resources/plugins/manifold.loop/src/iteration-log.test.ts`, then change its imports from:
```ts
import { appendIteration, readAllIterations, iterationLogPath } from './loop-iteration-log'
import type { LoopIteration } from '../../shared/loop-types'
```
to:
```ts
import { appendIteration, readAllIterations, iterationLogPath } from './iteration-log'
import type { LoopIteration } from './types'
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run resources/plugins/manifold.loop/src/iteration-log.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add resources/plugins/manifold.loop/src/iteration-log.ts resources/plugins/manifold.loop/src/iteration-log.test.ts
git commit -m "feat(loop-plugin): port iteration log

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Git adapter (Node child_process)

**Files:**
- Create: `resources/plugins/manifold.loop/src/git.ts`
- Test: `resources/plugins/manifold.loop/src/git.test.ts`

- [ ] **Step 1: Write the failing test (against a real temp git repo)**

Create `resources/plugins/manifold.loop/src/git.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createGitAdapter } from './git'

const run = promisify(execFile)
let wt: string

beforeEach(async () => {
  wt = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-git-'))
  await run('git', ['init', '-q'], { cwd: wt })
  await run('git', ['config', 'user.email', 't@t.t'], { cwd: wt })
  await run('git', ['config', 'user.name', 'T'], { cwd: wt })
  await fs.writeFile(path.join(wt, 'a.txt'), 'one\n')
  await run('git', ['add', '-A'], { cwd: wt })
  await run('git', ['commit', '-qm', 'init'], { cwd: wt })
})
afterEach(async () => { await fs.rm(wt, { recursive: true, force: true }) })

describe('createGitAdapter', () => {
  const git = createGitAdapter()

  it('getHeadSha returns the current HEAD', async () => {
    const sha = await git.getHeadSha(wt)
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('getChangedFilesCount counts uncommitted changes', async () => {
    expect(await git.getChangedFilesCount(wt)).toBe(0)
    await fs.writeFile(path.join(wt, 'b.txt'), 'two\n')
    expect(await git.getChangedFilesCount(wt)).toBe(1)
  })

  it('stageAllAndCommit commits and returns the new sha', async () => {
    const before = await git.getHeadSha(wt)
    await fs.writeFile(path.join(wt, 'b.txt'), 'two\n')
    const sha = await git.stageAllAndCommit(wt, 'add b')
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    expect(sha).not.toBe(before)
    expect(await git.getChangedFilesCount(wt)).toBe(0)
  })

  it('hardReset restores a previous sha and cleans new files', async () => {
    const base = await git.getHeadSha(wt)
    await fs.writeFile(path.join(wt, 'b.txt'), 'two\n')
    await git.stageAllAndCommit(wt, 'add b')
    await git.hardReset(wt, base)
    expect(await git.getHeadSha(wt)).toBe(base)
    await expect(fs.stat(path.join(wt, 'b.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('getDiff returns a diff since a sha', async () => {
    const base = await git.getHeadSha(wt)
    await fs.writeFile(path.join(wt, 'a.txt'), 'one\ntwo\n')
    await git.stageAllAndCommit(wt, 'edit a')
    const diff = await git.getDiff(wt, base)
    expect(diff).toContain('a.txt')
    expect(diff).toContain('+two')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/git.test.ts`
Expected: FAIL — `./git` not found.

- [ ] **Step 3: Implement the adapter (ported from `createGitAdapter`)**

Create `resources/plugins/manifold.loop/src/git.ts`:

```ts
// resources/plugins/manifold.loop/src/git.ts
// Ported from src/main/loop/loop-adapters.ts (createGitAdapter). Pure Node — no manifold import.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface LoopGitAdapter {
  getHeadSha(worktreePath: string): Promise<string>
  stageAllAndCommit(worktreePath: string, message: string): Promise<string>
  hardReset(worktreePath: string, sha: string): Promise<void>
  getChangedFilesCount(worktreePath: string): Promise<number>
  getDiff(worktreePath: string, sinceSha: string): Promise<string>
}

export function createGitAdapter(): LoopGitAdapter {
  return {
    async getHeadSha(worktreePath) {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath })
      return stdout.trim()
    },
    async stageAllAndCommit(worktreePath, message) {
      await execFileAsync('git', ['add', '-A'], { cwd: worktreePath })
      await execFileAsync('git', ['commit', '-m', message, '--no-verify'], { cwd: worktreePath })
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath })
      return stdout.trim()
    },
    async hardReset(worktreePath, sha) {
      await execFileAsync('git', ['reset', '--hard', sha], { cwd: worktreePath })
      await execFileAsync('git', ['clean', '-fd'], { cwd: worktreePath })
    },
    async getChangedFilesCount(worktreePath) {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: worktreePath })
      return stdout.split('\n').filter((line) => line.trim().length > 0).length
    },
    async getDiff(worktreePath, sinceSha) {
      const { stdout } = await execFileAsync('git', ['diff', sinceSha, '--', '.'], { cwd: worktreePath, maxBuffer: 16 * 1024 * 1024 })
      return stdout
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run resources/plugins/manifold.loop/src/git.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/git.ts resources/plugins/manifold.loop/src/git.test.ts
git commit -m "feat(loop-plugin): git adapter (node child_process)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Eval runner (Node spawn)

**Files:**
- Create: `resources/plugins/manifold.loop/src/eval-runner.ts`
- Test: `resources/plugins/manifold.loop/src/eval-runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `resources/plugins/manifold.loop/src/eval-runner.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as os from 'node:os'
import { createEvalRunner } from './eval-runner'

describe('createEvalRunner', () => {
  const runner = createEvalRunner()

  it('captures stdout and exit code 0', async () => {
    const r = await runner.run(os.tmpdir(), 'echo hello', 10, new AbortController().signal)
    expect(r.stdout).toContain('hello')
    expect(r.exitCode).toBe(0)
    expect(r.timedOut).toBe(false)
  })

  it('reports a nonzero exit code', async () => {
    const r = await runner.run(os.tmpdir(), 'exit 3', 10, new AbortController().signal)
    expect(r.exitCode).toBe(3)
    expect(r.timedOut).toBe(false)
  })

  it('times out a long command and flags timedOut', async () => {
    const r = await runner.run(os.tmpdir(), 'sleep 5', 1, new AbortController().signal)
    expect(r.timedOut).toBe(true)
  })

  it('appends stderr under a marker', async () => {
    const r = await runner.run(os.tmpdir(), 'echo oops 1>&2', 10, new AbortController().signal)
    expect(r.stdout).toContain('---stderr---')
    expect(r.stdout).toContain('oops')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/eval-runner.test.ts`
Expected: FAIL — `./eval-runner` not found.

- [ ] **Step 3: Implement the runner (ported from `createEvalRunner`)**

Create `resources/plugins/manifold.loop/src/eval-runner.ts`:

```ts
// resources/plugins/manifold.loop/src/eval-runner.ts
// Ported from src/main/loop/loop-adapters.ts (createEvalRunner). Pure Node — no manifold import.
import { spawn } from 'node:child_process'

export interface EvalOutcome { stdout: string; exitCode: number; timedOut: boolean }

export interface LoopEvalRunner {
  run(worktreePath: string, command: string, budgetSeconds: number, signal: AbortSignal): Promise<EvalOutcome>
}

export function createEvalRunner(): LoopEvalRunner {
  return {
    async run(worktreePath, command, budgetSeconds, signal) {
      return new Promise<EvalOutcome>((resolve, reject) => {
        const child = spawn(command, { cwd: worktreePath, shell: true, env: process.env })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        let settled = false

        const timer = setTimeout(() => {
          timedOut = true
          try { child.kill('SIGTERM') } catch { /* already exited */ }
          setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ok */ } }, 2000)
        }, budgetSeconds * 1000)

        const onAbort = (): void => { try { child.kill('SIGTERM') } catch { /* ok */ } }
        signal.addEventListener('abort', onAbort, { once: true })

        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })

        child.on('error', (err: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
          reject(err)
        })
        child.on('close', (code: number | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal.removeEventListener('abort', onAbort)
          resolve({
            stdout: stdout + (stderr ? `\n---stderr---\n${stderr}` : ''),
            exitCode: code ?? (timedOut ? 124 : 1),
            timedOut,
          })
        })
      })
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run resources/plugins/manifold.loop/src/eval-runner.test.ts`
Expected: PASS (4 cases). The timeout case takes ~1s.

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/eval-runner.ts resources/plugins/manifold.loop/src/eval-runner.test.ts
git commit -m "feat(loop-plugin): eval runner (node spawn)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Judge (prompt/score helpers + manifold.lm)

**Files:**
- Create: `resources/plugins/manifold.loop/src/judge.ts`
- Test: `resources/plugins/manifold.loop/src/judge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `resources/plugins/manifold.loop/src/judge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildJudgePrompt, extractScore, createJudge } from './judge'

describe('extractScore', () => {
  it('reads the tagged FINAL_SCORE line', () => {
    expect(extractScore('reasoning...\nFINAL_SCORE: 7', 10)).toBe(7)
  })
  it('clamps to [0, maxScore]', () => {
    expect(extractScore('FINAL_SCORE: 99', 10)).toBe(10)
    expect(extractScore('FINAL_SCORE: -4', 10)).toBe(0)
  })
  it('falls back to the last number', () => {
    expect(extractScore('the score is 5', 10)).toBe(5)
  })
  it('returns null when there is no number', () => {
    expect(extractScore('no number', 10)).toBeNull()
  })
})

describe('buildJudgePrompt', () => {
  it('includes the rubric, task spec, and diff', () => {
    const p = buildJudgePrompt({ rubric: 'Cleanliness', maxScore: 10, evalStdout: 'built', diff: 'diff x', hasEvalCommand: true, programSpec: 'make it clean' })
    expect(p).toContain('Cleanliness')
    expect(p).toContain('make it clean')
    expect(p).toContain('diff x')
    expect(p).toContain('FINAL_SCORE:')
  })
  it('omits eval mentions when no eval command', () => {
    const p = buildJudgePrompt({ rubric: 'r', maxScore: 5, evalStdout: '', diff: 'd', hasEvalCommand: false, programSpec: 's' })
    expect(p).toContain('NO EVAL COMMAND IS CONFIGURED')
  })
})

describe('createJudge', () => {
  const fakeLm = (text: string) => ({ selectChatModels: async () => [{ id: 'm', sendRequest: async () => ({ text }) }] })

  it('returns the parsed score from the model output', async () => {
    const judge = createJudge(fakeLm('FINAL_SCORE: 8') as never)
    const r = await judge.judge({ sessionId: 's', rubric: 'r', maxScore: 10, evalStdout: 'o', diff: 'd', hasEvalCommand: true, program: 'p' }, new AbortController().signal)
    expect(r.score).toBe(8)
  })

  it('fails when no model is available', async () => {
    const judge = createJudge({ selectChatModels: async () => [] } as never)
    const r = await judge.judge({ sessionId: 's', rubric: 'r', maxScore: 10, evalStdout: '', diff: 'd', hasEvalCommand: false, program: 'p' }, new AbortController().signal)
    expect(r.failure).toMatch(/no language model/i)
  })

  it('returns failure with rawOutput when the model gives no number', async () => {
    const judge = createJudge(fakeLm('I cannot decide') as never)
    const r = await judge.judge({ sessionId: 's', rubric: 'r', maxScore: 10, evalStdout: '', diff: 'd', hasEvalCommand: false, program: 'p' }, new AbortController().signal)
    expect(r.failure).toBeTruthy()
    expect(r.rawOutput).toContain('cannot decide')
  })

  it('aborts early when the signal is already aborted', async () => {
    const judge = createJudge(fakeLm('FINAL_SCORE: 8') as never)
    const ac = new AbortController(); ac.abort()
    const r = await judge.judge({ sessionId: 's', rubric: 'r', maxScore: 10, evalStdout: '', diff: 'd', hasEvalCommand: false, program: 'p' }, ac.signal)
    expect(r.failure).toMatch(/aborted/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/judge.test.ts`
Expected: FAIL — `./judge` not found.

- [ ] **Step 3: Implement the judge**

Create `resources/plugins/manifold.loop/src/judge.ts`. The `buildJudgePrompt` and
`extractScore` (and their private helpers `lastNumber`, `truncate`) are copied **verbatim**
from `src/main/loop/loop-judge-adapter.ts` (the pure functions only — do not copy
`createJudgeAdapter`, which imports SessionManager/gitOps/runtimes). Then add the
plugin-native `createJudge(lm)` that calls `manifold.lm`:

```ts
// resources/plugins/manifold.loop/src/judge.ts
// Prompt-building + score-extraction copied verbatim from src/main/loop/loop-judge-adapter.ts.
// createJudge() drives manifold.lm instead of gitOps.aiGenerate. No `manifold` import —
// the lm handle is injected (so this is unit-testable).

const DIFF_CHAR_LIMIT = 24_000
const STDOUT_CHAR_LIMIT = 8_000
const JUDGE_TIMEOUT_MS = 120_000
const PROGRAM_SPEC_CHAR_LIMIT = 8_000

export interface JudgeRequest {
  sessionId: string
  rubric: string
  maxScore: number
  evalStdout: string
  diff: string
  hasEvalCommand: boolean
  program: string
}
export interface JudgeResult { score?: number; failure?: string; rawOutput?: string }
export interface Judge { judge(request: JudgeRequest, signal: AbortSignal): Promise<JudgeResult> }

/** Minimal shape of manifold.lm needed here (injected; keeps this file manifold-free). */
export interface LmLike {
  selectChatModels(): Promise<Array<{ sendRequest(prompt: string, opts?: { timeoutMs?: number }): Promise<{ text: string }> }>>
}

export function createJudge(lm: LmLike): Judge {
  return {
    async judge(request, signal) {
      if (signal.aborted) return { failure: 'aborted before judge ran' }
      const models = await lm.selectChatModels()
      const model = models[0]
      if (!model) return { failure: 'no language model available' }

      const rubric = request.rubric.trim() || 'Rate overall quality of the change.'
      const prompt = buildJudgePrompt({
        rubric,
        maxScore: request.maxScore,
        evalStdout: request.evalStdout,
        diff: request.diff,
        hasEvalCommand: request.hasEvalCommand,
        programSpec: request.program,
      })

      let output: string
      try {
        const res = await model.sendRequest(prompt, { timeoutMs: JUDGE_TIMEOUT_MS })
        output = res.text
      } catch (err) {
        return { failure: `judge model failed: ${(err as Error).message}` }
      }

      const score = extractScore(output, request.maxScore)
      if (score === null) {
        return { failure: `judge did not return a numeric score (got: ${truncate(output, 240)})`, rawOutput: output }
      }
      return { score, rawOutput: output }
    },
  }
}

interface JudgePromptInput {
  rubric: string
  maxScore: number
  evalStdout: string
  diff: string
  hasEvalCommand: boolean
  programSpec: string | null
}

// ---- COPY VERBATIM FROM src/main/loop/loop-judge-adapter.ts (buildJudgePrompt) ----
export function buildJudgePrompt(input: JudgePromptInput): string {
  // ... paste the full body of buildJudgePrompt from loop-judge-adapter.ts unchanged ...
}

// ---- COPY VERBATIM FROM src/main/loop/loop-judge-adapter.ts (extractScore, lastNumber, truncate) ----
export function extractScore(output: string, maxScore: number): number | null {
  // ... paste the full body of extractScore from loop-judge-adapter.ts unchanged ...
}
function lastNumber(output: string): string | null {
  // ... paste verbatim ...
}
function truncate(text: string, max: number): string {
  // ... paste verbatim ...
}
```

When pasting, take the **exact** function bodies from `src/main/loop/loop-judge-adapter.ts`
(lines defining `buildJudgePrompt`, `extractScore`, `lastNumber`, `truncate`). They are pure
and need no edits.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run resources/plugins/manifold.loop/src/judge.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/judge.ts resources/plugins/manifold.loop/src/judge.test.ts
git commit -m "feat(loop-plugin): judge via manifold.lm (prompt/score copied from core)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Config/status store (manifold.storage.global)

**Files:**
- Create: `resources/plugins/manifold.loop/src/store.ts`
- Test: `resources/plugins/manifold.loop/src/store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `resources/plugins/manifold.loop/src/store.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createLoopStore } from './store'
import type { LoopConfig, LoopStatus } from './types'

function fakeStorage() {
  const map = new Map<string, unknown>()
  return {
    map,
    global: {
      get: async <T>(key: string, dflt?: T) => (map.has(key) ? (map.get(key) as T) : dflt),
      update: async (key: string, value: unknown) => { map.set(key, value) },
    },
  }
}

const cfg = (sessionId: string): LoopConfig => ({
  sessionId, program: 'p', targetGlobs: [], evalCommand: 'e',
  metric: { kind: 'exit-code', direction: 'minimize' }, budgetSeconds: 30,
})
const st = (sessionId: string): LoopStatus => ({ sessionId, state: 'running', currentIteration: 2 })

describe('createLoopStore', () => {
  it('round-trips config keyed by session', async () => {
    const s = fakeStorage()
    const store = createLoopStore(s as never)
    expect(await store.getConfig('s1')).toBeNull()
    await store.setConfig('s1', cfg('s1'))
    expect((await store.getConfig('s1'))?.sessionId).toBe('s1')
    expect(await store.getConfig('s2')).toBeNull()
  })

  it('round-trips status and clears it', async () => {
    const s = fakeStorage()
    const store = createLoopStore(s as never)
    expect(await store.getStatus('s1')).toBeNull()
    await store.setStatus('s1', st('s1'))
    expect((await store.getStatus('s1'))?.state).toBe('running')
    await store.clearStatus('s1')
    expect(await store.getStatus('s1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/store.test.ts`
Expected: FAIL — `./store` not found.

- [ ] **Step 3: Implement the store**

Create `resources/plugins/manifold.loop/src/store.ts`:

```ts
// resources/plugins/manifold.loop/src/store.ts
// Per-session config/status persistence over manifold.storage.global. The storage handle is
// injected (no `manifold` import) so this is unit-testable.
import type { LoopConfig, LoopStatus } from './types'

export interface StorageLike {
  global: {
    get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
    update(key: string, value: unknown): Promise<void>
  }
}

export interface LoopStore {
  getConfig(sessionId: string): Promise<LoopConfig | null>
  setConfig(sessionId: string, config: LoopConfig): Promise<void>
  getStatus(sessionId: string): Promise<LoopStatus | null>
  setStatus(sessionId: string, status: LoopStatus): Promise<void>
  clearStatus(sessionId: string): Promise<void>
}

const configKey = (sessionId: string): string => `loop.config.${sessionId}`
const statusKey = (sessionId: string): string => `loop.status.${sessionId}`

export function createLoopStore(storage: StorageLike): LoopStore {
  return {
    async getConfig(sessionId) {
      return (await storage.global.get<LoopConfig>(configKey(sessionId))) ?? null
    },
    async setConfig(sessionId, config) {
      await storage.global.update(configKey(sessionId), config)
    },
    async getStatus(sessionId) {
      return (await storage.global.get<LoopStatus>(statusKey(sessionId))) ?? null
    },
    async setStatus(sessionId, status) {
      await storage.global.update(statusKey(sessionId), status)
    },
    async clearStatus(sessionId) {
      await storage.global.update(statusKey(sessionId), null)
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run resources/plugins/manifold.loop/src/store.test.ts`
Expected: PASS (2 cases).

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/store.ts resources/plugins/manifold.loop/src/store.test.ts
git commit -m "feat(loop-plugin): per-session config/status store over storage.global

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: LoopEngine (ported runner)

**Files:**
- Create: `resources/plugins/manifold.loop/src/engine.ts`
- Create: `resources/plugins/manifold.loop/src/engine.test-helpers.ts`
- Test: `resources/plugins/manifold.loop/src/engine.test.ts`

- [ ] **Step 1: Write the engine**

Create `resources/plugins/manifold.loop/src/engine.ts`:

```ts
// resources/plugins/manifold.loop/src/engine.ts
// Ported from src/main/loop/loop-runner.ts. Differences: sendInput+waitForTurnEnd collapse
// into runTurn; config/status persist via the injected store; the active session is pinned
// at start and re-checked each iteration. No `manifold` import (all deps injected).
import type { LoopConfig, LoopIteration, LoopStatus, IterationOutcome } from './types'
import { parseMetric, isImprovement } from './eval'
import type { LoopGitAdapter } from './git'
import type { LoopEvalRunner, EvalOutcome } from './eval-runner'
import type { Judge } from './judge'
import type { LoopStore } from './store'

export type TurnOutcome = 'ended' | 'timeout' | 'aborted'
export type RunTurn = (prompt: string, opts: { budgetSeconds: number; clearContext: boolean }, signal: AbortSignal) => Promise<TurnOutcome>

export interface LoopIterationLogPort {
  append(worktreePath: string, iter: LoopIteration): Promise<void>
  readAll(worktreePath: string): Promise<LoopIteration[]>
  clear(worktreePath: string): Promise<void>
}

export interface LoopEngineDeps {
  git: LoopGitAdapter
  evalRunner: LoopEvalRunner
  judge: Judge
  iterationLog: LoopIterationLogPort
  runTurn: RunTurn
  activeSessionId: () => string | undefined
  worktreePath: () => string | undefined
  store: LoopStore
  emit?: (event: 'status' | 'iteration', payload: unknown) => void
  now?: () => number
}

interface RunState {
  config: LoopConfig
  status: LoopStatus
  abort: AbortController
  startWallMs: number
  baselineSha: string
  targetSessionId: string
  worktreePath: string
}

const PROMPT_TEMPLATE = `Task:
{program}

Propose ONE small change aimed at improving the target metric.{targetGlobsLine} Do NOT ask clarifying questions — make reasonable assumptions and act. Do NOT create or edit a program.md file; the task above is your spec. When done, stop your turn. Do not run tests or benchmarks — the harness will measure your change.`

export class LoopEngine {
  private runs = new Map<string, RunState>()
  private readonly deps: LoopEngineDeps
  private readonly now: () => number

  constructor(deps: LoopEngineDeps) {
    this.deps = deps
    this.now = deps.now ?? ((): number => Date.now())
  }

  /** Run the loop to completion. The plugin command invokes this fire-and-forget. */
  async start(config: LoopConfig): Promise<void> {
    if (this.runs.has(config.sessionId)) {
      throw new Error(`Loop already running for session ${config.sessionId}`)
    }
    const worktreePath = this.deps.worktreePath()
    if (!worktreePath) throw new Error('no active worktree')
    const targetSessionId = this.deps.activeSessionId()
    if (!targetSessionId) throw new Error('no active agent session')

    await this.deps.store.setConfig(config.sessionId, config)
    const baselineSha = await this.deps.git.getHeadSha(worktreePath)
    const status: LoopStatus = {
      sessionId: config.sessionId,
      state: 'running',
      currentIteration: 0,
      bestCommitSha: baselineSha,
      baselineSha,
      startedAt: this.now(),
    }
    const run: RunState = { config, status, abort: new AbortController(), startWallMs: this.now(), baselineSha, targetSessionId, worktreePath }
    this.runs.set(config.sessionId, run)
    await this.publish(run)

    try {
      await this.drive(run)
    } catch (err) {
      run.status.state = 'error'
      run.status.errorMessage = (err as Error).message
    }

    if (run.status.state === 'running') run.status.state = 'finished'
    run.status.stoppedAt = this.now()
    await this.publish(run)
    this.runs.delete(config.sessionId)
  }

  async stop(sessionId: string): Promise<void> {
    const run = this.runs.get(sessionId)
    if (!run) return
    run.abort.abort()
    run.status.state = 'finished'
    await this.publish(run)
  }

  /** In-memory status for an active run (sync). */
  getStatusSync(sessionId: string): LoopStatus | null {
    return this.runs.get(sessionId)?.status ?? null
  }

  /** Active status, else the persisted one. */
  async getStatus(sessionId: string): Promise<LoopStatus | null> {
    return this.getStatusSync(sessionId) ?? (await this.deps.store.getStatus(sessionId))
  }

  async getConfig(sessionId: string): Promise<LoopConfig | null> {
    return this.deps.store.getConfig(sessionId)
  }

  async setConfig(sessionId: string, config: LoopConfig): Promise<LoopConfig> {
    await this.deps.store.setConfig(sessionId, config)
    return config
  }

  async getIterations(): Promise<LoopIteration[]> {
    const worktreePath = this.deps.worktreePath()
    if (!worktreePath) return []
    return this.deps.iterationLog.readAll(worktreePath)
  }

  async clear(sessionId: string): Promise<LoopStatus> {
    if (this.runs.has(sessionId)) throw new Error('Cannot clear iterations while loop is running — stop it first')
    const worktreePath = this.deps.worktreePath()
    if (!worktreePath) throw new Error('no active worktree')
    await this.deps.iterationLog.clear(worktreePath)
    const cleared: LoopStatus = { sessionId, state: 'idle', currentIteration: 0 }
    await this.deps.store.setStatus(sessionId, cleared)
    this.deps.emit?.('status', cleared)
    return cleared
  }

  async restoreBest(sessionId: string): Promise<{ sha: string }> {
    const status = await this.getStatus(sessionId)
    if (!status?.bestCommitSha) throw new Error('No best commit recorded yet')
    if (status.bestCommitSha === status.baselineSha) throw new Error('No improvement to restore — best is still the baseline')
    const worktreePath = this.deps.worktreePath()
    if (!worktreePath) throw new Error('no active worktree')
    await this.deps.git.hardReset(worktreePath, status.bestCommitSha)
    return { sha: status.bestCommitSha }
  }

  private async drive(run: RunState): Promise<void> {
    const { config, status, abort } = run
    const maxIter = config.maxIterations ?? 40
    const maxWallMs = (config.maxWallClockMinutes ?? 24 * 60) * 60 * 1000

    while (status.state === 'running' && status.currentIteration < maxIter) {
      if (abort.signal.aborted) return
      if (this.now() - run.startWallMs > maxWallMs) return
      if (this.deps.activeSessionId() !== run.targetSessionId) {
        status.state = 'error'
        status.errorMessage = 'active session changed'
        return
      }

      status.currentIteration += 1
      const iter = await this.runOneIteration(run)
      await this.deps.iterationLog.append(run.worktreePath, iter)
      this.deps.emit?.('iteration', iter)
      await this.publish(run)
    }
  }

  private async runOneIteration(run: RunState): Promise<LoopIteration> {
    const { config, status, abort } = run
    const wt = run.worktreePath
    const index = status.currentIteration
    const startedAt = this.now()
    const base: LoopIteration = { index, startedAt, outcome: 'failed' }

    const baseForIter = await this.deps.git.getHeadSha(wt)

    const clearContext = !!config.clearContextEachIteration && index > 1
    const turn = await this.deps.runTurn(renderPrompt(PROMPT_TEMPLATE, config), { budgetSeconds: config.budgetSeconds, clearContext }, abort.signal)

    if (turn === 'aborted') {
      return { ...base, outcome: 'aborted', finishedAt: this.now(), errorMessage: 'stopped by user' }
    }
    if (turn === 'timeout') {
      await this.safeReset(wt, baseForIter)
      return { ...base, outcome: 'aborted', finishedAt: this.now(), errorMessage: 'agent turn exceeded budget' }
    }

    const changed = await this.deps.git.getChangedFilesCount(wt)
    if (changed === 0) {
      return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: 'no changes' }
    }

    const skipEval = config.metric.kind === 'llm-judge' && !config.evalCommand.trim()
    let evalResult: EvalOutcome
    if (skipEval) {
      evalResult = { stdout: '', exitCode: 0, timedOut: false }
    } else {
      try {
        evalResult = await this.deps.evalRunner.run(wt, config.evalCommand, config.budgetSeconds, abort.signal)
      } catch (err) {
        await this.safeReset(wt, baseForIter)
        return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: `eval crashed: ${(err as Error).message}` }
      }
      if (evalResult.timedOut) {
        await this.safeReset(wt, baseForIter)
        return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: 'eval timed out', evalStdoutTail: tail(evalResult.stdout) }
      }
    }

    let score: number | undefined
    let failure: string | undefined
    let judgeOutputTail: string | undefined
    if (config.metric.kind === 'llm-judge') {
      const diff = await this.safeDiff(wt, run.baselineSha)
      const result = await this.deps.judge.judge({
        sessionId: config.sessionId,
        rubric: config.metric.rubric,
        maxScore: config.metric.maxScore,
        evalStdout: evalResult.stdout,
        diff,
        hasEvalCommand: !skipEval,
        program: config.program,
      }, abort.signal)
      score = result.score
      failure = result.failure
      if (result.rawOutput) judgeOutputTail = tail(result.rawOutput)
    } else {
      const parsed = parseMetric(evalResult.stdout, evalResult.exitCode, config.metric)
      if ('failure' in parsed) failure = parsed.failure
      else score = parsed.score
    }
    if (failure !== undefined || score === undefined) {
      await this.safeReset(wt, baseForIter)
      return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: failure ?? 'no score', evalStdoutTail: tail(evalResult.stdout), judgeOutputTail }
    }

    const metricDirection = 'direction' in config.metric ? config.metric.direction : 'minimize'
    const improved = isImprovement(score, status.bestScore, metricDirection)

    let outcome: IterationOutcome
    let commitSha: string | undefined
    if (improved) {
      commitSha = await this.deps.git.stageAllAndCommit(wt, `loop: iteration ${index} (score=${score})`)
      status.bestScore = score
      status.bestCommitSha = commitSha
      outcome = 'improved'
    } else if (config.alwaysAdvance) {
      commitSha = await this.deps.git.stageAllAndCommit(wt, `loop: iteration ${index} (score=${score}, rolled forward)`)
      outcome = 'regressed'
    } else {
      await this.safeReset(wt, baseForIter)
      outcome = 'regressed'
    }

    return { ...base, outcome, score, commitSha, finishedAt: this.now(), evalStdoutTail: tail(evalResult.stdout), judgeOutputTail }
  }

  private async safeReset(worktreePath: string, sha: string): Promise<void> {
    try { await this.deps.git.hardReset(worktreePath, sha) } catch { /* best-effort */ }
  }

  private async safeDiff(worktreePath: string, sha: string): Promise<string> {
    try { return await this.deps.git.getDiff(worktreePath, sha) } catch { return '' }
  }

  private async publish(run: RunState): Promise<void> {
    await this.deps.store.setStatus(run.config.sessionId, { ...run.status })
    this.deps.emit?.('status', { ...run.status })
  }
}

function renderPrompt(template: string, config: LoopConfig): string {
  const globs = config.targetGlobs.filter((g) => g.trim().length > 0)
  const targetGlobsLine = globs.length > 0 ? ` Edit only files matching: ${globs.join(', ')}.` : ''
  return template
    .replace('{program}', config.program.trim() || '(no task specified)')
    .replace('{targetGlobsLine}', targetGlobsLine)
}

function tail(text: string, max = 2048): string {
  if (text.length <= max) return text
  return text.slice(text.length - max)
}
```

- [ ] **Step 2: Write the test helpers**

Create `resources/plugins/manifold.loop/src/engine.test-helpers.ts`:

```ts
import { LoopEngine, type LoopEngineDeps, type TurnOutcome } from './engine'
import type { LoopGitAdapter } from './git'
import type { LoopEvalRunner } from './eval-runner'
import type { Judge } from './judge'
import type { LoopStore } from './store'
import type { LoopConfig, LoopIteration, LoopStatus } from './types'

export const SESSION_ID = 'sess-1'
export const WORKTREE = '/tmp/wt'

export function makeFakeGit(): LoopGitAdapter & { commits: Array<{ msg: string; sha: string }>; resets: string[]; headShas: string[]; changedFiles: number[]; getDiff: LoopGitAdapter['getDiff'] } {
  const commits: Array<{ msg: string; sha: string }> = []
  const resets: string[] = []
  const headShas: string[] = ['sha-baseline']
  const changedFiles: number[] = []
  let nextSha = 1
  return {
    commits, resets, headShas, changedFiles,
    getHeadSha: async () => headShas[headShas.length - 1],
    stageAllAndCommit: async (_wt, msg) => { const sha = `sha-commit-${nextSha++}`; commits.push({ msg, sha }); headShas.push(sha); return sha },
    hardReset: async (_wt, sha) => { resets.push(sha); headShas.push(sha) },
    getChangedFilesCount: async () => changedFiles.shift() ?? 0,
    getDiff: async () => '',
  }
}

export function makeFakeEval(results: Array<{ stdout: string; exitCode: number; timedOut?: boolean }>): LoopEvalRunner {
  const queue = [...results]
  return { run: async () => { const n = queue.shift() ?? { stdout: '', exitCode: 0, timedOut: false }; return { stdout: n.stdout, exitCode: n.exitCode, timedOut: n.timedOut ?? false } } }
}

export function makeFakeJudge(results: Array<{ score: number } | { failure: string }> = []): Judge & { calls: Array<{ rubric: string; maxScore: number; evalStdout: string; diff: string; hasEvalCommand: boolean }> } {
  const calls: Array<{ rubric: string; maxScore: number; evalStdout: string; diff: string; hasEvalCommand: boolean }> = []
  const queue = [...results]
  return {
    calls,
    async judge(request) {
      calls.push({ rubric: request.rubric, maxScore: request.maxScore, evalStdout: request.evalStdout, diff: request.diff, hasEvalCommand: request.hasEvalCommand })
      return queue.shift() ?? { failure: 'no judge result queued' }
    },
  }
}

export function makeFakeLog(): LoopEngineDeps['iterationLog'] & { appended: LoopIteration[] } {
  const appended: LoopIteration[] = []
  return {
    appended,
    append: async (_wt, iter) => { appended.push(iter) },
    readAll: async () => [...appended],
    clear: async () => { appended.length = 0 },
  }
}

export function makeFakeStore(): LoopStore & { configs: Map<string, LoopConfig>; statuses: Map<string, LoopStatus> } {
  const configs = new Map<string, LoopConfig>()
  const statuses = new Map<string, LoopStatus>()
  return {
    configs, statuses,
    getConfig: async (id) => configs.get(id) ?? null,
    setConfig: async (id, c) => { configs.set(id, c) },
    getStatus: async (id) => statuses.get(id) ?? null,
    setStatus: async (id, s) => { statuses.set(id, s) },
    clearStatus: async (id) => { statuses.delete(id) },
  }
}

export function makeRunTurn(outcomes: Array<TurnOutcome>): { fn: LoopEngineDeps['runTurn']; prompts: string[] } {
  const queue = [...outcomes]
  const prompts: string[] = []
  return { prompts, fn: async (prompt, _opts, signal) => { prompts.push(prompt); if (signal.aborted) return 'aborted'; return queue.shift() ?? 'ended' } }
}

export function baseConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return {
    sessionId: SESSION_ID,
    program: 'Make the widget faster.',
    targetGlobs: ['src/**'],
    evalCommand: 'npm run bench',
    metric: { kind: 'stdout-regex', pattern: 'ms=(\\d+)', direction: 'minimize' },
    budgetSeconds: 30,
    maxIterations: 1,
    ...overrides,
  }
}

export function buildEngine(partial: Partial<LoopEngineDeps> = {}): {
  engine: LoopEngine
  git: ReturnType<typeof makeFakeGit>
  judge: ReturnType<typeof makeFakeJudge>
  log: ReturnType<typeof makeFakeLog>
  store: ReturnType<typeof makeFakeStore>
  runTurn: ReturnType<typeof makeRunTurn>
  events: Array<{ event: string; payload: unknown }>
  setActive: (id: string | undefined) => void
} {
  const git = (partial.git as ReturnType<typeof makeFakeGit>) ?? makeFakeGit()
  const judge = (partial.judge as ReturnType<typeof makeFakeJudge>) ?? makeFakeJudge()
  const log = (partial.iterationLog as ReturnType<typeof makeFakeLog>) ?? makeFakeLog()
  const store = (partial.store as ReturnType<typeof makeFakeStore>) ?? makeFakeStore()
  const runTurn = partial.runTurn ? { fn: partial.runTurn, prompts: [] as string[] } : makeRunTurn(['ended'])
  const events: Array<{ event: string; payload: unknown }> = []
  let active: string | undefined = SESSION_ID
  const engine = new LoopEngine({
    git,
    evalRunner: partial.evalRunner ?? makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]),
    judge,
    iterationLog: log,
    runTurn: runTurn.fn,
    activeSessionId: () => active,
    worktreePath: () => WORKTREE,
    store,
    emit: (event, payload) => { events.push({ event, payload }) },
    now: partial.now ?? ((): number => 1_700_000_000_000),
  })
  return { engine, git, judge, log, store, runTurn, events, setActive: (id) => { active = id } }
}
```

- [ ] **Step 3: Write the engine test (ported scenarios)**

Create `resources/plugins/manifold.loop/src/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SESSION_ID, baseConfig, buildEngine, makeFakeEval, makeFakeJudge, makeRunTurn } from './engine.test-helpers'

describe('LoopEngine — single iteration improvement', () => {
  it('prompts with the inline program text and commits on improvement', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]) })
    env.git.changedFiles.push(3)
    await env.engine.start(baseConfig({ program: 'Make the widget faster.' }))
    expect(env.runTurn.prompts[0]).toContain('Make the widget faster.')
    expect(env.git.commits.length).toBe(1)
    expect(env.git.resets.length).toBe(0)
    const iter = env.log.appended[0]
    expect(iter.outcome).toBe('improved')
    expect(iter.score).toBe(42)
    expect(iter.commitSha).toBeTruthy()
  })

  it('persists status and emits status + iteration events', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect(env.events.map((e) => e.event)).toContain('iteration')
    expect(env.events.map((e) => e.event)).toContain('status')
    const persisted = await env.engine.getStatus(SESSION_ID)
    expect(persisted?.state).toBe('finished')
    expect(persisted?.bestScore).toBe(42)
  })
})

describe('LoopEngine — llm-judge', () => {
  it('uses the judge score and skips eval when command blank', async () => {
    let evalCalled = false
    const env = buildEngine({
      evalRunner: { run: async () => { evalCalled = true; return { stdout: '', exitCode: 0, timedOut: false } } },
      judge: makeFakeJudge([{ score: 7 }]),
    })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig({ evalCommand: '   ', metric: { kind: 'llm-judge', rubric: 'r', maxScore: 10, direction: 'maximize' } }))
    expect(evalCalled).toBe(false)
    expect(env.judge.calls[0].hasEvalCommand).toBe(false)
    expect(env.log.appended[0].score).toBe(7)
  })

  it('marks iteration failed and resets when the judge fails', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ok', exitCode: 0 }]), judge: makeFakeJudge([{ failure: 'boom' }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig({ metric: { kind: 'llm-judge', rubric: 'r', maxScore: 10, direction: 'maximize' } }))
    expect(env.log.appended[0].outcome).toBe('failed')
    expect(env.git.resets.length).toBe(1)
  })
})

describe('LoopEngine — regression handling', () => {
  it('resets to baseline when worse', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=10', exitCode: 0 }, { stdout: 'ms=50', exitCode: 0 }]), runTurn: makeRunTurn(['ended', 'ended']).fn })
    env.git.changedFiles.push(2, 2)
    await env.engine.start(baseConfig({ maxIterations: 2 }))
    expect(env.git.commits.length).toBe(1)
    expect(env.git.resets.length).toBe(1)
    expect(env.log.appended[1].outcome).toBe('regressed')
  })

  it('rolls forward on regression when alwaysAdvance is set', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=10', exitCode: 0 }, { stdout: 'ms=50', exitCode: 0 }]), runTurn: makeRunTurn(['ended', 'ended']).fn })
    env.git.changedFiles.push(2, 2)
    await env.engine.start(baseConfig({ maxIterations: 2, alwaysAdvance: true }))
    expect(env.git.commits.length).toBe(2)
    expect(env.git.resets.length).toBe(0)
    expect(env.log.appended[1].commitSha).toBeTruthy()
  })
})

describe('LoopEngine — failure paths', () => {
  it('marks failed + resets when eval yields no metric', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'no metric', exitCode: 0 }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect(env.log.appended[0].outcome).toBe('failed')
    expect(env.git.resets.length).toBe(1)
  })

  it('skips eval and reports no-changes when nothing changed', async () => {
    const env = buildEngine()
    env.git.changedFiles.push(0)
    await env.engine.start(baseConfig())
    expect(env.log.appended[0].errorMessage).toContain('no changes')
  })

  it('marks aborted on turn timeout', async () => {
    const env = buildEngine({ runTurn: makeRunTurn(['timeout']).fn })
    await env.engine.start(baseConfig())
    expect(env.log.appended[0].outcome).toBe('aborted')
  })
})

describe('LoopEngine — session pinning', () => {
  it('errors when the active session changes before an iteration', async () => {
    const env = buildEngine()
    env.git.changedFiles.push(1)
    env.setActive('a-different-session')
    await env.engine.start(baseConfig())
    const status = await env.engine.getStatus(SESSION_ID)
    expect(status?.state).toBe('error')
    expect(status?.errorMessage).toContain('active session changed')
    expect(env.log.appended.length).toBe(0)
  })
})

describe('LoopEngine — start guards', () => {
  it('throws when no active agent session', async () => {
    const env = buildEngine()
    env.setActive(undefined)
    await expect(env.engine.start(baseConfig())).rejects.toThrow(/no active agent/i)
  })
})

describe('LoopEngine — getIterations', () => {
  it('returns appended iterations', async () => {
    const env = buildEngine()
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect((await env.engine.getIterations()).length).toBe(1)
  })
})
```

- [ ] **Step 4: Run the engine tests**

Run: `npx vitest run resources/plugins/manifold.loop/src/engine.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/engine.ts resources/plugins/manifold.loop/src/engine.test-helpers.ts resources/plugins/manifold.loop/src/engine.test.ts
git commit -m "feat(loop-plugin): LoopEngine — ported runner (runTurn + pinning + store)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Plugin entry — wire deps + register commands

**Files:**
- Create: `resources/plugins/manifold.loop/src/plugin.ts`

- [ ] **Step 1: Write the entry module**

Create `resources/plugins/manifold.loop/src/plugin.ts`:

```ts
// resources/plugins/manifold.loop/src/plugin.ts
import type { ManifoldContext, CancellationToken } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

import type { LoopConfig } from './types'
import { LoopEngine, type RunTurn } from './engine'
import { createGitAdapter } from './git'
import { createEvalRunner } from './eval-runner'
import { createJudge } from './judge'
import { createLoopStore } from './store'
import { appendIteration, readAllIterations, clearIterations } from './iteration-log'

/** Bridge an AbortSignal to a manifold CancellationToken for agents.runTurn. */
function tokenFromSignal(signal: AbortSignal): CancellationToken {
  return {
    get isCancellationRequested() { return signal.aborted },
    onCancellationRequested(listener: () => void) {
      if (signal.aborted) { listener(); return { dispose() {} } }
      signal.addEventListener('abort', listener, { once: true })
      return { dispose: () => signal.removeEventListener('abort', listener) }
    },
  }
}

export function activate(context: ManifoldContext): void {
  const runTurn: RunTurn = async (prompt, opts, signal) => {
    const agent = manifold.agents.activeAgent
    if (!agent) return 'aborted'
    return agent.runTurn(prompt, { budgetSeconds: opts.budgetSeconds, clearContext: opts.clearContext }, tokenFromSignal(signal))
  }

  const engine = new LoopEngine({
    git: createGitAdapter(),
    evalRunner: createEvalRunner(),
    judge: createJudge(manifold.lm),
    iterationLog: { append: appendIteration, readAll: readAllIterations, clear: clearIterations },
    runTurn,
    activeSessionId: () => manifold.agents.activeAgent?.sessionId,
    worktreePath: () => manifold.workspace.workspaceFolders?.[0]?.uri,
    store: createLoopStore(manifold.storage),
  })

  const reg = (id: string, handler: (...args: never[]) => unknown): void => {
    context.subscriptions.push(manifold.commands.registerCommand(id, handler as (...a: unknown[]) => unknown))
  }

  reg('manifold.loop.start', (config: LoopConfig) => {
    void engine.start(config).catch((err) => { console.error('[loop-plugin] run failed:', err) })
    return engine.getStatusSync(config.sessionId) ?? { sessionId: config.sessionId, state: 'running', currentIteration: 0 }
  })
  reg('manifold.loop.stop', (sessionId: string) => engine.stop(sessionId).then(() => engine.getStatus(sessionId)))
  reg('manifold.loop.status', (sessionId: string) => engine.getStatus(sessionId))
  reg('manifold.loop.iterations', () => engine.getIterations())
  reg('manifold.loop.clear', (sessionId: string) => engine.clear(sessionId))
  reg('manifold.loop.restoreBest', (sessionId: string) => engine.restoreBest(sessionId))
  reg('manifold.loop.setConfig', (sessionId: string, config: LoopConfig) => engine.setConfig(sessionId, config))
}

export function deactivate(): void {}
```

- [ ] **Step 2: Typecheck the plugin sources**

Run: `npm run typecheck:plugins`
Expected: exit 0, no errors in `resources/plugins/manifold.loop/src/*`. (If `console` is
flagged, it is allowed — the node types are in `tsconfig.plugins.json`. Fix any real type
errors in the wiring.)

- [ ] **Step 3: Build the plugin**

Run: `npm run build:plugins`
Expected: output includes `manifold.loop`, and `resources/plugins/manifold.loop/out/plugin.js` exists.

Run: `test -f resources/plugins/manifold.loop/out/plugin.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit (source only — out/ is gitignored)**

```bash
git add resources/plugins/manifold.loop/src/plugin.ts
git commit -m "feat(loop-plugin): activate() wiring + manifold.loop.* commands

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Whole-feature verification

**Files:** none (verification only)

- [ ] **Step 1: Build + full test suite**

Run: `npm run build:plugins`
Expected: builds `hello` + `manifold.loop` (and any others), no errors.

Run: `npx vitest run resources/plugins/manifold.loop`
Expected: all loop-plugin suites green (eval, iteration-log, git, eval-runner, judge, store, engine).

Run: `npx vitest run`
Expected: full suite green (1742 prior + the new loop-plugin tests).

- [ ] **Step 2: Typecheck gates**

Run: `npm run typecheck:node 2>&1 | grep -cE "error TS"` → expect `16`.
Run: `npm run typecheck:web 2>&1 | grep -cE "error TS"` → expect `36`.
Run: `npm run typecheck:plugins` → expect exit 0.

- [ ] **Step 3: Core loop untouched + file sizes**

Run: `git diff --name-only main...HEAD -- src/main/loop src/renderer/components/loop src/main/ipc/loop-handlers.ts`
Expected: **empty**.

Run: `wc -l resources/plugins/manifold.loop/src/*.ts | sort -n | tail -5`
Expected: every file < 300 LOC (engine is the largest, ~210).

- [ ] **Step 4: Record the owed manual smoke**

The engine can only be fully exercised against a live agent session. Record in
`docs/superpowers/plans/2026-06-06-loop-plugin-phase-b1-engine.md` (append a note) that the
owed dev verification is: `npm run dev`, then with an active session invoke
`manifold.loop.setConfig` + `manifold.loop.start` (via the command path) with a real config
and confirm iterations/commits appear in `~/.manifold/loop-logs` — parity with the built-in
panel. (Not runnable headlessly here.)

- [ ] **Step 5: Commit any verification note**

```bash
git add docs/superpowers/plans/2026-06-06-loop-plugin-phase-b1-engine.md
git commit -m "docs(loop-plugin): record owed B1 dev smoke

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** plugin manifest + builtin caps → Task 2. Command surface (7 commands) →
Task 10 (mirrors `loop-handlers.ts`). Ported engine (runTurn collapse, pinning) → Task 9.
git/eval/iteration-log via Node → Tasks 5/6/4. judge via `manifold.lm` → Task 7. config/status
via `storage.global` → Task 8. metric parsing → Task 3. standalone types → Task 2. tests at
every layer → Tasks 3–9. coexistence/core-untouched + sizes → Task 11. Ambient-type re-export
+ vitest glob prerequisites → Task 1. ✓

**Placeholder scan:** the only "paste verbatim" markers are in Task 7's `judge.ts`, with an
exact source (`loop-judge-adapter.ts`) and the exact function names to copy — not vague
("the engineer copies four named pure functions"). All other code is complete and literal.

**Type consistency:** `LoopGitAdapter` (Task 5), `LoopEvalRunner`/`EvalOutcome` (Task 6),
`Judge`/`JudgeRequest`/`JudgeResult`/`LmLike` (Task 7), `LoopStore`/`StorageLike` (Task 8),
`LoopEngineDeps`/`RunTurn`/`TurnOutcome`/`LoopIterationLogPort` (Task 9) are defined once and
imported consistently by `engine.ts`, the test helpers, and `plugin.ts`. `createLoopStore`,
`createGitAdapter`, `createEvalRunner`, `createJudge`, `appendIteration`/`readAllIterations`/
`clearIterations` names match across Tasks and the Task 10 wiring. The command ids match the
manifest (Task 2) and `plugin.ts` (Task 10).

**Scope:** one plugin, engine + commands + tests; UI deferred to B2; core loop untouched
(asserted Task 11). Standalone (copies, no cross-tree imports) so Phase C deletion can't
break it.

---

## Owed verification (B1)

Automated coverage is complete (53 plugin tests; full suite 1795 green; typechecks at
baseline node=16/web=36, plugins clean; build:plugins emits `manifold.loop/out/plugin.js`).
The engine can only be exercised end-to-end against a **live agent session**, which is not
runnable headlessly here. Owed dev smoke:

1. `npm run dev`.
2. With an active agent session, invoke `manifold.loop.setConfig` then `manifold.loop.start`
   (via the contributed-command path) with a real `LoopConfig`.
3. Confirm the agent is driven, eval runs, improvements commit, and iterations append to
   `~/.manifold/loop-logs/<hash>.jsonl` — parity with the built-in loop panel.
4. Confirm `~/.manifold/debug.log` shows the plugin discovered with no capability/restriction
   errors (it holds `agent:control`/`lm`, gated to builtin origin).
