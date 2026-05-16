# Verdict Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a per-session verdict record (`{task, runtime, outcome, metrics}`) to disk as each agent session reaches a terminal state, so Manifold can later build evaluator/architect features on top of real quality signal data.

**Architecture:** A new `VerdictRecorder` subscribes to existing session lifecycle hooks (`SessionManager` status listener, `FileWatcher` git-status polls, `PrCreator` success, `SessionKiller.removeWorktree`) and writes records to a JSON-backed `VerdictStore` at `~/.manifold/verdicts.json`. Long prompts are head/tail-preserved with the middle replaced by an LLM-generated one-line summary produced via the existing Watch tab's AI credentials (OpenAI or Azure OpenAI). v1 exposes only collection + read-only IPC; UI is a follow-up.

**Tech Stack:** TypeScript, Electron main process, Node `fs`/`fetch`, Vitest co-located tests, existing patterns from `SettingsStore`, `ShellTabStore`, `transcriber.ts`.

---

## File Structure

**Create:**
- `src/shared/verdict-types.ts` — `VerdictRecord`, `TaskPrompt`, `VerdictOutcome`
- `src/main/store/verdict-store.ts` — JSON persistence at `~/.manifold/verdicts.json`
- `src/main/store/verdict-store.test.ts`
- `src/main/store/prompt-summarizer.ts` — LLM call with fallback
- `src/main/store/prompt-summarizer.test.ts`
- `src/main/session/verdict-recorder.ts` — lifecycle subscriber + finalization
- `src/main/session/verdict-recorder.test.ts`
- `src/main/ipc/verdict-handlers.ts`
- `src/main/ipc/verdict-handlers.test.ts`

**Modify:**
- `src/shared/watch-types.ts` — rename `TranscriptionSettings` → `AiServiceSettings`, add `chatModel` + `azureChatDeployment` fields
- `src/shared/types.ts` — update import (line 94)
- `src/main/watch/transcriber.ts` — update import + usage to `AiServiceSettings`
- `src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx` — add chat model / chat deployment inputs
- `src/renderer/components/modals/settings/TranscriptionSettingsSection.test.tsx` — extend coverage
- `src/renderer/components/modals/settings/SettingsModalBody.tsx` — update import
- `src/main/ipc/types.ts` — add `verdictStore: VerdictStore` to `IpcDependencies`
- `src/main/app/index.ts` — instantiate `VerdictStore`, `VerdictRecorder`, wire into existing managers + DI bag
- `src/main/app/ipc-handlers.ts` — register `verdict-handlers`
- `src/preload/index.ts` — add `'verdicts:list'` and `'verdicts:get'` to `ALLOWED_INVOKE_CHANNELS`

---

## Task 1: Rename `TranscriptionSettings` → `AiServiceSettings` and add chat fields

**Files:**
- Modify: `src/shared/watch-types.ts`
- Modify: `src/shared/types.ts:94`
- Modify: `src/main/watch/transcriber.ts:6` (import + line 49 usage)
- Modify: `src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx:2,6,7,19`
- Modify: `src/renderer/components/modals/settings/SettingsModalBody.tsx:4`

- [ ] **Step 1: Update `src/shared/watch-types.ts`**

Replace the first 9 lines of the file with:

```ts
export type AiServiceProvider = 'openai' | 'azure' | 'none'

export interface AiServiceSettings {
  provider: AiServiceProvider
  openaiApiKey?: string
  azureApiKey?: string
  azureEndpoint?: string
  azureDeployment?: string          // transcription deployment (existing)
  chatModel?: string                // text/chat model (default 'gpt-5.1')
  azureChatDeployment?: string      // Azure chat deployment (no default)
}

/** @deprecated Use AiServiceSettings. Kept as alias during migration. */
export type TranscriptionSettings = AiServiceSettings
/** @deprecated Use AiServiceProvider. */
export type TranscriptionProvider = AiServiceProvider
```

Leaving the deprecated aliases avoids breaking any places we missed; we can drop them once typecheck is clean.

- [ ] **Step 2: Update `src/shared/types.ts` line 94**

Change:
```ts
  transcription?: import('./watch-types').TranscriptionSettings
```
To:
```ts
  transcription?: import('./watch-types').AiServiceSettings
```

- [ ] **Step 3: Update `src/main/watch/transcriber.ts`**

Change line 6 from:
```ts
import type { TranscriptionSettings } from '../../shared/watch-types'
```
To:
```ts
import type { AiServiceSettings } from '../../shared/watch-types'
```

Change line 49 from:
```ts
  settings: TranscriptionSettings
```
To:
```ts
  settings: AiServiceSettings
```

- [ ] **Step 4: Update `TranscriptionSettingsSection.tsx`**

Change line 2:
```ts
import type { AiServiceSettings } from '../../../../shared/watch-types'
```

Change lines 6–7:
```ts
  value: AiServiceSettings
  onChange: (next: AiServiceSettings) => void
```

Change line 19:
```ts
const PROVIDER_LABELS: Record<AiServiceSettings['provider'], string> = {
```

- [ ] **Step 5: Update `SettingsModalBody.tsx` line 4**

```ts
import type { AiServiceSettings } from '../../../../shared/watch-types'
```

Search the file for `TranscriptionSettings` and rename each occurrence to `AiServiceSettings`.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 7: Commit**

```bash
git add src/shared/watch-types.ts src/shared/types.ts src/main/watch/transcriber.ts src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx src/renderer/components/modals/settings/SettingsModalBody.tsx
git commit -m "Rename TranscriptionSettings to AiServiceSettings; add chat model fields"
```

---

## Task 2: Expose chat model + chat deployment in settings UI

**Files:**
- Modify: `src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx`
- Modify: `src/renderer/components/modals/settings/TranscriptionSettingsSection.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `TranscriptionSettingsSection.test.tsx` inside the existing `describe` block:

```tsx
  it('shows chat model input for openai with default placeholder', () => {
    render(<TranscriptionSettingsSection value={{ provider: 'openai' }} onChange={vi.fn()} />)
    const input = screen.getByLabelText(/CHAT_MODEL/i) as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.placeholder).toBe('gpt-5.1')
  })

  it('emits chatModel change for openai', () => {
    const onChange = vi.fn()
    render(<TranscriptionSettingsSection value={{ provider: 'openai' }} onChange={onChange} />)
    const input = screen.getByLabelText(/CHAT_MODEL/i)
    fireEvent.change(input, { target: { value: 'gpt-4o-mini' } })
    expect(onChange).toHaveBeenCalledWith({ provider: 'openai', chatModel: 'gpt-4o-mini' })
  })

  it('shows azure chat deployment input for azure', () => {
    render(<TranscriptionSettingsSection value={{ provider: 'azure' }} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/AZURE_OPENAI_CHAT_DEPLOYMENT/i)).toBeTruthy()
  })
```

If `fireEvent` / `screen` aren't already imported at the top, add:
```ts
import { fireEvent, screen } from '@testing-library/react'
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/renderer/components/modals/settings/TranscriptionSettingsSection.test.tsx`
Expected: FAIL — no element with the new labels.

- [ ] **Step 3: Add the inputs to `TranscriptionSettingsSection.tsx`**

Inside the `value.provider === 'openai'` block, after the existing `OPENAI_API_KEY` field row, add:

```tsx
            <div style={fieldRow}>
              <label style={labelStyle}>CHAT_MODEL</label>
              <input
                type="text"
                style={inputStyle}
                value={value.chatModel ?? ''}
                placeholder="gpt-5.1"
                onChange={(e) => onChange({ ...value, chatModel: e.target.value })}
              />
            </div>
```

Inside the `value.provider === 'azure'` block, after the `AZURE_OPENAI_DEPLOYMENT` field row, add:

```tsx
            <div style={fieldRow}>
              <label style={labelStyle}>AZURE_OPENAI_CHAT_DEPLOYMENT</label>
              <input
                type="text"
                style={inputStyle}
                value={value.azureChatDeployment ?? ''}
                placeholder="gpt-4o-mini"
                onChange={(e) => onChange({ ...value, azureChatDeployment: e.target.value })}
              />
            </div>
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/renderer/components/modals/settings/TranscriptionSettingsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx src/renderer/components/modals/settings/TranscriptionSettingsSection.test.tsx
git commit -m "Add chat model and Azure chat deployment inputs to settings"
```

---

## Task 3: Create shared verdict types

**Files:**
- Create: `src/shared/verdict-types.ts`

- [ ] **Step 1: Write `src/shared/verdict-types.ts`**

```ts
export type VerdictOutcome =
  | 'merged'
  | 'pr_created'
  | 'committed_only'
  | 'discarded'
  | 'unknown'

export type TaskPrompt =
  | { kind: 'full'; text: string }
  | {
      kind: 'truncated'
      head: string                // first ~1 KB
      middleSummary: string       // LLM-derived one-liner or '[middle omitted — N chars]'
      tail: string                // last ~1 KB
      originalLength: number
    }

export interface VerdictMetrics {
  agentCommits: number
  humanEdits: number
  diffLines: { added: number; removed: number }
  filesChanged: number
  prUrl?: string
}

export interface VerdictRecord {
  sessionId: string
  projectId: string
  branch: string
  runtime: string
  taskPrompt: TaskPrompt
  outcome: VerdictOutcome
  createdAt: string               // ISO 8601
  terminatedAt?: string           // ISO 8601, set when outcome becomes terminal
  durationMs?: number
  metrics: VerdictMetrics
}

export interface VerdictListRequest {
  projectId: string
  limit?: number
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/verdict-types.ts
git commit -m "Add shared verdict types"
```

---

## Task 4: Implement `VerdictStore` with tests

**Files:**
- Create: `src/main/store/verdict-store.ts`
- Create: `src/main/store/verdict-store.test.ts`

The store mirrors the pattern of `ShellTabStore` (`src/main/store/shell-tab-store.ts`): in-memory map + JSON file at `~/.manifold/verdicts.json`. Indexed by `sessionId`. FIFO eviction caps at 1000 records per project.

- [ ] **Step 1: Write the failing test**

Create `src/main/store/verdict-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { VerdictStore } from './verdict-store'
import type { VerdictRecord } from '../../shared/verdict-types'

function record(overrides: Partial<VerdictRecord> = {}): VerdictRecord {
  return {
    sessionId: 's1',
    projectId: 'p1',
    branch: 'manifold/foo',
    runtime: 'claude',
    taskPrompt: { kind: 'full', text: 'do the thing' },
    outcome: 'unknown',
    createdAt: '2026-05-16T00:00:00.000Z',
    metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
    ...overrides,
  }
}

describe('VerdictStore', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-store-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('upsert + getBySessionId round-trips', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'abc' }))
    expect(store.getBySessionId('abc')?.sessionId).toBe('abc')
  })

  it('upsert replaces the existing record for the same sessionId', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'abc', outcome: 'unknown' }))
    store.upsert(record({ sessionId: 'abc', outcome: 'merged' }))
    expect(store.getBySessionId('abc')?.outcome).toBe('merged')
    expect(store.listByProject('p1').length).toBe(1)
  })

  it('persists to disk and reloads on construction', () => {
    const file = path.join(tmp, 'v.json')
    const s1 = new VerdictStore(file)
    s1.upsert(record({ sessionId: 'abc' }))
    const s2 = new VerdictStore(file)
    expect(s2.getBySessionId('abc')?.sessionId).toBe('abc')
  })

  it('listByProject filters by projectId and respects limit', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'a', projectId: 'p1' }))
    store.upsert(record({ sessionId: 'b', projectId: 'p2' }))
    store.upsert(record({ sessionId: 'c', projectId: 'p1' }))
    expect(store.listByProject('p1').map((r) => r.sessionId).sort()).toEqual(['a', 'c'])
    expect(store.listByProject('p1', 1).length).toBe(1)
  })

  it('FIFO-evicts beyond 1000 records per project on write', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    for (let i = 0; i < 1005; i++) {
      store.upsert(record({ sessionId: `s${i}`, projectId: 'p1' }))
    }
    const list = store.listByProject('p1')
    expect(list.length).toBe(1000)
    expect(list.some((r) => r.sessionId === 's0')).toBe(false)
    expect(list.some((r) => r.sessionId === 's1004')).toBe(true)
  })

  it('returns null for missing sessionId', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    expect(store.getBySessionId('missing')).toBeNull()
  })

  it('tolerates corrupt JSON on load (returns empty)', () => {
    const file = path.join(tmp, 'v.json')
    fs.writeFileSync(file, 'not json', 'utf-8')
    const store = new VerdictStore(file)
    expect(store.listByProject('p1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/main/store/verdict-store.test.ts`
Expected: FAIL — `VerdictStore` not defined.

- [ ] **Step 3: Implement `src/main/store/verdict-store.ts`**

```ts
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { VerdictRecord } from '../../shared/verdict-types'

const DEFAULT_PATH = path.join(os.homedir(), '.manifold', 'verdicts.json')
const MAX_PER_PROJECT = 1000

export class VerdictStore {
  private readonly file: string
  private records: VerdictRecord[]

  constructor(file: string = DEFAULT_PATH) {
    this.file = file
    this.records = this.loadFromDisk()
  }

  private loadFromDisk(): VerdictRecord[] {
    try {
      if (!fs.existsSync(this.file)) return []
      const raw = fs.readFileSync(this.file, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed as VerdictRecord[]
    } catch {
      return []
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    fs.writeFileSync(this.file, JSON.stringify(this.records, null, 2), 'utf-8')
  }

  upsert(record: VerdictRecord): void {
    const existing = this.records.findIndex((r) => r.sessionId === record.sessionId)
    if (existing >= 0) {
      this.records[existing] = record
    } else {
      this.records.push(record)
      this.evictIfNeeded(record.projectId)
    }
    this.writeToDisk()
  }

  private evictIfNeeded(projectId: string): void {
    const indicesForProject = this.records
      .map((r, i) => (r.projectId === projectId ? i : -1))
      .filter((i) => i >= 0)
    if (indicesForProject.length <= MAX_PER_PROJECT) return
    const evictCount = indicesForProject.length - MAX_PER_PROJECT
    const toDrop = new Set(indicesForProject.slice(0, evictCount))
    this.records = this.records.filter((_, i) => !toDrop.has(i))
  }

  getBySessionId(sessionId: string): VerdictRecord | null {
    return this.records.find((r) => r.sessionId === sessionId) ?? null
  }

  listByProject(projectId: string, limit?: number): VerdictRecord[] {
    const all = this.records.filter((r) => r.projectId === projectId)
    return limit !== undefined ? all.slice(-limit) : all
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/store/verdict-store.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/store/verdict-store.ts src/main/store/verdict-store.test.ts
git commit -m "Add VerdictStore with FIFO eviction at 1000 per project"
```

---

## Task 5: Implement `PromptSummarizer` with tests

**Files:**
- Create: `src/main/store/prompt-summarizer.ts`
- Create: `src/main/store/prompt-summarizer.test.ts`

Same provider/credentials shape as `transcriber.ts` but targeting chat completions. On any failure (missing key, non-2xx, timeout, network error) return the deterministic fallback string — never throw.

- [ ] **Step 1: Write the failing test**

Create `src/main/store/prompt-summarizer.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { summarizeMiddle, DEFAULT_CHAT_MODEL } from './prompt-summarizer'
import type { AiServiceSettings } from '../../shared/watch-types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('summarizeMiddle', () => {
  it('returns fallback when provider is none', async () => {
    const out = await summarizeMiddle('long middle', { provider: 'none' }, fetch)
    expect(out).toBe('[middle omitted — 11 chars]')
  })

  it('returns fallback when openai key missing', async () => {
    const out = await summarizeMiddle('long middle', { provider: 'openai' }, fetch)
    expect(out).toBe('[middle omitted — 11 chars]')
  })

  it('uses default model when chatModel unset', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe(DEFAULT_CHAT_MODEL)
      return jsonResponse({ choices: [{ message: { content: 'summary text' } }] })
    })
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk-x' }
    const out = await summarizeMiddle('middle content', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('summary text')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('uses configured chatModel for openai', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe('gpt-4o-mini')
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    })
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk', chatModel: 'gpt-4o-mini' }
    await summarizeMiddle('m', settings, fetchMock as unknown as typeof fetch)
  })

  it('falls back on non-2xx', async () => {
    const fetchMock = vi.fn(async () => new Response('rate limited', { status: 429 }))
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk' }
    const out = await summarizeMiddle('hello world', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('[middle omitted — 11 chars]')
  })

  it('falls back on network error', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('net down') })
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk' }
    const out = await summarizeMiddle('hello', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('[middle omitted — 5 chars]')
  })

  it('hits azure deployment URL', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toMatch(/openai\.azure\.com\/openai\/deployments\/chatdep\/chat\/completions/)
      return jsonResponse({ choices: [{ message: { content: 'azure summary' } }] })
    })
    const settings: AiServiceSettings = {
      provider: 'azure',
      azureApiKey: 'k',
      azureEndpoint: 'https://res.openai.azure.com',
      azureChatDeployment: 'chatdep',
    }
    const out = await summarizeMiddle('m', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('azure summary')
  })

  it('azure falls back when chat deployment missing', async () => {
    const fetchMock = vi.fn()
    const settings: AiServiceSettings = {
      provider: 'azure', azureApiKey: 'k', azureEndpoint: 'https://x',
    }
    const out = await summarizeMiddle('middle', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('[middle omitted — 6 chars]')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps the summary at 200 chars', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'x'.repeat(500) } }] }),
    )
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk' }
    const out = await summarizeMiddle('m', settings, fetchMock as unknown as typeof fetch)
    expect(out.length).toBeLessThanOrEqual(200)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/main/store/prompt-summarizer.test.ts`
Expected: FAIL — `summarizeMiddle` not defined.

- [ ] **Step 3: Implement `src/main/store/prompt-summarizer.ts`**

```ts
import type { AiServiceSettings } from '../../shared/watch-types'

export const DEFAULT_CHAT_MODEL = 'gpt-5.1'
const AZURE_API_VERSION = '2024-06-01'
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MAX_SUMMARY_CHARS = 200
const TIMEOUT_MS = 10_000

const SYSTEM_PROMPT =
  "Summarize the user's prompt content in a single sentence (max 200 chars). " +
  'Focus on intent and constraints. Output only the summary, no preamble.'

function fallback(middle: string): string {
  return `[middle omitted — ${middle.length} chars]`
}

export async function summarizeMiddle(
  middle: string,
  settings: AiServiceSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  try {
    if (settings.provider === 'none') return fallback(middle)
    if (settings.provider === 'openai') {
      const key = settings.openaiApiKey?.trim()
      if (!key) return fallback(middle)
      const summary = await postOpenAi(middle, key, settings.chatModel ?? DEFAULT_CHAT_MODEL, fetchImpl)
      return capSummary(summary, middle)
    }
    if (settings.provider === 'azure') {
      const key = settings.azureApiKey?.trim()
      const endpoint = settings.azureEndpoint?.trim()
      const deployment = settings.azureChatDeployment?.trim()
      if (!key || !endpoint || !deployment) return fallback(middle)
      const summary = await postAzure(middle, key, endpoint, deployment, fetchImpl)
      return capSummary(summary, middle)
    }
    return fallback(middle)
  } catch {
    return fallback(middle)
  }
}

async function postOpenAi(middle: string, apiKey: string, model: string, fetchImpl: typeof fetch): Promise<string> {
  const res = await withTimeout(
    fetchImpl(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: middle },
        ],
        temperature: 0,
      }),
    }),
    TIMEOUT_MS,
  )
  return readChatText(res)
}

async function postAzure(
  middle: string, apiKey: string, endpoint: string, deployment: string, fetchImpl: typeof fetch,
): Promise<string> {
  const base = endpoint.replace(/\/+$/, '')
  const url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${AZURE_API_VERSION}`
  const res = await withTimeout(
    fetchImpl(url, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: middle },
        ],
        temperature: 0,
      }),
    }),
    TIMEOUT_MS,
  )
  return readChatText(res)
}

async function readChatText(res: Response): Promise<string> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('empty completion')
  return text
}

function capSummary(text: string, _middle: string): string {
  return text.length <= MAX_SUMMARY_CHARS ? text : text.slice(0, MAX_SUMMARY_CHARS)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/store/prompt-summarizer.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/store/prompt-summarizer.ts src/main/store/prompt-summarizer.test.ts
git commit -m "Add PromptSummarizer with OpenAI/Azure providers and silent fallback"
```

---

## Task 6: Implement `VerdictRecorder` skeleton with init + finalize

**Files:**
- Create: `src/main/session/verdict-recorder.ts`
- Create: `src/main/session/verdict-recorder.test.ts`

This task introduces the recorder with two public methods: `onSessionCreated` and `onSessionTerminated`. Per-event hooks (status, file watcher, PR) land in Task 7. Splitting keeps reviewable diffs small.

- [ ] **Step 1: Write the failing test**

Create `src/main/session/verdict-recorder.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder } from './verdict-recorder'
import type { AiServiceSettings } from '../../shared/watch-types'

function makeRecorder(tmp: string, opts: Partial<{
  aheadBehind: { ahead: number; behind: number }
  diffLines: { added: number; removed: number }
  filesChanged: number
  isBranchMerged: boolean
  aiSettings: AiServiceSettings
  summarizer: (m: string) => Promise<string>
}> = {}) {
  const store = new VerdictStore(path.join(tmp, 'v.json'))
  const recorder = new VerdictRecorder({
    store,
    getAiSettings: () => opts.aiSettings ?? { provider: 'none' },
    getAheadBehind: vi.fn(async () => opts.aheadBehind ?? { ahead: 0, behind: 0 }),
    getDiffStats: vi.fn(async () => ({
      diffLines: opts.diffLines ?? { added: 0, removed: 0 },
      filesChanged: opts.filesChanged ?? 0,
    })),
    isBranchMerged: vi.fn(async () => opts.isBranchMerged ?? false),
    summarize: opts.summarizer ?? (async (m) => `[middle omitted — ${m.length} chars]`),
    now: () => new Date('2026-05-16T00:00:00.000Z'),
  })
  return { store, recorder }
}

describe('VerdictRecorder', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-rec-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('writes an unknown-outcome record on session creation', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 'short prompt', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    const rec = store.getBySessionId('s1')
    expect(rec).not.toBeNull()
    expect(rec!.outcome).toBe('unknown')
    expect(rec!.taskPrompt).toEqual({ kind: 'full', text: 'short prompt' })
    expect(rec!.metrics).toEqual({
      agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0,
    })
  })

  it('truncates prompts over 2KB into head/tail with summary middle', async () => {
    const longHead = 'H'.repeat(1024)
    const longMiddle = 'M'.repeat(500)
    const longTail = 'T'.repeat(1024)
    const long = longHead + longMiddle + longTail
    const { store, recorder } = makeRecorder(tmp, {
      summarizer: async () => 'summarized middle',
    })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: long, worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    const rec = store.getBySessionId('s1')!
    expect(rec.taskPrompt.kind).toBe('truncated')
    if (rec.taskPrompt.kind === 'truncated') {
      expect(rec.taskPrompt.head.length).toBe(1024)
      expect(rec.taskPrompt.tail.length).toBe(1024)
      expect(rec.taskPrompt.middleSummary).toBe('summarized middle')
      expect(rec.taskPrompt.originalLength).toBe(long.length)
    }
  })

  it('finalizes outcome=merged when the branch is merged', async () => {
    const { store, recorder } = makeRecorder(tmp, { isBranchMerged: true })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    expect(store.getBySessionId('s1')!.outcome).toBe('merged')
  })

  it('finalizes outcome=discarded when no commits and not merged', async () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    expect(store.getBySessionId('s1')!.outcome).toBe('discarded')
  })

  it('snapshots diff stats and durationMs on termination', async () => {
    const { store, recorder } = makeRecorder(tmp, {
      diffLines: { added: 12, removed: 3 }, filesChanged: 2,
    })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.diffLines).toEqual({ added: 12, removed: 3 })
    expect(rec.metrics.filesChanged).toBe(2)
    expect(rec.terminatedAt).toBeDefined()
    expect(rec.durationMs).toBeDefined()
  })

  it('ignores onSessionTerminated for unknown sessionId', async () => {
    const { recorder } = makeRecorder(tmp)
    await expect(recorder.onSessionTerminated('nope')).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/main/session/verdict-recorder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/session/verdict-recorder.ts`**

```ts
import type { VerdictStore } from '../store/verdict-store'
import type { VerdictRecord, TaskPrompt } from '../../shared/verdict-types'
import type { AiServiceSettings } from '../../shared/watch-types'

const FULL_THRESHOLD = 2048
const HEAD_TAIL_BYTES = 1024

export interface SessionCreatedEvent {
  sessionId: string
  projectId: string
  branch: string
  runtime: string
  taskPrompt: string
  worktreePath: string
  baseBranch: string
}

export interface VerdictRecorderDeps {
  store: VerdictStore
  getAiSettings: () => AiServiceSettings
  getAheadBehind: (worktreePath: string, baseBranch: string) => Promise<{ ahead: number; behind: number }>
  getDiffStats: (worktreePath: string, baseBranch: string) => Promise<{
    diffLines: { added: number; removed: number }
    filesChanged: number
  }>
  isBranchMerged: (worktreePath: string, baseBranch: string, branch: string) => Promise<boolean>
  summarize: (middle: string, settings: AiServiceSettings) => Promise<string>
  now?: () => Date
}

interface ActiveSession {
  worktreePath: string
  baseBranch: string
  createdAtMs: number
}

export class VerdictRecorder {
  private active = new Map<string, ActiveSession>()
  private readonly now: () => Date

  constructor(private readonly deps: VerdictRecorderDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  onSessionCreated(event: SessionCreatedEvent): void {
    const created = this.now()
    const record: VerdictRecord = {
      sessionId: event.sessionId,
      projectId: event.projectId,
      branch: event.branch,
      runtime: event.runtime,
      taskPrompt: { kind: 'full', text: event.taskPrompt },
      outcome: 'unknown',
      createdAt: created.toISOString(),
      metrics: {
        agentCommits: 0,
        humanEdits: 0,
        diffLines: { added: 0, removed: 0 },
        filesChanged: 0,
      },
    }
    this.deps.store.upsert(record)
    this.active.set(event.sessionId, {
      worktreePath: event.worktreePath,
      baseBranch: event.baseBranch,
      createdAtMs: created.getTime(),
    })
  }

  async onSessionTerminated(sessionId: string): Promise<void> {
    const existing = this.deps.store.getBySessionId(sessionId)
    const tracked = this.active.get(sessionId)
    if (!existing || !tracked) return

    const { diffLines, filesChanged } = await safe(
      () => this.deps.getDiffStats(tracked.worktreePath, tracked.baseBranch),
      { diffLines: existing.metrics.diffLines, filesChanged: existing.metrics.filesChanged },
    )

    const merged = await safe(
      () => this.deps.isBranchMerged(tracked.worktreePath, tracked.baseBranch, existing.branch),
      false,
    )

    const outcome = this.resolveTerminalOutcome(existing, merged)
    const terminatedDate = this.now()
    const taskPrompt = await this.maybeTruncatePrompt(existing.taskPrompt)

    this.deps.store.upsert({
      ...existing,
      taskPrompt,
      outcome,
      terminatedAt: terminatedDate.toISOString(),
      durationMs: terminatedDate.getTime() - tracked.createdAtMs,
      metrics: { ...existing.metrics, diffLines, filesChanged },
    })
    this.active.delete(sessionId)
  }

  private resolveTerminalOutcome(record: VerdictRecord, merged: boolean): VerdictRecord['outcome'] {
    if (merged) return 'merged'
    if (record.outcome === 'pr_created') return 'pr_created'
    if (record.metrics.agentCommits > 0) return 'committed_only'
    return 'discarded'
  }

  private async maybeTruncatePrompt(prompt: TaskPrompt): Promise<TaskPrompt> {
    if (prompt.kind !== 'full') return prompt
    const text = prompt.text
    if (text.length <= FULL_THRESHOLD) return prompt
    const head = text.slice(0, HEAD_TAIL_BYTES)
    const tail = text.slice(-HEAD_TAIL_BYTES)
    const middle = text.slice(HEAD_TAIL_BYTES, -HEAD_TAIL_BYTES)
    const middleSummary = await safe(
      () => this.deps.summarize(middle, this.deps.getAiSettings()),
      `[middle omitted — ${middle.length} chars]`,
    )
    return { kind: 'truncated', head, middleSummary, tail, originalLength: text.length }
  }
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch { return fallback }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/session/verdict-recorder.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/session/verdict-recorder.ts src/main/session/verdict-recorder.test.ts
git commit -m "Add VerdictRecorder with creation + termination paths"
```

---

## Task 7: Add per-event hooks (status, file watcher, PR)

**Files:**
- Modify: `src/main/session/verdict-recorder.ts`
- Modify: `src/main/session/verdict-recorder.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `verdict-recorder.test.ts`:

```ts
describe('VerdictRecorder per-event hooks', () => {
  let tmp: string

  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-rec-h-')) })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('increments humanEdits only when status is not running', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onStatus('s1', 'running')
    recorder.onFilesChanged('s1')        // ignored — agent is running
    recorder.onStatus('s1', 'waiting')
    recorder.onFilesChanged('s1')        // counted
    recorder.onFilesChanged('s1')        // counted
    expect(store.getBySessionId('s1')!.metrics.humanEdits).toBe(2)
  })

  it('increments agentCommits and sets outcome=committed_only', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onAgentCommit('s1')
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.agentCommits).toBe(1)
    expect(rec.outcome).toBe('committed_only')
  })

  it('onPrCreated sets outcome=pr_created and stores prUrl', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onPrCreated('s1', 'https://github.com/o/r/pull/9')
    const rec = store.getBySessionId('s1')!
    expect(rec.outcome).toBe('pr_created')
    expect(rec.metrics.prUrl).toBe('https://github.com/o/r/pull/9')
  })

  it('finalize keeps pr_created outcome when branch not merged', async () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onPrCreated('s1', 'https://example/1')
    await recorder.onSessionTerminated('s1')
    expect(store.getBySessionId('s1')!.outcome).toBe('pr_created')
  })

  it('hooks for unknown sessionId are silently ignored', () => {
    const { recorder } = makeRecorder(tmp)
    expect(() => recorder.onStatus('nope', 'running')).not.toThrow()
    expect(() => recorder.onFilesChanged('nope')).not.toThrow()
    expect(() => recorder.onAgentCommit('nope')).not.toThrow()
    expect(() => recorder.onPrCreated('nope', 'u')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/main/session/verdict-recorder.test.ts`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Extend `VerdictRecorder`**

In `verdict-recorder.ts`, extend `ActiveSession`:

```ts
interface ActiveSession {
  worktreePath: string
  baseBranch: string
  createdAtMs: number
  lastStatus: string
}
```

Update `onSessionCreated` to set `lastStatus: 'unknown'` when populating `this.active`. Then add the four new public methods to the class:

```ts
  onStatus(sessionId: string, status: string): void {
    const tracked = this.active.get(sessionId)
    if (!tracked) return
    tracked.lastStatus = status
  }

  onFilesChanged(sessionId: string): void {
    const tracked = this.active.get(sessionId)
    if (!tracked) return
    if (tracked.lastStatus === 'running') return
    const existing = this.deps.store.getBySessionId(sessionId)
    if (!existing) return
    this.deps.store.upsert({
      ...existing,
      metrics: { ...existing.metrics, humanEdits: existing.metrics.humanEdits + 1 },
    })
  }

  onAgentCommit(sessionId: string): void {
    const existing = this.deps.store.getBySessionId(sessionId)
    if (!existing) return
    const next: VerdictRecord = {
      ...existing,
      metrics: { ...existing.metrics, agentCommits: existing.metrics.agentCommits + 1 },
    }
    if (next.outcome === 'unknown') next.outcome = 'committed_only'
    this.deps.store.upsert(next)
  }

  onPrCreated(sessionId: string, prUrl: string): void {
    const existing = this.deps.store.getBySessionId(sessionId)
    if (!existing) return
    this.deps.store.upsert({
      ...existing,
      outcome: 'pr_created',
      metrics: { ...existing.metrics, prUrl },
    })
  }
```

- [ ] **Step 4: Run all recorder tests**

Run: `npx vitest run src/main/session/verdict-recorder.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/session/verdict-recorder.ts src/main/session/verdict-recorder.test.ts
git commit -m "Add per-event hooks to VerdictRecorder (status/files/commit/PR)"
```

---

## Task 8: Add `isBranchMerged` to `GitOperationsManager`

The recorder needs to ask "has this branch been merged into base?" The existing `getAheadBehind` returns ahead/behind counts. `ahead === 0` against base means branch tip is reachable from base (i.e., merged or ancestor). We add a small wrapper so the recorder doesn't hard-code git invariants.

**Files:**
- Modify: `src/main/git/git-operations.ts`
- Create: `src/main/git/git-operations.merged.test.ts` (or extend an existing test file if straightforward)

- [ ] **Step 1: Write the failing test**

Create `src/main/git/git-operations.merged.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as childProcess from 'node:child_process'
import { GitOperationsManager } from './git-operations'

describe('GitOperationsManager.isBranchMerged', () => {
  let execFileSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    execFileSpy = vi.spyOn(childProcess, 'execFile')
  })
  afterEach(() => { execFileSpy.mockRestore() })

  function mockExecFile(stdout: string): void {
    // execFile(file, args, opts, cb)
    execFileSpy.mockImplementation(((_f: string, _a: string[], _o: unknown, cb: (e: Error | null, r: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout, stderr: '' })
      return {} as unknown as childProcess.ChildProcess
    }) as unknown as typeof childProcess.execFile)
  }

  it('returns true when merge-base equals branch tip', async () => {
    mockExecFile('') // git merge-base --is-ancestor exits 0 (no output)
    const gitOps = new GitOperationsManager()
    const merged = await gitOps.isBranchMerged('/tmp/wt', 'main', 'manifold/foo')
    expect(merged).toBe(true)
  })

  it('returns false when not merged', async () => {
    execFileSpy.mockImplementation(((_f: string, _a: string[], _o: unknown, cb: (e: Error & { code?: number } | null) => void) => {
      const err = new Error('not ancestor') as Error & { code?: number }
      err.code = 1
      cb(err)
      return {} as unknown as childProcess.ChildProcess
    }) as unknown as typeof childProcess.execFile)
    const gitOps = new GitOperationsManager()
    const merged = await gitOps.isBranchMerged('/tmp/wt', 'main', 'manifold/foo')
    expect(merged).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/main/git/git-operations.merged.test.ts`
Expected: FAIL — `isBranchMerged` not defined.

- [ ] **Step 3: Add the method to `GitOperationsManager`**

In `src/main/git/git-operations.ts`, add the following method to the `GitOperationsManager` class. The class already imports `execFileAsync = promisify(execFile)`. Insert after `getAheadBehind`:

```ts
  async isBranchMerged(worktreePath: string, baseBranch: string, branch: string): Promise<boolean> {
    try {
      await execFileAsync(
        'git',
        ['merge-base', '--is-ancestor', branch, baseBranch],
        { cwd: worktreePath },
      )
      return true
    } catch {
      return false
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/git/git-operations.merged.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/git/git-operations.ts src/main/git/git-operations.merged.test.ts
git commit -m "Add GitOperationsManager.isBranchMerged"
```

---

## Task 9: Add diff stats helper to `DiffProvider`

The recorder needs `{ added, removed, filesChanged }`. `DiffProvider` already returns the diff text via `getDiff`. We add a small numstat-based helper to avoid parsing the diff text.

**Files:**
- Modify: `src/main/git/diff-provider.ts`
- Modify: `src/main/git/diff-provider.test.ts` (add cases)

- [ ] **Step 1: Add the failing test**

Append to `src/main/git/diff-provider.test.ts` (replace `tmpdir` logic with the existing test's helper if needed — the snippet below is self-contained):

```ts
describe('DiffProvider.getDiffStats', () => {
  it('returns added/removed counts and filesChanged from numstat', async () => {
    const provider = new DiffProvider()
    const fakeExec = vi.fn().mockResolvedValue({ stdout: '5\t2\tsrc/a.ts\n0\t10\tsrc/b.ts\n', stderr: '' })
    // monkey-patch private execGit-style call: easier to mock gitExec via require — instead,
    // call the real method against a fixture repo. See helper buildRepo() if present;
    // else replace with an integration approach using execSync.
    // For this plan use the gitExec mock as in other tests in this file.
  })
})
```

> **Implementation note:** If `diff-provider.test.ts` already mocks `gitExec`, follow that pattern. If it uses a real repo fixture, follow that — do not introduce a new mocking style.

Inspect `src/main/git/diff-provider.test.ts` and adapt the test below to whatever style the file already uses. Concretely, the new test must:
- Stub `git diff --numstat ${baseBranch}` to return `5\t2\tsrc/a.ts\n0\t10\tsrc/b.ts\n`
- Assert `getDiffStats(...)` returns `{ diffLines: { added: 5, removed: 12 }, filesChanged: 2 }`
- Add a second case: empty output → `{ diffLines: { added: 0, removed: 0 }, filesChanged: 0 }`

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/main/git/diff-provider.test.ts`
Expected: FAIL — `getDiffStats` not defined.

- [ ] **Step 3: Implement `getDiffStats`**

Add to `DiffProvider` in `src/main/git/diff-provider.ts`:

```ts
  async getDiffStats(
    worktreePath: string,
    baseBranch: string,
  ): Promise<{ diffLines: { added: number; removed: number }; filesChanged: number }> {
    if (!existsSync(worktreePath)) {
      return { diffLines: { added: 0, removed: 0 }, filesChanged: 0 }
    }
    try {
      const stdout = await gitExec(['diff', '--numstat', '--find-renames', baseBranch], worktreePath)
      let added = 0, removed = 0, filesChanged = 0
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue
        const [a, r] = line.split('\t')
        const aNum = parseInt(a, 10)
        const rNum = parseInt(r, 10)
        if (!Number.isNaN(aNum)) added += aNum
        if (!Number.isNaN(rNum)) removed += rNum
        filesChanged += 1
      }
      return { diffLines: { added, removed }, filesChanged }
    } catch {
      return { diffLines: { added: 0, removed: 0 }, filesChanged: 0 }
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/main/git/diff-provider.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/git/diff-provider.ts src/main/git/diff-provider.test.ts
git commit -m "Add DiffProvider.getDiffStats for verdict capture"
```

---

## Task 10: Wire the recorder through the session lifecycle

This task introduces lifecycle hooks at three integration points without changing the existing public APIs.

**Files:**
- Modify: `src/main/session/session-manager.ts`
- Modify: `src/main/session/session-killer.ts`
- Modify: `src/main/git/pr-creator.ts`
- Modify: `src/main/fs/file-watcher.ts`

- [ ] **Step 1: Add a setter for the recorder on `SessionManager`**

In `src/main/session/session-manager.ts`, near the other setters (around the existing `setStatusListener`), add the import:

```ts
import type { VerdictRecorder } from './verdict-recorder'
```

Inside the class, add a private field and setter:

```ts
  private verdictRecorder: VerdictRecorder | null = null
  setVerdictRecorder(recorder: VerdictRecorder): void { this.verdictRecorder = recorder }
```

Modify `createSession` so that after the existing `this.notifySessionsChanged(session.projectId)` line (around line 164), append:

```ts
    this.verdictRecorder?.onSessionCreated({
      sessionId: session.id,
      projectId: session.projectId,
      branch: session.branchName ?? '',
      runtime: session.runtimeId,
      taskPrompt: session.taskDescription ?? '',
      worktreePath: session.worktreePath ?? '',
      baseBranch: session.baseBranch ?? 'main',
    })
```

> If field names differ (`branchName`, `runtimeId`, `worktreePath`, `baseBranch`) in `AgentSession`, look them up in `src/shared/types.ts` and adjust accordingly — do not invent names.

Modify the existing `sendToRenderer` (around line 132) so it forwards `agent:status` to the recorder too:

```ts
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (channel === 'agent:status') {
      const payload = args[0] as { sessionId?: string; status?: string } | undefined
      if (payload?.sessionId && payload.status) {
        this.statusListener?.(payload.sessionId, payload.status)
        this.verdictRecorder?.onStatus(payload.sessionId, payload.status)
      }
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
  }
```

- [ ] **Step 2: Notify recorder on session termination**

In `src/main/session/session-killer.ts`, add to `SessionKillerDeps`:

```ts
  getVerdictRecorder?: () => VerdictRecorder | null
```

with `import type { VerdictRecorder } from './verdict-recorder'`.

In `killSession`, after the existing `this.cleanupSession(session)` line (around line 30) but before `notifySessionsChanged`, add:

```ts
    void this.deps.getVerdictRecorder?.()?.onSessionTerminated(sessionId)
```

In `killAllSessionsOnWorktree`, after the `for (const session of matching) {...}` loop body (where `this.cleanupSession(session)` is called), add inside the loop:

```ts
      void this.deps.getVerdictRecorder?.()?.onSessionTerminated(session.id)
```

> Note: `onSessionTerminated` is async; we deliberately do not `await` to keep killSession's existing latency profile. The recorder's writes are best-effort.

- [ ] **Step 3: Forward PR creation to the recorder**

Either (a) have callers notify the recorder after `PrCreator.createPR` resolves, or (b) inject the recorder into `PrCreator`. Pick (a) — it keeps `PrCreator` pure. Look at where `PrCreator.createPR` is called (likely `src/main/ipc/git-handlers.ts`). After the call resolves, invoke the recorder. Concretely:

In `src/main/ipc/git-handlers.ts`, find the handler that invokes `prCreator.createPR(...)`. If the handler has access to a session id, add a deps field `verdictRecorder` to `IpcDependencies` (Task 12 does this) and after the PR creation resolves, call:

```ts
deps.verdictRecorder?.onPrCreated(sessionId, prUrl)
```

If the current handler doesn't have a `sessionId`, locate it from the worktree path via `deps.sessionManager.listSessions().find((s) => s.worktreePath === worktreePath)?.id`. If no session matches, skip the notify (verdict tracking covers session-scoped work only).

- [ ] **Step 4: Forward file/commit signals from `FileWatcher`**

In `src/main/fs/file-watcher.ts`, the `poll` method already calls `this.sendToRenderer('files:changed', { sessionId, changes })`. We need two new derived signals:
- a file change while agent isn't running → `onFilesChanged`
- a new commit on the branch since last poll → `onAgentCommit`

Add a setter and a per-worktree `lastHeadSha` tracker:

```ts
  private verdictRecorder: import('../session/verdict-recorder').VerdictRecorder | null = null
  setVerdictRecorder(recorder: import('../session/verdict-recorder').VerdictRecorder): void {
    this.verdictRecorder = recorder
  }
```

Add a private `lastHeadSha` map keyed by worktreePath. After the existing `if (gitChanged) {...}` block inside `poll`, compute:

```ts
      try {
        const head = await this.headShaFn(worktreePath)
        const previous = this.lastHeadSha.get(worktreePath)
        if (previous && head && head !== previous) {
          this.verdictRecorder?.onAgentCommit(entry.sessionId)
        }
        if (head) this.lastHeadSha.set(worktreePath, head)
      } catch { /* worktree gone, ignore */ }

      this.verdictRecorder?.onFilesChanged(entry.sessionId)
```

Where `headShaFn` is a constructor-injected fn (mirroring `gitStatusFn`) defaulting to:

```ts
async function defaultHeadSha(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd })
  return stdout.trim()
}
```

> Important: the recorder's `onFilesChanged` already filters by status — fire it on every poll where `gitChanged` is true, not on every tick.

So the final placement is: inside `if (gitChanged) { ... }`, after `this.sendToRenderer(...)` calls, before the closing brace, run the head-sha check + `onFilesChanged` call.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run existing tests to catch regressions**

Run: `npm test`
Expected: PASS. If a session-manager or session-killer test breaks because it doesn't mock the new optional dep, update the test fixture to pass `getVerdictRecorder: () => null` or leave the optional dep undefined.

- [ ] **Step 7: Commit**

```bash
git add src/main/session/session-manager.ts src/main/session/session-killer.ts src/main/ipc/git-handlers.ts src/main/fs/file-watcher.ts
git commit -m "Wire VerdictRecorder into session lifecycle and file watcher"
```

---

## Task 11: Add IPC handlers for verdict reads

**Files:**
- Create: `src/main/ipc/verdict-handlers.ts`
- Create: `src/main/ipc/verdict-handlers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/ipc/verdict-handlers.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { registerVerdictHandlers } from './verdict-handlers'
import { VerdictStore } from '../store/verdict-store'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { IpcDependencies } from './types'

vi.mock('electron', () => ({
  ipcMain: {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      ;(this.handlers as Map<string, (...args: unknown[]) => unknown>).set(channel, handler)
    },
    removeAllListeners() { (this.handlers as Map<string, unknown>).clear() },
  },
}))

describe('verdict-handlers', () => {
  let tmp: string
  beforeEach(() => {
    ;(ipcMain as unknown as { removeAllListeners: () => void }).removeAllListeners()
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-ipc-'))
  })

  it('verdicts:list returns records for projectId', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert({
      sessionId: 's1', projectId: 'p1', branch: 'b', runtime: 'claude',
      taskPrompt: { kind: 'full', text: 't' }, outcome: 'merged',
      createdAt: '2026-05-16T00:00:00Z',
      metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 1, removed: 0 }, filesChanged: 1 },
    })
    registerVerdictHandlers({ verdictStore: store } as unknown as IpcDependencies)
    const handler = (ipcMain as unknown as { handlers: Map<string, (e: unknown, req: unknown) => unknown> })
      .handlers.get('verdicts:list')
    const list = handler!(null, { projectId: 'p1' }) as Array<{ sessionId: string }>
    expect(list[0].sessionId).toBe('s1')
  })

  it('verdicts:get returns null for missing sessionId', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    registerVerdictHandlers({ verdictStore: store } as unknown as IpcDependencies)
    const handler = (ipcMain as unknown as { handlers: Map<string, (e: unknown, sid: string) => unknown> })
      .handlers.get('verdicts:get')
    expect(handler!(null, 'nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/main/ipc/verdict-handlers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/ipc/verdict-handlers.ts`**

```ts
import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type { VerdictRecord, VerdictListRequest } from '../../shared/verdict-types'

export function registerVerdictHandlers(deps: IpcDependencies): void {
  ipcMain.handle('verdicts:list', (_event, request: VerdictListRequest): VerdictRecord[] => {
    return deps.verdictStore.listByProject(request.projectId, request.limit)
  })
  ipcMain.handle('verdicts:get', (_event, sessionId: string): VerdictRecord | null => {
    return deps.verdictStore.getBySessionId(sessionId)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/ipc/verdict-handlers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/verdict-handlers.ts src/main/ipc/verdict-handlers.test.ts
git commit -m "Add verdict IPC handlers (verdicts:list, verdicts:get)"
```

---

## Task 12: Wire everything together in app/index.ts

**Files:**
- Modify: `src/main/ipc/types.ts`
- Modify: `src/main/app/index.ts`
- Modify: `src/main/app/ipc-handlers.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Extend `IpcDependencies`**

In `src/main/ipc/types.ts`, add the import and field:

```ts
import { VerdictStore } from '../store/verdict-store'
```

Add to the interface (after `watchRunStore`):

```ts
  verdictStore: VerdictStore
```

- [ ] **Step 2: Wire the store + recorder in `src/main/app/index.ts`**

Add imports near the other store imports (~line 24):

```ts
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder } from '../session/verdict-recorder'
import { summarizeMiddle } from '../store/prompt-summarizer'
```

Instantiate next to other stores (~line 113):

```ts
const verdictStore = new VerdictStore()
const verdictRecorder = new VerdictRecorder({
  store: verdictStore,
  getAiSettings: () => settingsStore.getSettings().transcription ?? { provider: 'none' },
  getAheadBehind: (wt, base) => gitOps.getAheadBehind(wt, base),
  getDiffStats: (wt, base) => diffProvider.getDiffStats(wt, base),
  isBranchMerged: (wt, base, branch) => gitOps.isBranchMerged(wt, base, branch),
  summarize: (middle, settings) => summarizeMiddle(middle, settings),
})
sessionManager.setVerdictRecorder(verdictRecorder)
fileWatcher.setVerdictRecorder(verdictRecorder)
```

> If `SessionKiller` is constructed inside `SessionManager` (it is), add a `getVerdictRecorder` accessor on the killer deps. Easiest path: pass it through `SessionManager.setVerdictRecorder` — let `SessionManager` forward to the killer via a new setter. To keep the diff small here, also add a public setter on `SessionKiller` and have `SessionManager.setVerdictRecorder` call it.

In `SessionManager`, extend `setVerdictRecorder`:

```ts
  setVerdictRecorder(recorder: VerdictRecorder): void {
    this.verdictRecorder = recorder
    this.killer.setVerdictRecorder(recorder)
  }
```

In `SessionKiller`, add:

```ts
  private verdictRecorder: VerdictRecorder | null = null
  setVerdictRecorder(recorder: VerdictRecorder): void { this.verdictRecorder = recorder }
```

And update the two terminate points to call `this.verdictRecorder?.onSessionTerminated(...)` rather than going through `deps.getVerdictRecorder`. (You can either keep both wiring styles or replace the `getVerdictRecorder` dep with this setter; the setter version is cleaner — pick it and delete the optional dep field added in Task 10.)

Add `verdictStore` to the `ipcDeps` object (~line 165):

```ts
const ipcDeps = {
  ...
  verdictStore,
  ...
}
```

- [ ] **Step 3: Register the new handlers**

In `src/main/app/ipc-handlers.ts`, add the import:

```ts
import { registerVerdictHandlers } from '../ipc/verdict-handlers'
```

Add to `registerIpcHandlers`:

```ts
  registerVerdictHandlers(deps)
```

- [ ] **Step 4: Whitelist the new IPC channels**

In `src/preload/index.ts`, find `ALLOWED_INVOKE_CHANNELS` (line 3) and add:

```ts
  'verdicts:list',
  'verdicts:get',
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/types.ts src/main/app/index.ts src/main/app/ipc-handlers.ts src/main/session/session-manager.ts src/main/session/session-killer.ts src/preload/index.ts
git commit -m "Wire VerdictStore + VerdictRecorder into app bootstrap and IPC"
```

---

## Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — no regressions in existing tests, all new tests green.

- [ ] **Step 3: Smoke test the app**

Run: `npm run dev`
Expected: app boots without errors. Create a session, kill it, then `cat ~/.manifold/verdicts.json` — confirm a record was written. Open Settings → Transcription and verify the new "Chat model" / "Chat deployment" inputs render.

- [ ] **Step 4: Final commit (if any cleanup)**

If anything needed tweaking, commit it:

```bash
git add -A
git commit -m "Verdict capture: cleanup and final verification"
```

---

## Self-Review Checklist Results

**Spec coverage:**
- ✅ Outcomes (`merged` / `pr_created` / `committed_only` / `discarded` / `unknown`) — Task 6, 7, 10
- ✅ `VerdictRecord` fields — Task 3, 4
- ✅ `TaskPrompt` head/tail/summary — Task 3, 6
- ✅ `VerdictStore` JSON at `~/.manifold/verdicts.json` with 1000-record FIFO cap — Task 4
- ✅ `PromptSummarizer` with OpenAI/Azure providers and silent fallback — Task 5
- ✅ `VerdictRecorder` subscribed to lifecycle hooks — Tasks 6, 7, 10
- ✅ Settings rename + new `chatModel` / `azureChatDeployment` fields — Task 1
- ✅ Settings dialog UI — Task 2
- ✅ IPC `verdicts:list` / `verdicts:get` (read-only) — Task 11
- ✅ `isBranchMerged` for terminal outcome detection — Task 8
- ✅ Diff stats snapshot — Task 9
- ✅ Preload whitelist — Task 12
- ✅ Wired in app bootstrap — Task 12

**Placeholders / vague steps:** none.

**Type consistency:** `VerdictRecord` / `TaskPrompt` / `AiServiceSettings` field names are identical across tasks 3, 4, 5, 6, 7, 11, 12.
