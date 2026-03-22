import { describe, expect, it } from 'vitest'
import { getSearchRootLimit } from './search-root-limit'

describe('search root limits', () => {
  it('does not divide the requested limit across roots', () => {
    expect(getSearchRootLimit(100, 10)).toBe(100)
  })

  it('keeps a minimum limit of one result per root invocation', () => {
    expect(getSearchRootLimit(0, 4)).toBe(1)
  })
})
