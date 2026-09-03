import { describe, it, expect } from 'vitest'
import { claudeAnsiThemeArgs } from './claude-theme-args'

describe('claudeAnsiThemeArgs', () => {
  it('selects the light ANSI theme for a light Manifold theme', () => {
    expect(claudeAnsiThemeArgs('light')).toEqual(['--settings', '{"theme":"light-ansi"}'])
  })

  it('selects the dark ANSI theme for a dark Manifold theme', () => {
    expect(claudeAnsiThemeArgs('dark')).toEqual(['--settings', '{"theme":"dark-ansi"}'])
  })

  it('emits valid JSON that only overrides the theme', () => {
    const [flag, json] = claudeAnsiThemeArgs('light')
    expect(flag).toBe('--settings')
    expect(JSON.parse(json)).toEqual({ theme: 'light-ansi' })
  })
})

describe('claudeAnsiThemeArgs for orchestrated workers', () => {
  it('adds Viola\'s catastrophic deny list, in the same settings object as the theme', () => {
    // Interactive workers previously got no deny list at all: the guard was only applied on the
    // chat-mode path. Claude takes one --settings, so both must travel together.
    const args = claudeAnsiThemeArgs('dark', { guarded: true })
    expect(args.filter((a) => a === '--settings')).toHaveLength(1)
    const settings = JSON.parse(args[args.indexOf('--settings') + 1]) as {
      theme: string
      permissions: { deny: string[] }
    }
    expect(settings.theme).toBe('dark-ansi')
    expect(settings.permissions.deny).toEqual(expect.arrayContaining([
      'Bash(git push*--force*)', 'Bash(rm -rf /*)', 'Bash(gh pr merge*)',
    ]))
  })

  it('replaces rather than inherits deny rules, so an unprovable path cannot escalate', () => {
    // An inline --settings overrides the same key in settings.json. A user Read(//.env*) deny rule
    // makes Claude escalate any command whose read path it cannot determine — and deny rules apply
    // in every permission mode, so bypass cannot clear them and an unattended worker just waits.
    const settings = JSON.parse(
      claudeAnsiThemeArgs('dark', { guarded: true })[
        claudeAnsiThemeArgs('dark', { guarded: true }).indexOf('--settings') + 1
      ],
    ) as { permissions: { deny: string[] } }
    expect(settings.permissions.deny.some((rule) => rule.startsWith('Read('))).toBe(false)
  })

  it('leaves a human-launched session\'s settings to the theme alone', () => {
    const settings = JSON.parse(
      claudeAnsiThemeArgs('light')[claudeAnsiThemeArgs('light').indexOf('--settings') + 1],
    ) as Record<string, unknown>
    expect(settings).toEqual({ theme: 'light-ansi' })
  })
})
