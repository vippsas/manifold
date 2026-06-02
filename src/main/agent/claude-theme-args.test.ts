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
