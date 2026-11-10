import { describe, expect, it } from 'vitest'
import { createLatestRequest } from './latest-request'

/** A job the test finishes by hand, so overlap is explicit rather than timed. */
function controllableJob(): {
  run: (key: string) => Promise<string>
  started: string[]
  finish: (index: number, value: string) => void
  fail: (index: number, error: Error) => void
} {
  const started: string[] = []
  const settlers: { resolve: (v: string) => void; reject: (e: Error) => void }[] = []
  return {
    started,
    run: (key) => new Promise<string>((resolve, reject) => {
      started.push(key)
      settlers.push({ resolve, reject })
    }),
    finish: (index, value) => settlers[index].resolve(value),
    fail: (index, error) => settlers[index].reject(error),
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('createLatestRequest', () => {
  it('runs a lone request straight away', async () => {
    const job = controllableJob()
    const request = createLatestRequest(job.run)

    const result = request('a')
    job.finish(0, 'first')

    await expect(result).resolves.toBe('first')
    expect(job.started).toEqual(['a'])
  })

  it('never has more than one run in flight per key, however many requests arrive', async () => {
    const job = controllableJob()
    const request = createLatestRequest(job.run)

    const results = Array.from({ length: 50 }, () => request('a'))
    await settle()

    expect(job.started).toHaveLength(1)

    job.finish(0, 'first')
    await settle()
    // The 49 that arrived mid-run share one follow-up, not 49 of them.
    expect(job.started).toHaveLength(2)

    job.finish(1, 'second')
    await expect(Promise.all(results)).resolves.toEqual(['first', ...Array(49).fill('second')])
    expect(job.started).toHaveLength(2)
  })

  it('answers a request that arrived mid-run with a run started after it', async () => {
    const job = controllableJob()
    const request = createLatestRequest(job.run)

    void request('a')
    const late = request('a')
    job.finish(0, 'stale')
    await settle()
    job.finish(1, 'fresh')

    await expect(late).resolves.toBe('fresh')
  })

  it('keeps keys independent', async () => {
    const job = controllableJob()
    const request = createLatestRequest(job.run)

    void request('a')
    void request('b')
    await settle()

    expect(job.started).toEqual(['a', 'b'])
  })

  it('runs the follow-up even when the run before it failed', async () => {
    const job = controllableJob()
    const request = createLatestRequest(job.run)

    const first = request('a')
    const late = request('a')
    job.fail(0, new Error('boom'))
    await expect(first).rejects.toThrow('boom')
    await settle()
    job.finish(1, 'recovered')

    await expect(late).resolves.toBe('recovered')
  })

  it('starts fresh once everything has settled', async () => {
    const job = controllableJob()
    const request = createLatestRequest(job.run)

    const first = request('a')
    job.finish(0, 'one')
    await first
    await settle()

    const second = request('a')
    job.finish(1, 'two')

    await expect(second).resolves.toBe('two')
    expect(job.started).toHaveLength(2)
  })
})
