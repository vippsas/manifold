import { describe, it, expect, vi, beforeEach } from 'vitest'

const startMock = vi.fn()
const stopMock = vi.fn()

vi.mock('electron', () => ({
  powerSaveBlocker: {
    start: (...args: unknown[]) => startMock(...args),
    stop: (...args: unknown[]) => stopMock(...args),
  },
}))

import { PowerManager } from './power-manager'

describe('PowerManager', () => {
  beforeEach(() => {
    startMock.mockReset()
    stopMock.mockReset()
  })

  it('starts a prevent-app-suspension blocker on enable', () => {
    startMock.mockReturnValue(42)
    const pm = new PowerManager()
    pm.enable()
    expect(startMock).toHaveBeenCalledTimes(1)
    expect(startMock).toHaveBeenCalledWith('prevent-app-suspension')
    expect(pm.isEnabled()).toBe(true)
  })

  it('is idempotent on enable', () => {
    startMock.mockReturnValue(7)
    const pm = new PowerManager()
    pm.enable()
    pm.enable()
    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it('stops the blocker with the original id on disable', () => {
    startMock.mockReturnValue(99)
    const pm = new PowerManager()
    pm.enable()
    pm.disable()
    expect(stopMock).toHaveBeenCalledTimes(1)
    expect(stopMock).toHaveBeenCalledWith(99)
    expect(pm.isEnabled()).toBe(false)
  })

  it('disable is a no-op when not enabled', () => {
    const pm = new PowerManager()
    pm.disable()
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('can re-enable after disable', () => {
    startMock.mockReturnValueOnce(1).mockReturnValueOnce(2)
    const pm = new PowerManager()
    pm.enable()
    pm.disable()
    pm.enable()
    expect(startMock).toHaveBeenCalledTimes(2)
    expect(stopMock).toHaveBeenCalledWith(1)
    expect(pm.isEnabled()).toBe(true)
  })
})
