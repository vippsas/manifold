import { describe, it, expect, vi, beforeEach } from 'vitest'

const execFileMock = vi.fn()
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
  default: { execFile: (...args: unknown[]) => execFileMock(...args) },
}))

import { listWorktreeFiles } from './list-files'

// promisify(execFile) (without the custom symbol) resolves with the first
// post-error callback argument, so resolve with an object exposing `stdout`.
function resolveWith(stdout: string): void {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb: (e: unknown, r: unknown) => void) => {
    cb(null, { stdout })
  })
}

describe('listWorktreeFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns non-empty relative paths from git ls-files', async () => {
    resolveWith('a.ts\nsrc/b.ts\n\n')
    expect(await listWorktreeFiles('/repo')).toEqual(['a.ts', 'src/b.ts'])
  })

  it('returns an empty list when git fails', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb: (e: unknown, r: unknown) => void) => {
      cb(new Error('not a git repo'), null)
    })
    expect(await listWorktreeFiles('/repo')).toEqual([])
  })

  it('caps the result to 10000 entries', async () => {
    resolveWith(Array.from({ length: 10005 }, (_v, i) => `f${i}.ts`).join('\n'))
    expect((await listWorktreeFiles('/repo')).length).toBe(10000)
  })
})
