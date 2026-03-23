// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest'
import { join } from 'node:path'
import { configureDevProfilePaths, DEV_PROFILE_NAME } from './dev-profile'

const mkdirSync = vi.hoisted(() => vi.fn())
const rmSync = vi.hoisted(() => vi.fn())

vi.mock('node:fs', () => ({
  mkdirSync,
  rmSync,
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('configureDevProfilePaths', () => {
  it('configures dedicated dev userData and sessionData paths before app ready', () => {
    const setPath = vi.fn()
    configureDevProfilePaths({
      isPackaged: false,
      getPath: () => '/Users/test/Library/Application Support',
      setPath,
    })

    const devRoot = join('/Users/test/Library/Application Support', DEV_PROFILE_NAME)
    expect(mkdirSync).toHaveBeenCalledWith(devRoot, { recursive: true })
    expect(mkdirSync).toHaveBeenCalledWith(join(devRoot, 'session-data'), { recursive: true })
    expect(setPath).toHaveBeenCalledWith('userData', devRoot)
    expect(setPath).toHaveBeenCalledWith('sessionData', join(devRoot, 'session-data'))
    expect(rmSync).toHaveBeenCalled()
  })

  it('does nothing for packaged builds', () => {
    const setPath = vi.fn()
    configureDevProfilePaths({
      isPackaged: true,
      getPath: () => '/Users/test/Library/Application Support',
      setPath,
    })

    expect(mkdirSync).not.toHaveBeenCalled()
    expect(rmSync).not.toHaveBeenCalled()
    expect(setPath).not.toHaveBeenCalled()
  })
})
