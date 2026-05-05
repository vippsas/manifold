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

beforeEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.rmSync(tmpSrc, { recursive: true, force: true })
})
afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.rmSync(tmpSrc, { recursive: true, force: true })
})

describe('installWatchSkills', () => {
  it('copies skill into ~/.claude/plugins/watch', () => {
    writeSourceSkill()
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.installed).toContain(path.join(tmpHome, '.claude', 'plugins', 'watch'))
    expect(fs.existsSync(path.join(tmpHome, '.claude', 'plugins', 'watch', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpHome, '.claude', 'plugins', 'watch', 'scripts', 'watch.py'))).toBe(true)
  })

  it('also installs into ~/.codex/skills/watch when hasCodex=true', () => {
    writeSourceSkill()
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: true })
    expect(result.installed).toContain(path.join(tmpHome, '.codex', 'skills', 'watch'))
    expect(fs.existsSync(path.join(tmpHome, '.codex', 'skills', 'watch', 'SKILL.md'))).toBe(true)
  })

  it('skips when version marker matches', () => {
    writeSourceSkill('0.1.2')
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    fs.writeFileSync(path.join(tmpSrc, 'SKILL.md'), '# changed (but version unchanged)')
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.skipped.length).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(tmpHome, '.claude', 'plugins', 'watch', 'SKILL.md'), 'utf-8'))
      .toBe('# watch')
  })

  it('reinstalls when version changes', () => {
    writeSourceSkill('0.1.2')
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    writeSourceSkill('0.2.0')
    fs.writeFileSync(path.join(tmpSrc, 'SKILL.md'), '# v2')
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.installed.length).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(tmpHome, '.claude', 'plugins', 'watch', 'SKILL.md'), 'utf-8'))
      .toBe('# v2')
  })

  it('reports error when sourceDir does not exist', () => {
    const result = installWatchSkills({ sourceDir: '/nonexistent/path', homeDir: tmpHome, hasCodex: false })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.installed.length).toBe(0)
  })
})
