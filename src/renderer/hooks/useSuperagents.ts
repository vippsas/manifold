import { useCallback, useEffect, useState } from 'react'
import type { Superagent, SuperagentCreateOptions } from '../../shared/superagent-types'

export interface UseSuperagentsResult {
  superagents: Superagent[]
  createSuperagent: (opts: SuperagentCreateOptions) => Promise<Superagent>
  killSuperagent: (id: string) => Promise<void>
  toggleAutoApprove: (id: string, value: boolean) => Promise<void>
}

export function useSuperagents(): UseSuperagentsResult {
  const [superagents, setSuperagents] = useState<Superagent[]>([])

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.invoke('superagent:list')
    setSuperagents(list as Superagent[])
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const off = window.electronAPI.on('superagent:list-changed', () => { void refresh() })
    return off
  }, [refresh])

  const createSuperagent = useCallback(async (opts: SuperagentCreateOptions) => {
    const s = (await window.electronAPI.invoke('superagent:create', opts)) as Superagent
    await refresh()
    return s
  }, [refresh])

  const killSuperagent = useCallback(async (id: string) => {
    await window.electronAPI.invoke('superagent:kill', id)
    await refresh()
  }, [refresh])

  const toggleAutoApprove = useCallback(async (id: string, value: boolean) => {
    await window.electronAPI.invoke('superagent:toggle-auto-approve', id, value)
    await refresh()
  }, [refresh])

  return { superagents, createSuperagent, killSuperagent, toggleAutoApprove }
}
