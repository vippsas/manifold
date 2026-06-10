import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Capture the channel handlers registered on ipcMain so we can invoke them directly.
const handlers = new Map<string, (event: unknown, request: unknown) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, request: unknown) => unknown) => {
      handlers.set(channel, handler)
    },
  },
}))

import { registerMemoryHandlers } from './memory-handlers'
import { MemoryStore } from '../memory/memory-store'
import type { MemoryTimelineResponse } from '../../shared/memory-types'

const PROJECT = 'timeline-project'

function invokeTimeline(request: Record<string, unknown>): MemoryTimelineResponse {
  const handler = handlers.get('memory:timeline')
  if (!handler) throw new Error('memory:timeline handler not registered')
  return handler({}, { projectId: PROJECT, ...request }) as MemoryTimelineResponse
}

describe('memory:timeline cursor pagination', () => {
  let tmpDir: string
  let store: MemoryStore

  beforeEach(() => {
    handlers.clear()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-timeline-test-'))
    store = new MemoryStore(tmpDir)
    const deps = { memoryStore: store } as unknown as Parameters<typeof registerMemoryHandlers>[0]
    registerMemoryHandlers(deps)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('does not skip observations sharing a createdAt across a page boundary', () => {
    // Six observations all share the same createdAt, spanning two pages of three.
    const sharedTime = 1_000_000
    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      const id = `obs-${String(i).padStart(2, '0')}`
      ids.push(id)
      store.insertObservation({
        id,
        projectId: PROJECT,
        sessionId: 's1',
        type: 'decision',
        title: `decision ${i}`,
        summary: `summary ${i}`,
        facts: [],
        filesTouched: [],
        createdAt: sharedTime,
      })
    }

    const first = invokeTimeline({ limit: 3 })
    expect(first.items).toHaveLength(3)
    expect(first.nextCursor).not.toBeNull()

    const second = invokeTimeline({ limit: 3, cursor: first.nextCursor })

    const seen = [...first.items, ...second.items].map((item) => item.id).sort()
    // All six rows must appear exactly once — none stranded at the boundary.
    expect(seen).toEqual([...ids].sort())
    expect(new Set(seen).size).toBe(6)
  })
})
