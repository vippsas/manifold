import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs', () => ({
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  relative: (from: string, to: string) => to.replace(from + '/', ''),
  basename: (p: string) => p.split('/').pop() ?? p,
}))

import { FileWatcher } from './file-watcher'
import type { BrowserWindow } from 'electron'

function createMockWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}

describe('FileWatcher — conflict detection', () => {
  let watcher: FileWatcher
  let mockGitStatus: ReturnType<typeof vi.fn<(cwd: string) => Promise<string>>>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockGitStatus = vi.fn<(cwd: string) => Promise<string>>().mockResolvedValue('')
    watcher = new FileWatcher(mockGitStatus)
  })

  afterEach(async () => {
    await watcher.unwatchAll()
    vi.useRealTimers()
  })

  it('detects UU lines as conflicts', async () => {
    const mockWindow = createMockWindow()
    watcher.setMainWindow(mockWindow)

    mockGitStatus.mockResolvedValue('UU src/conflict.ts\n')
    watcher.watch('/repo/worktree', 'session-1')
    await vi.advanceTimersByTimeAsync(10)

    const conflictCall = vi.mocked(mockWindow.webContents.send).mock.calls.find(
      (call: unknown[]) => call[0] === 'agent:conflicts',
    )
    expect(conflictCall).toBeDefined()
    expect(conflictCall![1]).toEqual({
      sessionId: 'session-1',
      conflicts: ['src/conflict.ts'],
    })
  })

  it('detects AA and DD lines as conflicts', async () => {
    const mockWindow = createMockWindow()
    watcher.setMainWindow(mockWindow)

    mockGitStatus.mockResolvedValue('AA src/both-added.ts\nDD src/both-deleted.ts\n')
    watcher.watch('/repo/worktree', 'session-1')
    await vi.advanceTimersByTimeAsync(10)

    const conflictCall = vi.mocked(mockWindow.webContents.send).mock.calls.find(
      (call: unknown[]) => call[0] === 'agent:conflicts',
    )
    expect(conflictCall).toBeDefined()
    expect(conflictCall![1]).toEqual({
      sessionId: 'session-1',
      conflicts: ['src/both-added.ts', 'src/both-deleted.ts'],
    })
  })

  it('does not produce conflicts for normal M/A/? lines', async () => {
    const mockWindow = createMockWindow()
    watcher.setMainWindow(mockWindow)

    mockGitStatus.mockResolvedValue(' M src/modified.ts\nA  src/added.ts\n?? src/untracked.ts\n')
    watcher.watch('/repo/worktree', 'session-1')
    await vi.advanceTimersByTimeAsync(10)

    const conflictCall = vi.mocked(mockWindow.webContents.send).mock.calls.find(
      (call: unknown[]) => call[0] === 'agent:conflicts',
    )
    expect(conflictCall).toBeDefined()
    expect(conflictCall![1]).toEqual({
      sessionId: 'session-1',
      conflicts: [],
    })
  })

  it('sends agent:conflicts event alongside files:changed on poll', async () => {
    const mockWindow = createMockWindow()
    watcher.setMainWindow(mockWindow)

    mockGitStatus.mockResolvedValue('UU src/conflict.ts\n M src/clean.ts\n')
    watcher.watch('/repo/worktree', 'session-1')
    await vi.advanceTimersByTimeAsync(10)

    const channels = vi.mocked(mockWindow.webContents.send).mock.calls.map((call: unknown[]) => call[0])
    expect(channels).toContain('files:changed')
    expect(channels).toContain('agent:conflicts')
  })

  it('sends both changes and conflicts with correct data', async () => {
    const mockWindow = createMockWindow()
    watcher.setMainWindow(mockWindow)

    mockGitStatus.mockResolvedValue('UU src/conflict.ts\n M src/modified.ts\n')
    watcher.watch('/repo/worktree', 'session-1')
    await vi.advanceTimersByTimeAsync(10)

    const changesCall = vi.mocked(mockWindow.webContents.send).mock.calls.find(
      (call: unknown[]) => call[0] === 'files:changed',
    )
    expect(changesCall![1].changes).toContainEqual({
      path: 'src/conflict.ts',
      type: 'modified',
    })
    expect(changesCall![1].changes).toContainEqual({
      path: 'src/modified.ts',
      type: 'modified',
    })

    const conflictCall = vi.mocked(mockWindow.webContents.send).mock.calls.find(
      (call: unknown[]) => call[0] === 'agent:conflicts',
    )
    expect(conflictCall![1].conflicts).toEqual(['src/conflict.ts'])
  })

  it('sends empty conflicts when no conflict markers present', async () => {
    const mockWindow = createMockWindow()
    watcher.setMainWindow(mockWindow)

    // Initial empty poll
    watcher.watch('/repo/worktree', 'session-1')
    await vi.advanceTimersByTimeAsync(10)

    // Next poll with clean changes only
    mockGitStatus.mockResolvedValue(' M src/file.ts\n')
    await vi.advanceTimersByTimeAsync(2000)

    const conflictCalls = vi.mocked(mockWindow.webContents.send).mock.calls.filter(
      (call: unknown[]) => call[0] === 'agent:conflicts',
    )
    // The second call should have empty conflicts
    const lastConflictCall = conflictCalls[conflictCalls.length - 1]
    expect(lastConflictCall[1].conflicts).toEqual([])
  })

  it('detects mixed conflict types in single status output', async () => {
    const mockWindow = createMockWindow()
    watcher.setMainWindow(mockWindow)

    const status = [
      'UU src/uu-file.ts',
      'AA src/aa-file.ts',
      'DD src/dd-file.ts',
      ' M src/clean.ts',
    ].join('\n')

    mockGitStatus.mockResolvedValue(status)
    watcher.watch('/repo/worktree', 'session-1')
    await vi.advanceTimersByTimeAsync(10)

    const conflictCall = vi.mocked(mockWindow.webContents.send).mock.calls.find(
      (call: unknown[]) => call[0] === 'agent:conflicts',
    )
    expect(conflictCall![1].conflicts).toEqual([
      'src/uu-file.ts',
      'src/aa-file.ts',
      'src/dd-file.ts',
    ])
  })
})
