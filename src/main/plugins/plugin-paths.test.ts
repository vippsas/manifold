// src/main/plugins/plugin-paths.test.ts
import { describe, expect, it } from 'vitest'
import { getUserPluginsDir } from './plugin-paths'

describe('getUserPluginsDir', () => {
  it('returns storagePath/plugins', () => {
    expect(getUserPluginsDir('/x')).toBe('/x/plugins')
  })
})
