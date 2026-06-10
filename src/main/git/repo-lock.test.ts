import { describe, it, expect } from 'vitest'
import { withRepoLock } from './repo-lock'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('withRepoLock', () => {
  it('serializes operations for the same key (second waits for first)', async () => {
    const events: string[] = []
    const first = deferred<void>()

    const p1 = withRepoLock('/repo', async () => {
      events.push('start-1')
      await first.promise
      events.push('end-1')
    })
    const p2 = withRepoLock('/repo', async () => {
      events.push('start-2')
    })

    // p2 must not start until p1 completes.
    await Promise.resolve()
    expect(events).toEqual(['start-1'])

    first.resolve()
    await Promise.all([p1, p2])
    expect(events).toEqual(['start-1', 'end-1', 'start-2'])
  })

  it('runs operations for different keys concurrently', async () => {
    const events: string[] = []
    const a = deferred<void>()

    const pa = withRepoLock('/repo-a', async () => {
      events.push('start-a')
      await a.promise
      events.push('end-a')
    })
    const pb = withRepoLock('/repo-b', async () => {
      events.push('start-b')
    })

    await pb
    // /repo-b finished while /repo-a is still blocked.
    expect(events).toEqual(['start-a', 'start-b'])

    a.resolve()
    await pa
    expect(events).toContain('end-a')
  })

  it('keeps the chain alive after an operation rejects', async () => {
    const events: string[] = []

    const p1 = withRepoLock('/repo', async () => {
      events.push('start-1')
      throw new Error('boom')
    })
    const p2 = withRepoLock('/repo', async () => {
      events.push('start-2')
    })

    await expect(p1).rejects.toThrow('boom')
    await p2
    expect(events).toEqual(['start-1', 'start-2'])
  })

  it('propagates the operation result', async () => {
    await expect(withRepoLock('/repo', async () => 42)).resolves.toBe(42)
  })
})
