import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    default: { ...actual, spawn: mockSpawn },
    spawn: mockSpawn,
  }
})

import { generateBranchName, slugify, repoPrefix } from './branch-namer'

/**
 * Creates a fake child process that emits stdout data and then closes with code 0.
 */
function fakeSpawnSuccess(stdout: string): void {
  mockSpawn.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()

    // Emit data and close asynchronously so listeners are attached first
    process.nextTick(() => {
      if (stdout) {
        child.stdout.emit('data', Buffer.from(stdout))
      }
      child.emit('close', 0)
    })

    return child
  })
}

describe('slugify', () => {
  it('converts Norwegian characters ae, o, a', () => {
    expect(slugify('Tromsø')).toBe('tromso')
    expect(slugify('Ålesund')).toBe('alesund')
    expect(slugify('Tønsberg')).toBe('tonsberg')
  })

  it('handles the ae ligature', () => {
    expect(slugify('Bærum')).toBe('baerum')
  })

  it('converts to lowercase', () => {
    expect(slugify('Oslo')).toBe('oslo')
    expect(slugify('BERGEN')).toBe('bergen')
  })

  it('replaces spaces and special chars with hyphens', () => {
    expect(slugify('Mo i Rana')).toBe('mo-i-rana')
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('a--b---c')).toBe('a-b-c')
  })

  it('strips leading and trailing hyphens', () => {
    expect(slugify('-oslo-')).toBe('oslo')
  })

  it('handles already-ascii names', () => {
    expect(slugify('Oslo')).toBe('oslo')
    expect(slugify('Bergen')).toBe('bergen')
  })

  it('slugifies a task description', () => {
    expect(slugify('Fix the login button')).toBe('fix-the-login-button')
  })

  it('truncates long descriptions to 50 chars without trailing hyphen', () => {
    const long = 'a'.repeat(60)
    const result = slugify(long)
    expect(result.length).toBeLessThanOrEqual(50)
    expect(result).not.toMatch(/-$/)
  })

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('')
  })
})

describe('repoPrefix', () => {
  it('derives prefix from repo path basename', () => {
    expect(repoPrefix('/Users/sven/code/my-app')).toBe('my-app/')
  })

  it('lowercases the prefix', () => {
    expect(repoPrefix('/Users/sven/code/MyApp')).toBe('myapp/')
  })

  it('handles simple paths', () => {
    expect(repoPrefix('/repo')).toBe('repo/')
  })
})

describe('generateBranchName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('slugifies the task description into a branch name', async () => {
    fakeSpawnSuccess('')

    const name = await generateBranchName('/repo', 'Fix the login button')
    expect(name).toBe('repo/fix-the-login-button')
  })

  it('appends numeric suffix when branch already exists', async () => {
    fakeSpawnSuccess('repo/fix-the-login-button\n')

    const name = await generateBranchName('/repo', 'Fix the login button')
    expect(name).toBe('repo/fix-the-login-button-2')
  })

  it('increments suffix when multiple duplicates exist', async () => {
    fakeSpawnSuccess('repo/fix-bug\nrepo/fix-bug-2\nrepo/fix-bug-3\n')

    const name = await generateBranchName('/repo', 'Fix bug')
    expect(name).toBe('repo/fix-bug-4')
  })

  it('falls back to timestamp when description is empty', async () => {
    fakeSpawnSuccess('')

    const name = await generateBranchName('/repo', '')
    expect(name).toMatch(/^repo\/task-\d+$/)
  })

  it('uses project directory name as prefix', async () => {
    fakeSpawnSuccess('')

    const name = await generateBranchName('/Users/sven/code/my-app', 'Add tests')
    expect(name).toMatch(/^my-app\//)
    expect(name).toBe('my-app/add-tests')
  })
})
