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

    // A client/server terminal (e.g. gnome-terminal) hands off and exits 0.
    child.emit('exit', 0)

    await expect(opened).resolves.toBeUndefined()
    expect(spawn).toHaveBeenCalledWith(command, args, { detached: true, stdio: 'ignore' })
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('resolves for a foreground terminal still running past the grace window', async () => {
    const child = new DummyChild()
    const spawn = vi.fn(() => child)

    // No exit/error: the grace timer decides success.
    await expect(openTerminal('/tmp/repo', 'linux', spawn as never, 1)).resolves.toBeUndefined()
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('rejects when the terminal exits non-zero (e.g. an unsupported flag)', async () => {
    const child = new DummyChild()
    const spawn = vi.fn(() => child)
    const opened = openTerminal('/tmp/repo', 'linux', spawn as never)

    child.emit('exit', 1)

    await expect(opened).rejects.toThrow(/exited with code 1/)
    expect(child.unref).not.toHaveBeenCalled()
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
