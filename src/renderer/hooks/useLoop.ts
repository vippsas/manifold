import { useCallback, useEffect, useState } from 'react'
import type { LoopConfig, LoopIteration, LoopStatus } from '../../shared/loop-types'

export interface UseLoopResult {
  status: LoopStatus | null
  iterations: LoopIteration[]
  config: LoopConfig | null
  start: (config: LoopConfig) => Promise<void>
  stop: () => Promise<void>
  saveConfig: (config: LoopConfig) => Promise<void>
  restoreBest: () => Promise<{ sha: string }>
  reload: () => Promise<void>
}

export function useLoop(sessionId: string | null): UseLoopResult {
  const [status, setStatus] = useState<LoopStatus | null>(null)
  const [iterations, setIterations] = useState<LoopIteration[]>([])
  const [config, setConfig] = useState<LoopConfig | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setStatus(null)
      setIterations([])
      setConfig(null)
      return
    }
    const [s, iters, c] = await Promise.all([
      window.electronAPI.invoke('loop:status', sessionId) as Promise<LoopStatus | null>,
      window.electronAPI.invoke('loop:iterations', sessionId) as Promise<LoopIteration[]>,
      window.electronAPI.invoke('loop:config', sessionId) as Promise<LoopConfig | null>,
    ])
    setStatus(s)
    setIterations(iters)
    setConfig(c)
  }, [sessionId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!sessionId) return
    const offStatus = window.electronAPI.on('loop:status-changed', (payload: unknown) => {
      const s = payload as LoopStatus
      if (s?.sessionId !== sessionId) return
      setStatus(s)
    })
    const offIter = window.electronAPI.on('loop:iteration', (payload: unknown) => {
      const iter = payload as LoopIteration
      setIterations((prev) => [...prev, iter])
    })
    return () => {
      offStatus()
      offIter()
    }
  }, [sessionId])

  const start = useCallback(async (cfg: LoopConfig): Promise<void> => {
    await window.electronAPI.invoke('loop:set-config', cfg.sessionId, cfg)
    setConfig(cfg)
    setIterations([])
    await window.electronAPI.invoke('loop:start', cfg)
  }, [])

  const stop = useCallback(async (): Promise<void> => {
    if (!sessionId) return
    await window.electronAPI.invoke('loop:stop', sessionId)
  }, [sessionId])

  const saveConfig = useCallback(async (cfg: LoopConfig): Promise<void> => {
    await window.electronAPI.invoke('loop:set-config', cfg.sessionId, cfg)
    setConfig(cfg)
  }, [])

  const restoreBest = useCallback(async (): Promise<{ sha: string }> => {
    if (!sessionId) throw new Error('No active session')
    return (await window.electronAPI.invoke('loop:restore-best', sessionId)) as { sha: string }
  }, [sessionId])

  return { status, iterations, config, start, stop, saveConfig, restoreBest, reload }
}
