import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { openTerminal } from './open-terminal'

class DummyChild extends EventEmitter {
  pid = 1234
  unref = vi.fn()
}

describe('openTerminal', () => {
  it.each([
    ['darwin', 'open', ['-a', 'Terminal', '/tmp/repo']],
    ['linux', 'x-terminal-emulator', ['--working-directory', '/tmp/repo']],
  ] as const)('uses the platform terminal on %s', async (platform, command, args) => {
    const child = new DummyChild()
    const spawn = vi.fn(() => child)
    const opened = openTerminal('/tmp/repo', platform, spawn as never)

    child.emit('spawn')

    await expect(opened).resolves.toBeUndefined()
    expect(spawn).toHaveBeenCalledWith(command, args, { detached: true, stdio: 'ignore' })
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('rejects unsupported platforms without spawning', async () => {
    const spawn = vi.fn()

    await expect(openTerminal('/tmp', 'win32', spawn as never)).rejects.toThrow('not supported on win32')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects when the terminal process cannot start', async () => {
    const child = new DummyChild()
    const spawn = vi.fn(() => child)
    const opened = openTerminal('/tmp', 'linux', spawn as never)

    child.emit('error', new Error('not found'))

    await expect(opened).rejects.toThrow(/^Failed to open terminal$/)
  })
})
