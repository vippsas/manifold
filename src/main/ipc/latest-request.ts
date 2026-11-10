/**
 * Wraps a slow read so that requests for the same key never overlap.
 *
 * At most one run is in flight per key. Requests that arrive while it is
 * running share a single follow-up run that starts once it finishes — started
 * after they asked, so its answer reflects whatever prompted them. However many
 * requests arrive, a key holds at most one running pass and one waiting.
 */
export function createLatestRequest<T>(run: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const running = new Map<string, Promise<void>>()
  const queued = new Map<string, Promise<T>>()

  const start = (key: string): Promise<T> => {
    const result = run(key)
    const settled = result.then(() => {}, () => {})
    running.set(key, settled)
    void settled.then(() => {
      if (running.get(key) === settled) running.delete(key)
    })
    return result
  }

  return (key) => {
    const current = running.get(key)
    if (!current) return start(key)

    let next = queued.get(key)
    if (!next) {
      next = current.then(() => {
        queued.delete(key)
        return start(key)
      })
      queued.set(key, next)
    }
    return next
  }
}
