import { afterEach, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { MemoryObservation, SessionSummary } from '../../shared/memory-types'
import { MemoryStore } from './memory-store'

export const PROJECT = 'test-project'
export const SESSION = 'sess-1'
export const WORKTREE_PATH = '/repo/.manifold/worktrees/test'

export interface MemoryStoreTestContext {
  readonly store: MemoryStore
  readonly tmpDir: string
}

export function useMemoryStoreTestContext(): MemoryStoreTestContext {
  let store: MemoryStore
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-store-test-'))
    store = new MemoryStore(tmpDir)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  return {
    get store() {
      return store
    },
    get tmpDir() {
      return tmpDir
    },
  }
}

export function createObservation(overrides: Partial<MemoryObservation> = {}): MemoryObservation {
  return {
    id: 'obs-1',
    projectId: PROJECT,
    sessionId: SESSION,
    type: 'decision',
    title: 'Chose SQLite over JSON',
    summary: 'We chose SQLite for persistence due to FTS5 support',
    facts: ['SQLite supports FTS5', 'JSON files do not scale'],
    filesTouched: ['src/main/memory/memory-store.ts'],
    createdAt: Date.now(),
    ...overrides,
  }
}

export function createSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'sum-1',
    projectId: PROJECT,
    sessionId: SESSION,
    runtimeId: 'claude',
    branchName: 'manifold/test',
    taskDescription: 'Implement memory persistence layer',
    whatWasDone: 'Created SQLite store with FTS5 search',
    whatWasLearned: 'FTS5 porter tokenizer handles stemming well',
    decisionsMade: ['Use WAL mode', 'Use porter tokenizer'],
    filesChanged: ['memory-store.ts'],
    createdAt: Date.now(),
    ...overrides,
  }
}
