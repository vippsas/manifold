import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { installWatchSkills } from './skill-installer'

const tmpHome = path.join(os.tmpdir(), `watch-installer-${process.pid}-${Date.now()}`)
const tmpSrc = path.join(os.tmpdir(), `watch-installer-src-${process.pid}-${Date.now()}`)

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

  it('rewrites the Codex-installed skill to remove Claude-specific Read instructions', () => {
    fs.mkdirSync(tmpSrc, { recursive: true })
    fs.writeFileSync(path.join(tmpSrc, 'plugin.json'), JSON.stringify({ version: '0.2.0' }))
    fs.writeFileSync(
      path.join(tmpSrc, 'SKILL.md'),
      [
        '---',
        'description: Watch a video that Manifold has pre-staged. Manifold\\'s main process downloads the video, extracts auto-scaled frames with ffmpeg, and produces a timestamped transcript (native captions or gpt-4o-transcribe). This skill receives the report path and tells Claude to read each frame.',
        'allowed-tools: Bash, Read',
        '---',
        '# /watch — Claude watches a Manifold-prepared video',
        '5. Pastes `/watch:watch <workdir>` into the active Claude Code agent',
        '2. Read each frame path the report lists',
        'Use the `Read` tool on every frame path in a single message (parallel tool calls)',
        'If no question was asked, summarize the video — structure, key moments, notable visuals, spoken content.',
      ].join('\n'),
    )
    fs.mkdirSync(path.join(tmpSrc, 'commands'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpSrc, 'commands', 'watch.md'),
      [
        '---',
        'allowed-tools: [Bash, Read]',
        '---',
        'Read `report.md`, then Read every frame path it lists, and answer the user\\'s question grounded in the frames and transcript.',
      ].join('\n'),
    )

    installWatchSkills({ sourceDir: tmpSrc, homeDir: tmpHome, hasCodex: true })

    const codexSkill = fs.readFileSync(path.join(tmpHome, '.codex', 'skills', 'watch', 'SKILL.md'), 'utf-8')
    const codexCommand = fs.readFileSync(
      path.join(tmpHome, '.codex', 'skills', 'watch', 'commands', 'watch.md'),
      'utf-8',
    )

    expect(codexSkill).toContain('tells Codex to inspect each frame.')
    expect(codexSkill).toContain('allowed-tools: Bash')
    expect(codexSkill).toContain('# /watch — Codex watches a Manifold-prepared video')
    expect(codexSkill).toContain('active Codex agent')
    expect(codexSkill).toContain('Inspect each frame path the report lists with `view_image`')
    expect(codexSkill).toContain('Use `view_image` on every frame path in sequence or small batches')
    expect(codexSkill).not.toContain('Claude Code')
    expect(codexSkill).not.toContain('allowed-tools: Bash, Read')
    expect(codexCommand).toContain('allowed-tools: [Bash]')
    expect(codexCommand).toContain('inspect every frame path it lists')
    expect(codexCommand).not.toContain('Read every frame path')
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
