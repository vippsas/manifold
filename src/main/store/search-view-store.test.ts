import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

import * as fs from 'node:fs'
import { SearchViewStore } from './search-view-store'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)

describe('SearchViewStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an empty state when no persisted file exists', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new SearchViewStore()

    expect(store.get('project-1')).toEqual({ recent: [], saved: [] })
  })

  it('loads existing saved and recent searches from disk', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      'project-1': {
        recent: [{
          id: 'recent-1',
          label: 'auth flow',
          usedAt: 10,
          snapshot: {
            mode: 'everything',
            query: 'auth flow',
            scopeKind: 'all-project-sessions',
            matchMode: 'literal',
            caseSensitive: false,
            wholeWord: false,
            memoryTypeFilter: null,
            memoryConceptFilter: null,
          },
        }],
        saved: [],
      },
    }))

    const store = new SearchViewStore()
    expect(store.get('project-1').recent[0]?.label).toBe('auth flow')
  })

  it('persists cloned state instead of retaining mutable references', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new SearchViewStore()
    const state = {
      recent: [{
        id: 'recent-1',
        label: 'auth flow',
        usedAt: 10,
        snapshot: {
          mode: 'everything' as const,
          query: 'auth flow',
          scopeKind: 'all-project-sessions' as const,
          matchMode: 'literal' as const,
          caseSensitive: false,
          wholeWord: false,
          memoryTypeFilter: null,
          memoryConceptFilter: null,
        },
      }],
      saved: [],
    }

    store.set('project-1', state)
    state.recent[0].snapshot.query = 'mutated'

    expect(store.get('project-1').recent[0]?.snapshot.query).toBe('auth flow')
    expect(mockWriteFileSync).toHaveBeenCalledOnce()
  })
})
