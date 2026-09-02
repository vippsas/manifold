import { useSyncExternalStore } from 'react'
import type { ViolaRun } from '../../../shared/viola'

/**
 * Latest Viola run snapshot per session, fed by the main process.
 *
 * The subscription is module-level on purpose: a per-component listener would stop hearing
 * updates whenever the user switched tabs, so returning to a Viola tab mid-run would show a
 * frozen board several states out of date — the very "is it hung?" impression the board exists
 * to remove.
 */
const runs = new Map<string, ViolaRun>()
const listeners = new Set<() => void>()

function isRunEvent(payload: unknown): payload is { sessionId: string; run: ViolaRun } {
  if (typeof payload !== 'object' || payload === null) return false
  const event = payload as { sessionId?: unknown; run?: unknown }
  return typeof event.sessionId === 'string'
    && typeof event.run === 'object' && event.run !== null
    && Array.isArray((event.run as { tasks?: unknown }).tasks)
}

let attached = false

/** Attaches on first use rather than at import, so the module never assumes the preload bridge
 *  already exists. Once attached it is never torn down: that is what keeps snapshots arriving
 *  while no board is mounted. */
function attachBridge(): void {
  if (attached) return
  const on = window.electronAPI?.on
  if (typeof on !== 'function') return
  attached = true
  on('viola:run', (payload: unknown) => {
    if (!isRunEvent(payload)) return
    runs.set(payload.sessionId, payload.run)
    for (const listener of listeners) listener()
  })
}

export function getViolaRun(sessionId: string): ViolaRun | undefined {
  attachBridge()
  return runs.get(sessionId)
}

export function subscribeViolaRuns(listener: () => void): () => void {
  attachBridge()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Subscribes a component to one session's run. Returns undefined when there is nothing live. */
export function useViolaRun(sessionId: string | null): ViolaRun | undefined {
  return useSyncExternalStore(
    subscribeViolaRuns,
    () => (sessionId ? getViolaRun(sessionId) : undefined),
  )
}
