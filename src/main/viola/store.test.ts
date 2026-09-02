import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileViolaStore } from './store'
import type { ViolaRun } from './types'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('FileViolaStore', () => {
  it('reads temporary Conductor data and writes the next snapshot under Viola', async () => {
    const root = mkdtempSync(join(tmpdir(), 'viola-store-'))
    roots.push(root)
    const run: ViolaRun = {
      id: 'viola-1',
      baseSessionId: 'session-1',
      goal: 'Ship it',
      summary: 'One task',
      state: 'planned',
      availableRuntimes: ['claude', 'codex'],
      tasks: [],
      createdAt: 1,
    }
    writeFileSync(join(root, 'conductor-runs.json'), JSON.stringify({ 'session-1': run }))

    const store = new FileViolaStore(root)
    expect(await store.get('session-1')).toEqual(run)

    await store.set({ ...run, state: 'complete' })
    const written = JSON.parse(readFileSync(join(root, 'viola-runs.json'), 'utf8'))
    expect(written['session-1'].state).toBe('complete')
  })
})
