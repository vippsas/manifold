import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
}))

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

import * as fs from 'node:fs'
import { DismissedAgentsStore } from './dismissed-agents-store'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)

describe('DismissedAgentsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has() returns false for unknown entries', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DismissedAgentsStore()
    expect(store.has('proj-1', 'feature-x')).toBe(false)
  })

  it('add() records a dismissal and persists it', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DismissedAgentsStore()

    store.add('proj-1', 'feature-x')

    expect(store.has('proj-1', 'feature-x')).toBe(true)
    expect(mockWriteFileSync).toHaveBeenCalled()
    const written = JSON.parse(mockWriteFileSync.mock.calls.at(-1)![1] as string)
    expect(written).toEqual({ 'proj-1': ['feature-x'] })
  })

  it('add() ignores empty branch names', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DismissedAgentsStore()

    store.add('proj-1', '')

    expect(store.has('proj-1', '')).toBe(false)
    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('loads dismissals from disk', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ 'proj-1': ['feature-x'] }))

    const store = new DismissedAgentsStore()

    expect(store.has('proj-1', 'feature-x')).toBe(true)
    expect(store.has('proj-1', 'other')).toBe(false)
    expect(store.has('proj-2', 'feature-x')).toBe(false)
  })

  it('delete() removes a single dismissal and persists', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ 'proj-1': ['feature-x', 'feature-y'] }))
    const store = new DismissedAgentsStore()

    store.delete('proj-1', 'feature-x')

    expect(store.has('proj-1', 'feature-x')).toBe(false)
    expect(store.has('proj-1', 'feature-y')).toBe(true)
    const written = JSON.parse(mockWriteFileSync.mock.calls.at(-1)![1] as string)
    expect(written).toEqual({ 'proj-1': ['feature-y'] })
  })

  it('delete() for an unknown entry does not write', () => {
    mockExistsSync.mockReturnValue(false)
    const store = new DismissedAgentsStore()

    store.delete('proj-1', 'feature-x')

    expect(mockWriteFileSync).not.toHaveBeenCalled()
  })

  it('deleteProject() removes all dismissals for a project', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ 'proj-1': ['feature-x', 'feature-y'], 'proj-2': ['feature-z'] }),
    )
    const store = new DismissedAgentsStore()

    store.deleteProject('proj-1')

    expect(store.has('proj-1', 'feature-x')).toBe(false)
    expect(store.has('proj-2', 'feature-z')).toBe(true)
    const written = JSON.parse(mockWriteFileSync.mock.calls.at(-1)![1] as string)
    expect(written).toEqual({ 'proj-2': ['feature-z'] })
  })

  it('returns empty state when the file contains invalid JSON', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('not json!')

    const store = new DismissedAgentsStore()
    expect(store.has('proj-1', 'feature-x')).toBe(false)
  })

  it('drops malformed entries on load and keeps good ones', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ 'proj-1': 'not-an-array', 'proj-2': ['ok'], 'proj-3': [42] }),
    )

    const store = new DismissedAgentsStore()

    expect(store.has('proj-1', 'not-an-array')).toBe(false)
    expect(store.has('proj-2', 'ok')).toBe(true)
    expect(store.has('proj-3', '42')).toBe(false)
  })
})
