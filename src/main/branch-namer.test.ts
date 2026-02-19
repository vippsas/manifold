import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('simple-git', () => {
  const branchFn = vi.fn()
  const mockGit = { branch: branchFn }
  const simpleGit = vi.fn(() => mockGit)
  return { default: simpleGit, __mockGit: mockGit }
})

import { generateBranchName, slugifyCity } from './branch-namer'
import simpleGit from 'simple-git'

function getMockGit() {
  return (simpleGit as unknown as ReturnType<typeof vi.fn>)() as {
    branch: ReturnType<typeof vi.fn>
  }
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

describe('generateBranchName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the first city slug when no branches exist', async () => {
    const mockGit = getMockGit()
    mockGit.branch.mockResolvedValue({ all: [] })

    const name = await generateBranchName('/repo')
    expect(name).toBe('manifold/oslo')
  })

  it('skips already-taken branch names', async () => {
    const mockGit = getMockGit()
    mockGit.branch.mockResolvedValue({
      all: ['manifold/oslo'],
    })

    const name = await generateBranchName('/repo')
    expect(name).toBe('manifold/bergen')
  })

  it('skips multiple taken names', async () => {
    const mockGit = getMockGit()
    mockGit.branch.mockResolvedValue({
      all: ['manifold/oslo', 'manifold/bergen', 'manifold/trondheim'],
    })

    const name = await generateBranchName('/repo')
    expect(name).toBe('manifold/stavanger')
  })

  it('appends numeric suffix when all base names are taken', async () => {
    // Create a set with all 100 base city slugs
    const mockGit = getMockGit()
    // We need to know the exact slugs for the first few cities
    // Oslo, Bergen, Trondheim...
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

    const allBranches = allBaseNames.map((slug) => `manifold/${slug}`)
    mockGit.branch.mockResolvedValue({ all: allBranches })

    const name = await generateBranchName('/repo')
    expect(name).toBe('manifold/oslo-2')
  })

  it('result always starts with manifold/ prefix', async () => {
    const mockGit = getMockGit()
    mockGit.branch.mockResolvedValue({ all: [] })

    const name = await generateBranchName('/repo')
    expect(name).toMatch(/^manifold\//)
  })
})
