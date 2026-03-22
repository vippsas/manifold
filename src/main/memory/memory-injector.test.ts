import { afterEach, describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { MemoryInjector } from './memory-injector'
import type { MemoryStore } from './memory-store'
import type { SettingsStore } from '../store/settings-store'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import type { MemoryObservation, SessionSummary } from '../../shared/memory-types'
import type { InternalSession } from '../session/session-types'

function createInjector(
  memoryStore: Partial<MemoryStore> = {},
  settingsStore: Partial<SettingsStore> = {},
): MemoryInjector {
  return new MemoryInjector(
    memoryStore as MemoryStore,
    settingsStore as SettingsStore,
  )
}

const NOW = Date.now()
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'sum-1',
    projectId: 'proj-1',
    sessionId: 'sess-1',
    runtimeId: 'claude',
    branchName: 'manifold/test',
    taskDescription: 'Implement memory system',
    whatWasDone: 'Created SQLite store with FTS5',
    whatWasLearned: 'FTS5 porter tokenizer handles stemming',
    decisionsMade: ['Use WAL mode'],
    filesChanged: ['memory-store.ts'],
    createdAt: NOW,
    ...overrides,
  }
}

function makeObservation(overrides: Partial<MemoryObservation> = {}): MemoryObservation {
  return {
    id: 'obs-1',
    projectId: 'proj-1',
    sessionId: 'sess-1',
    type: 'decision',
    title: 'Chose SQLite over JSON',
    summary: 'SQLite provides FTS5 and better concurrency',
    narrative: 'We evaluated JSON files vs SQLite and chose SQLite for its built-in search.',
    facts: ['SQLite supports FTS5'],
    concepts: ['trade-off', 'why-it-exists'],
    filesTouched: ['src/main/memory/memory-store.ts'],
    createdAt: NOW,
    ...overrides,
  }
}

describe('MemoryInjector', () => {
  describe('injectContext', () => {
    it('writes injected context to MANIFOLD.md instead of runtime-specific context files', async () => {
      const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-injector-test-'))
      tempDirs.push(worktreePath)

      const injector = createInjector(
        {
          getRecentSummaries: () => [makeSummary()],
          getRecentObservations: () => [],
        },
        {
          getSettings: () => ({
            ...DEFAULT_SETTINGS,
            memory: {
              ...DEFAULT_SETTINGS.memory,
              injectionEnabled: true,
              injectionTokenBudget: 2000,
            },
          }),
        },
      )

      const session = {
        id: 'sess-1',
        projectId: 'proj-1',
        runtimeId: 'codex',
        branchName: 'manifold/test',
        worktreePath,
        status: 'running',
        pid: null,
        additionalDirs: [],
      } as InternalSession

      await injector.injectContext(session)

      expect(fs.existsSync(path.join(worktreePath, 'MANIFOLD.md'))).toBe(true)
      expect(fs.existsSync(path.join(worktreePath, 'AGENTS.md'))).toBe(false)
      expect(fs.existsSync(path.join(worktreePath, 'CLAUDE.md'))).toBe(false)
      expect(fs.existsSync(path.join(worktreePath, 'GEMINI.md'))).toBe(false)
    })
  })

  describe('buildContextMarkdown', () => {
    it('includes summary section with all fields', () => {
      const injector = createInjector()
      const md = injector.buildContextMarkdown([makeSummary()], [], 2000)

      expect(md).toContain('## Manifold Memory Context')
      expect(md).toContain('### Recent Sessions')
      expect(md).toContain('Implement memory system')
      expect(md).toContain('**Done:** Created SQLite store with FTS5')
      expect(md).toContain('**Learned:** FTS5 porter tokenizer handles stemming')
      expect(md).toContain('**Decisions:** Use WAL mode')
      expect(md).toContain('**Files:** memory-store.ts')
    })

    it('includes observation section with narrative and concepts', () => {
      const injector = createInjector()
      const md = injector.buildContextMarkdown([], [makeObservation()], 2000)

      expect(md).toContain('### Key Observations')
      expect(md).toContain('Chose SQLite over JSON')
      expect(md).toContain('SQLite provides FTS5 and better concurrency')
      expect(md).toContain('We evaluated JSON files vs SQLite')
      expect(md).toContain('**Concepts:** trade-off, why-it-exists')
      expect(md).toContain('**Files:** src/main/memory/memory-store.ts')
    })

    it('includes key learnings section', () => {
      const injector = createInjector()
      const md = injector.buildContextMarkdown(
        [makeSummary(), makeSummary({ id: 'sum-2', whatWasLearned: 'WAL mode prevents locking' })],
        [],
        2000,
      )

      expect(md).toContain('### Key Learnings')
      expect(md).toContain('FTS5 porter tokenizer handles stemming')
      expect(md).toContain('WAL mode prevents locking')
    })

    it('deduplicates learnings', () => {
      const injector = createInjector()
      const md = injector.buildContextMarkdown(
        [makeSummary(), makeSummary({ id: 'sum-2' })], // same whatWasLearned
        [],
        2000,
      )

      const matches = md.match(/FTS5 porter tokenizer handles stemming/g)
      // Should appear once in the summary section and once in learnings section (at most 2)
      expect(matches!.length).toBeLessThanOrEqual(3)
    })

    it('returns empty string when no content is available', () => {
      const injector = createInjector()
      expect(injector.buildContextMarkdown([], [], 2000)).toBe('')
    })

    it('respects token budget', () => {
      const injector = createInjector()
      // Very small budget — should truncate early
      const md = injector.buildContextMarkdown(
        [makeSummary(), makeSummary({ id: 'sum-2', taskDescription: 'Second task with long description' })],
        [makeObservation()],
        50, // very small budget = 200 chars
      )

      // Should produce something but be limited
      expect(md.length).toBeLessThan(1000)
    })

    it('wraps content in marker tags', () => {
      const injector = createInjector()
      const md = injector.buildContextMarkdown([makeSummary()], [], 2000)

      expect(md).toContain('<!-- manifold:memory-context:start -->')
      expect(md).toContain('<!-- manifold:memory-context:end -->')
    })

    it('handles summaries with empty fields gracefully', () => {
      const injector = createInjector()
      const md = injector.buildContextMarkdown(
        [makeSummary({
          whatWasLearned: '',
          decisionsMade: [],
          filesChanged: [],
        })],
        [],
        2000,
      )

      expect(md).toContain('Implement memory system')
      expect(md).not.toContain('**Learned:**')
      expect(md).not.toContain('**Decisions:**')
    })

    it('handles observations without narrative or concepts', () => {
      const injector = createInjector()
      const md = injector.buildContextMarkdown(
        [],
        [makeObservation({ narrative: '', concepts: [] })],
        2000,
      )

      expect(md).toContain('Chose SQLite over JSON')
      expect(md).not.toContain('**Concepts:**')
    })
  })
})
