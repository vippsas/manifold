import { describe, it, expect, vi } from 'vitest'
import { createLmService } from './lm-service'

const fakeRuntime = { id: 'fake-runtime', aiModelArgs: ['--model', 'x'] } as never

function deps(over: { session?: unknown; runtime?: unknown; aiGenerate?: (...a: unknown[]) => Promise<string> } = {}): {
  sm: unknown; gitOps: unknown; getRuntime: unknown; aiGenerate: (...a: unknown[]) => Promise<string>
} {
  const aiGenerate = over.aiGenerate ?? vi.fn(async () => 'JUDGED\nFINAL_SCORE: 7')
  const sm = { getSession: (_id: string) => (over.session === undefined ? { runtimeId: 'fake-runtime', worktreePath: '/wt' } : over.session) }
  const gitOps = { aiGenerate }
  const getRuntime = (_id: string) => (over.runtime === undefined ? fakeRuntime : over.runtime)
  return { sm, gitOps, getRuntime, aiGenerate }
}

describe('createLmService', () => {
  it('selectChatModels returns the active session runtime id', async () => {
    const d = deps()
    const svc = createLmService(d.sm as never, d.gitOps as never, d.getRuntime as never)
    expect(await svc.selectChatModels('s1')).toEqual([{ id: 'fake-runtime' }])
  })

  it('selectChatModels returns [] when there is no active session', async () => {
    const d = deps()
    const svc = createLmService(d.sm as never, d.gitOps as never, d.getRuntime as never)
    expect(await svc.selectChatModels(undefined)).toEqual([])
  })

  it('sendRequest runs aiGenerate with the runtime, worktree, and model args', async () => {
    const d = deps()
    const svc = createLmService(d.sm as never, d.gitOps as never, d.getRuntime as never)
    const res = await svc.sendRequest('s1', 'PROMPT', { timeoutMs: 5000 })
    expect(res.text).toContain('FINAL_SCORE: 7')
    expect(d.aiGenerate).toHaveBeenCalledWith(fakeRuntime, 'PROMPT', '/wt', ['--model', 'x'], { silent: true, timeoutMs: 5000 })
  })

  it('sendRequest throws when there is no active session runtime', async () => {
    const d = deps()
    const svc = createLmService({ getSession: () => undefined } as never, d.gitOps as never, d.getRuntime as never)
    await expect(svc.sendRequest('s1', 'PROMPT')).rejects.toThrow(/no active session runtime/i)
  })
})
