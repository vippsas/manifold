// src/main/plugins/command-registry.test.ts
import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from './command-registry'

describe('CommandRegistry', () => {
  it('routes execution to the registered owner invoker', async () => {
    const reg = new CommandRegistry()
    const invoke = vi.fn(async (id: string, args: unknown[]) => `${id}:${args.join(',')}`)
    reg.register('cmd.a', invoke)
    expect(await reg.execute('cmd.a', [1, 2])).toBe('cmd.a:1,2')
    expect(invoke).toHaveBeenCalledWith('cmd.a', [1, 2])
  })
  it('throws for an unknown command', async () => {
    const reg = new CommandRegistry()
    await expect(reg.execute('nope', [])).rejects.toThrow(/nope/)
  })
  it('unregister removes a command', () => {
    const reg = new CommandRegistry()
    reg.register('cmd.a', async () => 'x')
    reg.unregister('cmd.a')
    expect(reg.has('cmd.a')).toBe(false)
  })
})
