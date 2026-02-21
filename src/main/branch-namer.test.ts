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

import { generateBranchName, slugifyCity, repoPrefix } from './branch-namer'

/**
 * Creates a fake child process that emits stdout data and then closes with code 0.
 */
function fakeSpawnSuccess(stdout: string): void {
  mockSpawn.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter }
    child.stdout = new EventEmitter()

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

describe('slugifyCity', () => {
  it('converts Norwegian characters ae, o, a', () => {
    expect(slugifyCity('Tromsø')).toBe('tromso')
    expect(slugifyCity('Ålesund')).toBe('alesund')
    expect(slugifyCity('Tønsberg')).toBe('tonsberg')
  })

  it('handles the ae ligature', () => {
    expect(slugifyCity('Bærum')).toBe('baerum')
  })

  it('converts to lowercase', () => {
    expect(slugifyCity('Oslo')).toBe('oslo')
    expect(slugifyCity('BERGEN')).toBe('bergen')
  })

  it('replaces spaces and special chars with hyphens', () => {
    expect(slugifyCity('Mo i Rana')).toBe('mo-i-rana')
  })

  it('collapses multiple hyphens', () => {
    expect(slugifyCity('a--b---c')).toBe('a-b-c')
  })

  it('strips leading and trailing hyphens', () => {
    expect(slugifyCity('-oslo-')).toBe('oslo')
  })

  it('handles already-ascii names', () => {
    expect(slugifyCity('Oslo')).toBe('oslo')
    expect(slugifyCity('Bergen')).toBe('bergen')
  })

  it('handles Bodø correctly', () => {
    expect(slugifyCity('Bodø')).toBe('bodo')
  })

  it('handles Gjøvik correctly', () => {
    expect(slugifyCity('Gjøvik')).toBe('gjovik')
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

  it('returns the first city slug when no branches exist', async () => {
    fakeSpawnSuccess('')

    const name = await generateBranchName('/repo')
    expect(name).toBe('repo/oslo')
  })

  it('skips already-taken branch names', async () => {
    fakeSpawnSuccess('repo/oslo\n')

    const name = await generateBranchName('/repo')
    expect(name).toBe('repo/bergen')
  })

  it('skips multiple taken names', async () => {
    fakeSpawnSuccess('repo/oslo\nrepo/bergen\nrepo/trondheim\n')

    const name = await generateBranchName('/repo')
    expect(name).toBe('repo/stavanger')
  })

  it('appends numeric suffix when all base names are taken', async () => {
    const allBaseNames = [
      'oslo', 'bergen', 'trondheim', 'stavanger', 'drammen',
      'fredrikstad', 'kristiansand', 'sandnes', 'tromso', 'sarpsborg',
      'bodo', 'sandefjord', 'alesund', 'larvik', 'tonsberg',
      'arendal', 'haugesund', 'porsgrunn', 'skien', 'moss',
      'halden', 'harstad', 'molde', 'lillehammer', 'kongsberg',
      'gjovik', 'horten', 'narvik', 'hammerfest', 'alta',
      'hamar', 'elverum', 'steinkjer', 'namsos', 'kristiansund',
      'grimstad', 'mandal', 'flekkefjord', 'egersund', 'bryne',
      'leirvik', 'odda', 'voss', 'forde', 'floro',
      'orsta', 'volda', 'ulsteinvik', 'fosnavag', 'andalsnes',
      'sunndalsora', 'orkanger', 'malvik', 'verdal', 'levanger',
      'roros', 'tynset', 'mosjoen', 'sandnessjoen', 'mo',
      'fauske', 'sortland', 'svolvaer', 'leknes', 'stokmarknes',
      'finnsnes', 'bardufoss', 'sjovegan', 'skanland', 'kvaefjord',
      'honningsvag', 'lakselv', 'tana', 'vadso', 'vardo',
      'kirkenes', 'kautokeino', 'karasjok', 'batsfjord', 'berlevag',
      'kongsvinger', 'mysen', 'askim', 'ski', 'as',
      'drobak', 'lillestrom', 'jessheim', 'eidsvoll', 'honefoss',
      'fagernes', 'rjukan', 'notodden', 'bo', 'kragero',
      'risor', 'lyngdal', 'farsund', 'sirdal', 'sauda',
    ]

    const allBranches = allBaseNames.map((slug) => `repo/${slug}`).join('\n')
    fakeSpawnSuccess(allBranches + '\n')

    const name = await generateBranchName('/repo')
    expect(name).toBe('repo/oslo-2')
  })

  it('result uses repo name as prefix', async () => {
    fakeSpawnSuccess('')

    const name = await generateBranchName('/repo')
    expect(name).toMatch(/^repo\//)
  })

  it('uses project directory name as prefix', async () => {
    fakeSpawnSuccess('')

    const name = await generateBranchName('/Users/sven/code/my-app')
    expect(name).toMatch(/^my-app\//)
  })
})
