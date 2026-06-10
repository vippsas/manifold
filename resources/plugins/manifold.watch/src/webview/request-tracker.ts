// resources/plugins/manifold.watch/src/webview/request-tracker.ts
// reqId correlation for webview→host request/response pairs. Each request kind
// gets its own tracker; replies settle the matching pending promise by reqId.
// Unknown or already-settled reqIds are no-ops (late replies after a reload).
export interface RequestTracker<T> {
  begin(): { reqId: number; promise: Promise<T> }
  resolve(reqId: number, value: T): void
  reject(reqId: number, error: Error): void
  readonly size: number
}

// Shared counter across all trackers so a reqId is unique panel-wide, never
// just per request kind — misrouted replies can't accidentally match.
let nextReqId = 1

export function createRequestTracker<T>(): RequestTracker<T> {
  const pending = new Map<number, { resolve: (v: T) => void; reject: (e: Error) => void }>()
  return {
    begin() {
      const reqId = nextReqId++
      const promise = new Promise<T>((resolve, reject) => {
        pending.set(reqId, { resolve, reject })
      })
      return { reqId, promise }
    },
    resolve(reqId, value) {
      const entry = pending.get(reqId)
      if (!entry) return
      pending.delete(reqId)
      entry.resolve(value)
    },
    reject(reqId, error) {
      const entry = pending.get(reqId)
      if (!entry) return
      pending.delete(reqId)
      entry.reject(error)
    },
    get size() {
      return pending.size
    },
  }
}
