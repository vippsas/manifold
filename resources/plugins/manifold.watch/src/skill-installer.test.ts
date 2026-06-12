import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { installWatchSkills } from './skill-installer'

const tmpHome = path.join(os.tmpdir(), `watch-installer-${process.pid}-${Date.now()}`)
const tmpSrc = path.join(os.tmpdir(), `watch-installer-src-${process.pid}-${Date.now()}`)

// The real skill shipped with the plugin, so the Codex-adaptation test doubles
// as a drift guard: reword SKILL.md without updating CODEX_SKILL_SUBS and the
// "no drift" assertion below fails.
const BUNDLED_SKILL_DIR = path.resolve(process.cwd(), 'resources/plugins/manifold.watch/skills/watch')

function readBundledVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(BUNDLED_SKILL_DIR, 'plugin.json'), 'utf-8'))
  return pkg.version ?? '0.0.0'
}

function writeSourceSkill(version = '0.2.0'): void {
  fs.mkdirSync(tmpSrc, { recursive: true })
  fs.writeFileSync(path.join(tmpSrc, 'plugin.json'), JSON.stringify({ version }))
  fs.writeFileSync(path.join(tmpSrc, 'SKILL.md'), '# watch')
  fs.mkdirSync(path.join(tmpSrc, 'commands'), { recursive: true })
  fs.writeFileSync(path.join(tmpSrc, 'commands', 'watch.md'), '# command')
}

function expectedClaudePath(version = '0.2.0'): string {
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
    expect(fs.existsSync(path.join(expectedClaudePath(), 'commands', 'watch.md'))).toBe(true)
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
    expect(registry.plugins['watch@claude-video'][0].version).toBe('0.2.0')
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

  it('adapts the bundled skill for Codex: view_image instead of Read, no Claude-only tools', () => {
    const codexDir = path.join(tmpHome, '.codex', 'skills', 'watch')
    const result = installWatchSkills({ sourceDir: BUNDLED_SKILL_DIR, homeDir: tmpHome, hasCodex: true })

    // No drift: every CODEX_SKILL_SUBS token was found and rewritten.
    expect(result.errors).toEqual([])

    const skill = fs.readFileSync(path.join(codexDir, 'SKILL.md'), 'utf-8')
    const command = fs.readFileSync(path.join(codexDir, 'commands', 'watch.md'), 'utf-8')

    // Codex has no Read tool; it views images with view_image.
    expect(skill).not.toContain('allowed-tools: Bash, Read')
    expect(skill).toContain('allowed-tools: Bash')
    expect(skill).not.toContain('`Read` tool')
    expect(skill).toContain('`view_image` tool')
    expect(skill).not.toContain('Claude')
    expect(skill).toContain('# /watch — Codex watches a Manifold-prepared video')
    expect(skill).toContain('$watch <workdir>')

    expect(command).not.toContain('[Bash, Read]')
    expect(command).toContain('allowed-tools: [Bash]')
    expect(command).toContain('`view_image` tool')
  })

  it('leaves the Claude copy of the bundled skill verbatim', () => {
    installWatchSkills({ sourceDir: BUNDLED_SKILL_DIR, homeDir: tmpHome, hasCodex: true })
    const claudeSkill = fs.readFileSync(
      path.join(tmpHome, '.claude', 'plugins', 'cache', 'claude-video', 'watch', readBundledVersion(), 'SKILL.md'),
      'utf-8',
    )
    // The Claude install is untouched — it keeps the Read tool and Claude wording.
    expect(claudeSkill).toContain('allowed-tools: Bash, Read')
    expect(claudeSkill).toContain('Claude watches a Manifold-prepared video')
  })

  it('does not re-adapt or error on an already-installed Codex skill', () => {
    installWatchSkills({ sourceDir: BUNDLED_SKILL_DIR, homeDir: tmpHome, hasCodex: true })
    const codexDir = path.join(tmpHome, '.codex', 'skills', 'watch')
    const first = fs.readFileSync(path.join(codexDir, 'SKILL.md'), 'utf-8')

    const result = installWatchSkills({ sourceDir: BUNDLED_SKILL_DIR, homeDir: tmpHome, hasCodex: true })

    expect(result.errors).toEqual([])
    expect(result.skipped).toContain(codexDir)
    expect(fs.readFileSync(path.join(codexDir, 'SKILL.md'), 'utf-8')).toBe(first)
  })

  it('skips when source contents are unchanged', () => {
    writeSourceSkill()
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.skipped.length).toBeGreaterThan(0)
    expect(result.installed.length).toBe(0)
  })

  it('reinstalls when source contents change even at same version', () => {
    writeSourceSkill()
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    fs.writeFileSync(path.join(tmpSrc, 'SKILL.md'), '# patched contents (version unchanged)')
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.installed.length).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(expectedClaudePath(), 'SKILL.md'), 'utf-8'))
      .toBe('# patched contents (version unchanged)')
  })

  it('reinstalls when version changes', () => {
    writeSourceSkill('0.2.0')
    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    writeSourceSkill('0.3.0')
    fs.writeFileSync(path.join(tmpSrc, 'SKILL.md'), '# v3')
    const result = installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: false })
    expect(result.installed.length).toBeGreaterThan(0)
    expect(fs.readFileSync(path.join(expectedClaudePath('0.3.0'), 'SKILL.md'), 'utf-8')).toBe('# v3')
  })

  it('reports error when sourceDir does not exist', () => {
    const result = installWatchSkills({ sourceDir: '/nonexistent/path', homeDir: tmpHome, hasCodex: false })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.installed.length).toBe(0)
  })
})
