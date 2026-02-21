import { useEffect, useCallback } from 'react'
import type React from 'react'

export interface ExtraShell {
  sessionId: string
  label: string
}

export type ShellCacheRef = React.RefObject<Map<string, { shells: ExtraShell[]; counter: number }>>

export function useSyncCacheOnAgentChange(
  agentKey: string,
  cacheRef: ShellCacheRef,
  setExtraShells: React.Dispatch<React.SetStateAction<ExtraShell[]>>
): void {
  useEffect(() => {
    const entry = cacheRef.current.get(agentKey)
    setExtraShells(entry?.shells ?? [])
  }, [agentKey, cacheRef, setExtraShells])
}

export function useKeepCacheInSync(
  extraShells: ExtraShell[],
  agentKey: string,
  cacheRef: ShellCacheRef
): void {
  useEffect(() => {
    const entry = cacheRef.current.get(agentKey)
    if (entry) entry.shells = extraShells
  }, [extraShells, agentKey, cacheRef])
}

export function usePersistTabs(
  persistKey: string,
  worktreeCwd: string | null
): (shells: ExtraShell[], counter: number) => void {
  return useCallback(
    (shells: ExtraShell[], counter: number) => {
      if (!worktreeCwd) return
      const tabs = shells.length === 0 ? [] : shells.map((s) => ({ label: s.label, cwd: worktreeCwd }))
      void window.electronAPI.invoke('shell-tabs:set', persistKey, { tabs, counter })
    },
    [persistKey, worktreeCwd]
  )
}

export function useRestoreTabsFromDisk(
  worktreeCwd: string | null,
  persistKey: string,
  agentKey: string,
  cacheRef: ShellCacheRef,
  restoredRef: React.RefObject<Set<string>>,
  setExtraShells: React.Dispatch<React.SetStateAction<ExtraShell[]>>
): void {
  useEffect(() => {
    if (!worktreeCwd || persistKey === '__none__') return
    if (restoredRef.current.has(persistKey)) return
    const entry = cacheRef.current.get(agentKey)
    if (entry && entry.shells.length > 0) return

    restoredRef.current.add(persistKey)

    void (async () => {
      const saved = (await window.electronAPI.invoke('shell-tabs:get', persistKey)) as {
        tabs: { label: string; cwd: string }[]
        counter: number
      } | null
      if (!saved || saved.tabs.length === 0) return

      const shells: ExtraShell[] = []
      for (const tab of saved.tabs) {
        try {
          const result = (await window.electronAPI.invoke('shell:create', tab.cwd)) as { sessionId: string }
          shells.push({ sessionId: result.sessionId, label: tab.label })
        } catch {
          // skip failed shell creation
        }
      }

      if (shells.length > 0) {
        const cacheEntry = cacheRef.current.get(agentKey) ?? { shells: [], counter: 3 }
        cacheEntry.shells = shells
        cacheEntry.counter = saved.counter
        cacheRef.current.set(agentKey, cacheEntry)
        setExtraShells(shells)
      }
    })()
  }, [agentKey, persistKey, worktreeCwd, cacheRef, restoredRef, setExtraShells])
}

export function usePersistOnChange(
  extraShells: ExtraShell[],
  agentKey: string,
  persistKey: string,
  restoredRef: React.RefObject<Set<string>>,
  cacheRef: ShellCacheRef,
  persistTabs: (shells: ExtraShell[], counter: number) => void
): void {
  useEffect(() => {
    if (!restoredRef.current.has(persistKey)) return
    const entry = cacheRef.current.get(agentKey)
    if (!entry) return
    persistTabs(extraShells, entry.counter)
  }, [extraShells, agentKey, persistKey, restoredRef, cacheRef, persistTabs])
}

export function useCleanupOnUnmount(cacheRef: ShellCacheRef): void {
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      for (const entry of cache.values()) {
        for (const shell of entry.shells) {
          void window.electronAPI.invoke('shell:kill', shell.sessionId).catch(() => {})
        }
      }
      cache.clear()
    }
  }, [cacheRef])
}
