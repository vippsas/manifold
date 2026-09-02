import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createViolaVerdictStore } from './verdict-store'

const dirs: string[] = []

function worktree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'viola-verdict-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('createViolaVerdictStore', () => {
  it('reads the verdict a reviewer wrote to the advertised path', async () => {
    const store = createViolaVerdictStore()
    const wt = worktree()
    const file = store.path(wt, 'api')

    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '{"passed":true,"blocking":[],"nonBlocking":[]}')

    expect(await store.read(wt, 'api')).toContain('"passed":true')
  })

  it('reports no verdict rather than throwing when the reviewer wrote nothing', async () => {
    expect(await createViolaVerdictStore().read(worktree(), 'api')).toBeNull()
  })

  it('clears a previous verdict so a re-review can never read the stale one', async () => {
    const store = createViolaVerdictStore()
    const wt = worktree()
    const file = store.path(wt, 'api')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '{"passed":false,"blocking":["old finding"],"nonBlocking":[]}')

    await store.clear(wt, 'api')

    expect(existsSync(file)).toBe(false)
    expect(await store.read(wt, 'api')).toBeNull()
  })

  it('clearing an absent verdict is a no-op', async () => {
    await expect(createViolaVerdictStore().clear(worktree(), 'api')).resolves.toBeUndefined()
  })

  it('keeps each task\'s verdict in its own file', () => {
    const store = createViolaVerdictStore()
    expect(store.path('/wt/x', 'api')).not.toBe(store.path('/wt/x', 'ui'))
    expect(store.path('/wt/x', 'api').startsWith('/wt/x')).toBe(true)
  })
})
