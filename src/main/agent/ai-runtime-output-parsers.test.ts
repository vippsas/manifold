import { describe, expect, it } from 'vitest'
import { extractSlashCommands } from './ai-runtime-output-parsers'

describe('extractSlashCommands', () => {
  it('returns the slash_commands list from a system/init event', () => {
    const event = {
      type: 'system',
      subtype: 'init',
      slash_commands: ['review', 'clear', 'commit-commands:commit'],
    }
    expect(extractSlashCommands(event)).toEqual(['review', 'clear', 'commit-commands:commit'])
  })

  it('returns null for non-init system events', () => {
    expect(extractSlashCommands({ type: 'system', subtype: 'other', slash_commands: ['review'] })).toBeNull()
  })

  it('returns null for non-system events', () => {
    expect(extractSlashCommands({ type: 'assistant' })).toBeNull()
  })

  it('returns null when slash_commands is missing', () => {
    expect(extractSlashCommands({ type: 'system', subtype: 'init' })).toBeNull()
  })

  it('keeps only string entries', () => {
    const event = { type: 'system', subtype: 'init', slash_commands: ['review', 42, null, 'clear'] }
    expect(extractSlashCommands(event)).toEqual(['review', 'clear'])
  })
})
