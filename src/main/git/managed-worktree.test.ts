import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

const {
  mockExecFileAsync,
  readFileMock,
  writeFileMock,
  renameMock,
} = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
  renameMock: vi.fn(),
}))

vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
  default: { promisify: () => mockExecFileAsync },
}))

vi.mock('node:child_process', () => ({
  default: { execFile: vi.fn(), spawn: spawnMock },
  execFile: vi.fn(),
  spawn: spawnMock,
}))

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
  rename: renameMock,
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
    rename: renameMock,
  },
}))

import {
  commitManagedWorktree,
  ensureManagedWorktreeGuards,
  getManagedWorktreeStatus,
  prepareManagedWorktree,
} from './managed-worktree'

function fakeSpawnResult(stdout: string, exitCode = 0, stderr = ''): ChildProcess {
  const emitter = new EventEmitter()
  const stdoutEmitter = new EventEmitter()
  const stderrEmitter = new EventEmitter()
  Object.assign(emitter, { stdout: stdoutEmitter, stderr: stderrEmitter })

  process.nextTick(() => {
    if (stdout) stdoutEmitter.emit('data', Buffer.from(stdout))
    if (stderr) stderrEmitter.emit('data', Buffer.from(stderr))
    emitter.emit('close', exitCode)
  })

  return emitter as unknown as ChildProcess
}

function mockSpawnSequence(
  calls: Array<{ stdout: string; exitCode?: number; stderr?: string }>
): void {
  const queue = [...calls]
  spawnMock.mockImplementation(() => {
    const next = queue.shift()
    if (!next) {
      return fakeSpawnResult('', 1, 'unexpected spawn call')
    }
    return fakeSpawnResult(next.stdout, next.exitCode ?? 0, next.stderr ?? '')
  })
}

describe('managed-worktree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecFileAsync.mockReset()
    readFileMock.mockResolvedValue('')
    writeFileMock.mockResolvedValue(undefined)
    renameMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('installs the managed exclude block into info/exclude', async () => {
    mockSpawnSequence([
      { stdout: '/repo/.git/info/exclude\n' },
    ])

    await ensureManagedWorktreeGuards('/worktree')

    expect(writeFileMock).toHaveBeenCalledWith(
      '/repo/.git/info/exclude',
      expect.stringContaining('# manifold: managed-worktree excludes start'),
      'utf-8',
    )
    expect(writeFileMock).toHaveBeenCalledWith(
      '/repo/.git/info/exclude',
      expect.stringContaining('/.claude-plugin/'),
      'utf-8',
    )
  })

  it('does not duplicate the managed exclude block', async () => {
    readFileMock.mockResolvedValue('# manifold: managed-worktree excludes start\n')
    mockSpawnSequence([
      { stdout: '/repo/.git/info/exclude\n' },
    ])

    await ensureManagedWorktreeGuards('/worktree')

    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('disables all enabled Claude plugins in local scope when preparing a worktree', async () => {
    readFileMock.mockResolvedValue('# manifold: managed-worktree excludes start\n')
    mockSpawnSequence([
      { stdout: '/repo/.git/info/exclude\n' },
    ])
    mockExecFileAsync
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          { id: 'superpowers@claude-plugins-official', enabled: true },
          { id: 'feature-dev@claude-plugins-official', enabled: true },
          { id: 'already-disabled@claude-plugins-official', enabled: false },
        ]),
        stderr: '',
      })
      .mockResolvedValue({ stdout: '', stderr: '' })

    await prepareManagedWorktree('/worktree')

    expect(mockExecFileAsync).toHaveBeenNthCalledWith(
      1,
      'claude',
      ['plugins', 'list', '--json'],
      { cwd: '/worktree' },
    )
    expect(mockExecFileAsync).toHaveBeenNthCalledWith(
      2,
      'claude',
      ['plugins', 'disable', '--scope', 'local', 'superpowers@claude-plugins-official'],
      { cwd: '/worktree' },
    )
    expect(mockExecFileAsync).toHaveBeenNthCalledWith(
      3,
      'claude',
      ['plugins', 'disable', '--scope', 'local', 'feature-dev@claude-plugins-official'],
      { cwd: '/worktree' },
    )
  })

  it('stages all changes with git add -A before committing', async () => {
    readFileMock.mockResolvedValue('# manifold: managed-worktree excludes start\n')
    mockSpawnSequence([
      { stdout: '/repo/.git/info/exclude\n' },
      { stdout: '' },
      { stdout: '' },
    ])

    await commitManagedWorktree('/worktree', 'fix: keep worktrees clean')

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['add', '-A'],
      expect.objectContaining({ cwd: '/worktree' })
    )
    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'fix: keep worktrees clean'],
      expect.objectContaining({ cwd: '/worktree' })
    )
  })

  it('uses git commit --no-edit when no message is provided', async () => {
    readFileMock.mockResolvedValue('# manifold: managed-worktree excludes start\n')
    mockSpawnSequence([
      { stdout: '/repo/.git/info/exclude\n' },
      { stdout: '' },
      { stdout: '' },
    ])

    await commitManagedWorktree('/worktree', '   ')

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['commit', '--no-edit'],
      expect.objectContaining({ cwd: '/worktree' })
    )
  })

  it('repairs a poisoned index once and retries the commit', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    readFileMock.mockResolvedValue('# manifold: managed-worktree excludes start\n')
    mockSpawnSequence([
      { stdout: '/repo/.git/info/exclude\n' },
      { stdout: '' },
      {
        stdout: '',
        exitCode: 1,
        stderr: [
          "error: invalid object 100644 deadbeefdeadbeefdeadbeefdeadbeefdeadbeef for '.claude-plugin/marketplace.json'",
          'error: Error building trees',
        ].join('\n'),
      },
      { stdout: '/repo/.git/index\n' },
      { stdout: '' },
      { stdout: '/repo/.git/info/exclude\n' },
      { stdout: '' },
      { stdout: '' },
    ])

    await commitManagedWorktree('/worktree', 'fix: retry after repair')

    expect(renameMock).toHaveBeenCalledWith(
      '/repo/.git/index',
      '/repo/.git/index.manifold-bad-1234'
    )
    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['reset', '--mixed', 'HEAD'],
      expect.objectContaining({ cwd: '/worktree' })
    )
    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'fix: retry after repair'],
      expect.objectContaining({ cwd: '/worktree' })
    )
  })

  it('repairs a poisoned index before reading status', async () => {
    readFileMock.mockResolvedValue('# manifold: managed-worktree excludes start\n')
    mockSpawnSequence([
      { stdout: '/repo/.git/info/exclude\n' },
      {
        stdout: '',
        exitCode: 128,
        stderr: 'fatal: unable to read deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      },
      { stdout: '/repo/.git/index\n' },
      { stdout: '' },
      { stdout: '/repo/.git/info/exclude\n' },
      { stdout: ' M src/file.ts\n' },
    ])

    const status = await getManagedWorktreeStatus('/worktree')

    expect(status).toBe(' M src/file.ts\n')
    expect(renameMock).toHaveBeenCalled()
  })
})
