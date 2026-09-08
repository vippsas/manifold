import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('loadShellPath on linux', () => {
  const originalPlatform = process.platform
  const originalPath = process.env.PATH

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    process.env.PATH = '/usr/bin:/bin'
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true })
    process.env.PATH = originalPath
  })

  it('appends ~/.local/bin and /usr/local/bin when missing', async () => {
    vi.resetModules()
    const { loadShellPath } = await import('./shell-path')
    loadShellPath()
    expect(process.env.PATH).toContain('.local/bin')
    expect(process.env.PATH).toContain('/usr/local/bin')
  })

  it('does not duplicate entries already in PATH', async () => {
    process.env.PATH = '/usr/local/bin:/usr/bin'
    vi.resetModules()
    const { loadShellPath } = await import('./shell-path')
    loadShellPath()
    const entries = process.env.PATH!.split(':')
    const count = entries.filter(e => e === '/usr/local/bin').length
    expect(count).toBe(1)
  })
})

describe('nvm bin dir resolution', () => {
  const originalPlatform = process.platform
  const originalPath = process.env.PATH
  const originalHome = process.env.HOME
  let home: string

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    process.env.PATH = '/usr/bin:/bin'
    home = mkdtempSync(join(tmpdir(), 'shell-path-'))
    process.env.HOME = home
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true })
    process.env.PATH = originalPath
    process.env.HOME = originalHome
    rmSync(home, { recursive: true, force: true })
  })

  async function loadWith(nvm: { versions?: string[]; alias?: string }) {
    for (const version of nvm.versions ?? []) {
      mkdirSync(join(home, '.nvm', 'versions', 'node', version, 'bin'), { recursive: true })
    }
    if (nvm.alias !== undefined) {
      mkdirSync(join(home, '.nvm', 'alias'), { recursive: true })
      writeFileSync(join(home, '.nvm', 'alias', 'default'), nvm.alias)
    }
    vi.resetModules()
    const { loadShellPath } = await import('./shell-path')
    loadShellPath()
    return process.env.PATH!.split(':')
  }

  it('appends the bin dir of the version the default alias points at', async () => {
    const entries = await loadWith({ versions: ['v18.20.8', 'v20.19.6', 'v22.22.2'], alias: '20\n' })
    expect(entries).toContain(join(home, '.nvm/versions/node/v20.19.6/bin'))
  })

  it('resolves a fully qualified alias', async () => {
    const entries = await loadWith({ versions: ['v18.20.8', 'v20.19.6'], alias: 'v18.20.8' })
    expect(entries).toContain(join(home, '.nvm/versions/node/v18.20.8/bin'))
  })

  it('falls back to the newest installed version when the alias is unresolvable', async () => {
    const entries = await loadWith({ versions: ['v18.20.8', 'v20.19.6', 'v22.22.2'], alias: 'lts/iron' })
    expect(entries).toContain(join(home, '.nvm/versions/node/v22.22.2/bin'))
  })

  it('adds nothing when nvm is not installed', async () => {
    const entries = await loadWith({})
    expect(entries.some((entry) => entry.includes('.nvm'))).toBe(false)
  })
})
