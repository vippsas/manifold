import { describe, expect, it, vi } from 'vitest'
import { configureLinuxRendering } from './linux-rendering'

describe('configureLinuxRendering', () => {
  it.each([
    [{ WSL_DISTRO_NAME: 'Ubuntu' }, 'WSL_DISTRO_NAME'],
    [{ WSL_INTEROP: '/run/WSL/123_interop' }, 'WSL_INTEROP'],
  ])('disables hardware acceleration for WSL detected by %s', (env, _source) => {
    const app = { disableHardwareAcceleration: vi.fn(), commandLine: { appendSwitch: vi.fn() } }

    configureLinuxRendering(app, 'linux', env)

    expect(app.disableHardwareAcceleration).toHaveBeenCalledOnce()
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-dev-shm-usage')
  })

  it('keeps hardware acceleration on native Linux', () => {
    const app = { disableHardwareAcceleration: vi.fn(), commandLine: { appendSwitch: vi.fn() } }

    configureLinuxRendering(app, 'linux', {})

    expect(app.disableHardwareAcceleration).not.toHaveBeenCalled()
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('disable-dev-shm-usage')
  })

  it('does not apply Linux rendering policy on macOS', () => {
    const app = { disableHardwareAcceleration: vi.fn(), commandLine: { appendSwitch: vi.fn() } }

    configureLinuxRendering(app, 'darwin', { WSL_DISTRO_NAME: 'Ubuntu' })

    expect(app.disableHardwareAcceleration).not.toHaveBeenCalled()
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled()
  })
})
