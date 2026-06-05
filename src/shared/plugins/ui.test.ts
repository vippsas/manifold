import { describe, expect, it } from 'vitest'
import { normalizeQuickPickItems } from './ui'

describe('normalizeQuickPickItems', () => {
  it('wraps strings and passes items through', () => {
    expect(normalizeQuickPickItems(['a', { label: 'b', description: 'd' }])).toEqual([{ label: 'a' }, { label: 'b', description: 'd' }])
  })
})
