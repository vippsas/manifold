import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
