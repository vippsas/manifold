// src/main/plugins/command-registry.test.ts
import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from './command-registry'

describe('CommandRegistry', () => {
  it('routes execution to the registered owner invoker', async () => {
    const reg = new CommandRegistry()
    const invoke = vi.fn(async (id: string, args: unknown[]) => `${id}:${args.join(',')}`)
    reg.register('cmd.a', 'pub.test', invoke)
    expect(await reg.execute('cmd.a', [1, 2])).toBe('cmd.a:1,2')
    expect(invoke).toHaveBeenCalledWith('cmd.a', [1, 2])
  })
  it('throws for an unknown command', async () => {
    const reg = new CommandRegistry()
    await expect(reg.execute('nope', [])).rejects.toThrow(/nope/)
  })
  it('unregister removes a command', () => {
    const reg = new CommandRegistry()
    reg.register('cmd.a', 'pub.test', async () => 'x')
    reg.unregister('cmd.a', 'pub.test')
    expect(reg.has('cmd.a')).toBe(false)
  })
  it('keeps the first registrant on cross-owner id collision and reports it', async () => {
    const reg = new CommandRegistry()
    const warnings: string[] = []
    reg.onCollision((msg) => warnings.push(msg))
    reg.register('shared.cmd', 'pub.a', async () => 'A')
    reg.register('shared.cmd', 'pub.b', async () => 'B') // collision — ignored
    expect(reg.ownerOf('shared.cmd')).toBe('pub.a')
    expect(await reg.execute('shared.cmd', [])).toBe('A')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/shared\.cmd/)
  })
  it('ignores unregister from a non-owner', async () => {
    const reg = new CommandRegistry()
    reg.register('c', 'pub.a', async () => 1)
    reg.unregister('c', 'pub.b')
    expect(reg.has('c')).toBe(true)
    reg.unregister('c', 'pub.a')
    expect(reg.has('c')).toBe(false)
  })
  it('lets the same owner re-register (idempotent reactivation)', async () => {
    const reg = new CommandRegistry()
    reg.register('c', 'pub.a', async () => 1)
    reg.register('c', 'pub.a', async () => 2)
    expect(reg.has('c')).toBe(true)
    expect(reg.ownerOf('c')).toBe('pub.a')
    expect(await reg.execute('c', [])).toBe(2)
  })
  it('clear() drops all commands and owners (used when the host re-forks)', () => {
    const reg = new CommandRegistry()
    reg.register('a', 'pub.a', async () => 1)
    reg.register('b', 'pub.b', async () => 2)
    reg.clear()
    expect(reg.has('a')).toBe(false)
    expect(reg.has('b')).toBe(false)
    expect(reg.ownerOf('a')).toBeUndefined()
    // After a clear, a fresh owner can claim a previously-registered id (no stale-owner block).
    reg.register('a', 'pub.c', async () => 3)
    expect(reg.ownerOf('a')).toBe('pub.c')
  })
})
