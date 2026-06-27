import { vi } from 'vitest'

export const mockInvoke = vi.fn()
export const mockOn = vi.fn(() => vi.fn())

export function installElectronApi(): void {
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

export function getSearchQueryCalls() {
  return mockInvoke.mock.calls.filter(([channel]) => channel === 'search:query')
}
