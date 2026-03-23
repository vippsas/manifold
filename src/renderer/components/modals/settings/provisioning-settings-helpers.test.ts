import { describe, expect, it } from 'vitest'
import { parseProvisionerArgs, stringifyProvisionerArgs } from './provisioning-settings-helpers'

describe('provisioning-settings-helpers', () => {
  it('preserves quoted args with spaces when parsing', () => {
    expect(parseProvisionerArgs('--profile "Engineering Team" --config "/Users/me/Application Support/provisioner.json"')).toEqual([
      '--profile',
      'Engineering Team',
      '--config',
      '/Users/me/Application Support/provisioner.json',
    ])
  })

  it('round-trips args with spaces through the text field format', () => {
    const args = ['--profile', 'Engineering Team', '--config', '/Users/me/Application Support/provisioner.json']
    expect(parseProvisionerArgs(stringifyProvisionerArgs(args))).toEqual(args)
  })
})
