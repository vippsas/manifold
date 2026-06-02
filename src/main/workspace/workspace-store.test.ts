import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { WorkspaceStore } from './workspace-store'
import type { Workspace } from '../../shared/workspace-types'

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return { id: 'w1', name: 'test', projectIds: ['p1'], createdAt: '2026-06-02T00:00:00.000Z', ...overrides }
}

describe('WorkspaceStore', () => {
  let tmpDir: string
  let storePath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-store-'))
    storePath = path.join(tmpDir, 'workspaces.json')
  })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('returns empty list when no file exists', () => {
    expect(new WorkspaceStore(storePath).list()).toEqual([])
  })
  it('persists and reloads workspaces', () => {
    const store = new WorkspaceStore(storePath)
    store.add(makeWorkspace({ id: 'w1' }))
    store.add(makeWorkspace({ id: 'w2', name: 'other' }))
    expect(new WorkspaceStore(storePath).list().map((w) => w.id).sort()).toEqual(['w1', 'w2'])
  })
  it('updates a workspace by id', () => {
    const store = new WorkspaceStore(storePath)
    store.add(makeWorkspace({ id: 'w1', name: 'a' }))
    expect(store.update('w1', { name: 'b' })?.name).toBe('b')
    expect(store.get('w1')?.name).toBe('b')
  })
  it('removes a workspace by id', () => {
    const store = new WorkspaceStore(storePath)
    store.add(makeWorkspace({ id: 'w1' }))
    expect(store.remove('w1')).toBe(true)
    expect(store.list()).toEqual([])
  })
  it('adds and removes a project id', () => {
    const store = new WorkspaceStore(storePath)
    store.add(makeWorkspace({ id: 'w1', projectIds: ['p1'] }))
    store.addProject('w1', 'p2')
    expect(store.get('w1')?.projectIds).toEqual(['p1', 'p2'])
    store.removeProject('w1', 'p1')
    expect(store.get('w1')?.projectIds).toEqual(['p2'])
  })
  it('tolerates a malformed file by starting empty', () => {
    fs.writeFileSync(storePath, 'not json')
    expect(new WorkspaceStore(storePath).list()).toEqual([])
  })
})
