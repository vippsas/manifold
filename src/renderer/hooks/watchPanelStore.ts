import type { WatchFrameRef } from '../../shared/watch-types'

export interface WatchSessionState {
  frames: WatchFrameRef[]
  progressLog: string[]
  currentStage: string | null
}

const EMPTY_STATE: WatchSessionState = Object.freeze({
  frames: [],
  progressLog: [],
  currentStage: null,
}) as WatchSessionState

const stateMap = new Map<string, WatchSessionState>()
const listeners = new Map<string, Set<() => void>>()

let ipcInitialized = false
// The session that triggered the most recent install — used to route
// session-less `watch:install-progress` events back to a session's log.
let installLogTarget: string | null = null

interface ProgressEvent {
  sessionId?: string
  kind?: 'log' | 'stage'
  line?: string
  stage?: string
}

interface InstallProgressEvent {
  line?: string
}

function notify(sessionId: string): void {
  const set = listeners.get(sessionId)
  if (!set) return
  for (const fn of set) fn()
}

function update(sessionId: string, updater: (cur: WatchSessionState) => WatchSessionState): void {
  const cur = stateMap.get(sessionId) ?? EMPTY_STATE
  const next = updater(cur)
  stateMap.set(sessionId, next)
  notify(sessionId)
}

function ensureIpc(): void {
  if (ipcInitialized) return
  ipcInitialized = true
  window.electronAPI.on('watch:progress', (event: unknown) => {
    const ev = event as ProgressEvent
    if (!ev.sessionId) return
    if (ev.kind === 'log' && ev.line) {
      const line = ev.line
      update(ev.sessionId, (cur) => ({
        ...cur,
        progressLog: [...cur.progressLog, line].slice(-200),
      }))
    } else if (ev.kind === 'stage' && ev.stage) {
      const stage = ev.stage
      update(ev.sessionId, (cur) => ({ ...cur, currentStage: stage }))
    }
  })
  window.electronAPI.on('watch:install-progress', (event: unknown) => {
    const ev = event as InstallProgressEvent
    if (!ev.line || !installLogTarget) return
    const line = ev.line
    update(installLogTarget, (cur) => ({
      ...cur,
      progressLog: [...cur.progressLog, line].slice(-200),
    }))
  })
}

export const watchPanelStore = {
  init(): void {
    ensureIpc()
  },
  get(sessionId: string | null): WatchSessionState {
    if (!sessionId) return EMPTY_STATE
    return stateMap.get(sessionId) ?? EMPTY_STATE
  },
  subscribe(sessionId: string | null, listener: () => void): () => void {
    if (!sessionId) return () => undefined
    let set = listeners.get(sessionId)
    if (!set) {
      set = new Set()
      listeners.set(sessionId, set)
    }
    set.add(listener)
    return () => {
      const s = listeners.get(sessionId)
      if (!s) return
      s.delete(listener)
      if (s.size === 0) listeners.delete(sessionId)
    }
  },
  setFrames(sessionId: string, frames: WatchFrameRef[]): void {
    update(sessionId, (cur) => ({ ...cur, frames }))
  },
  setStage(sessionId: string, stage: string | null): void {
    update(sessionId, (cur) => ({ ...cur, currentStage: stage }))
  },
  clearProgressLog(sessionId: string): void {
    update(sessionId, (cur) => ({ ...cur, progressLog: [] }))
  },
  resetForRun(sessionId: string): void {
    update(sessionId, () => ({ frames: [], progressLog: [], currentStage: 'download' }))
  },
  setInstallLogTarget(sessionId: string | null): void {
    installLogTarget = sessionId
  },
  delete(sessionId: string): void {
    stateMap.delete(sessionId)
    listeners.delete(sessionId)
  },
}

export const __watchPanelStoreTestHooks = {
  reset(): void {
    stateMap.clear()
    listeners.clear()
    installLogTarget = null
    ipcInitialized = false
  },
}
