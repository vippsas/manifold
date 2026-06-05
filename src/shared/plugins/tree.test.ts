import { describe, expect, it } from 'vitest'
import { collapsibleStateToWire } from './tree'

describe('collapsibleStateToWire', () => {
  it('maps vscode numeric states', () => {
    expect(collapsibleStateToWire(0)).toBe('none')
    expect(collapsibleStateToWire(1)).toBe('collapsed')
    expect(collapsibleStateToWire(2)).toBe('expanded')
    expect(collapsibleStateToWire(undefined)).toBe('none')
  })
})
