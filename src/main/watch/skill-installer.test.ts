import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { installWatchSkills } from './skill-installer'

const tmpHome = path.join(os.tmpdir(), `watch-installer-${process.pid}-${Date.now()}`)
const tmpSrc = path.join(os.tmpdir(), `watch-installer-src-${process.pid}-${Date.now()}`)

function writeSourceSkill(version = '0.1.2'): void {
  fs.mkdirSync(tmpSrc, { recursive: true })
  fs.writeFileSync(path.join(tmpSrc, 'plugin.json'), JSON.stringify({ version }))
  fs.writeFileSync(path.join(tmpSrc, 'SKILL.md'), '# watch')
  fs.mkdirSync(path.join(tmpSrc, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(tmpSrc, 'scripts', 'watch.py'), '# script')
}

function expectedClaudePath(version = '0.1.2'): string {
  return path.join(tmpHome, '.claude', 'plugins', 'cache', 'claude-video', 'watch', version)
}

beforeEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.rmSync(tmpSrc, { recursive: true, force: true })
})
afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.rmSync(tmpSrc, { recursive: true, force: true })
})

describe('installWatchSkills', () => {
  it('copies skill into Claude Code cache path', () => {
    writeSourceSkill()
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.installed).toContain(expectedClaudePath())
    expect(fs.existsSync(path.join(expectedClaudePath(), 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(expectedClaudePath(), 'scripts', 'watch.py'))).toBe(true)
  })

  it('updates installed_plugins.json with user-scoped entry', () => {
    writeSourceSkill()
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    const registry = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'plugins', 'installed_plugins.json'), 'utf-8'),
    )
    expect(registry.plugins['watch@claude-video']).toBeDefined()
    expect(registry.plugins['watch@claude-video'][0].scope).toBe('user')
    expect(registry.plugins['watch@claude-video'][0].installPath).toBe(expectedClaudePath())
    expect(registry.plugins['watch@claude-video'][0].version).toBe('0.1.2')
  })

  it('enables the plugin in settings.json', () => {
    writeSourceSkill()
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    )
    expect(settings.enabledPlugins['watch@claude-video']).toBe(true)
  })

  it('preserves existing settings keys when enabling plugin', () => {
    writeSourceSkill()
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpHome, '.claude', 'settings.json'),
      JSON.stringify({ theme: 'dark', enabledPlugins: { 'other@x': true } }),
    )
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.claude', 'settings.json'), 'utf-8'),
    )
    expect(settings.theme).toBe('dark')
    expect(settings.enabledPlugins['other@x']).toBe(true)
    expect(settings.enabledPlugins['watch@claude-video']).toBe(true)
  })

  it('also installs into ~/.codex/skills/watch when hasCodex=true', () => {
    writeSourceSkill()
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: true })
    expect(result.installed).toContain(path.join(tmpHome, '.codex', 'skills', 'watch'))
  })

  it('skips when version marker matches', () => {
    writeSourceSkill('0.1.2')
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    fs.writeFileSync(path.join(tmpSrc, 'SKILL.md'), '# changed but version unchanged')
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.skipped.length).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(expectedClaudePath(), 'SKILL.md'), 'utf-8')).toBe('# watch')
  })

  it('reinstalls when version changes', () => {
    writeSourceSkill('0.1.2')
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    writeSourceSkill('0.2.0')
    fs.writeFileSync(path.join(tmpSrc, 'SKILL.md'), '# v2')
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.installed.length).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(expectedClaudePath('0.2.0'), 'SKILL.md'), 'utf-8')).toBe('# v2')
  })

  it('reports error when sourceDir does not exist', () => {
    const result = installWatchSkills({ sourceDir: '/nonexistent/path', homeDir: tmpHome, hasCodex: false })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.installed.length).toBe(0)
  })
})
