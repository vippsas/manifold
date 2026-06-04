// src/renderer/plugins/use-contributions.ts
import { useEffect, useState } from 'react'
import {
  getLauncherContributions,
  registerPanelContribution,
  subscribeContributions,
  type RegisteredPanel,
} from './contribution-registry'

/** On mount, fetch plugin-contributed views from main and register them.
 *  Phase 1a registers them WITHOUT a component (not yet openable — the webview
 *  panel arrives in Phase 1c). They appear in the "+ Apps" launcher. */
export function useLoadPluginContributions(): void {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const views = (await window.electronAPI.invoke('plugins:list-contributions')) as RegisteredPanel[]
      if (cancelled) return
      for (const v of views) registerPanelContribution(v)
    })()
    return () => { cancelled = true }
  }, [])
}

/** Live launcher contributions; re-renders when the registry changes. */
export function useLauncherContributions(): RegisteredPanel[] {
  const [items, setItems] = useState<RegisteredPanel[]>(() => getLauncherContributions())
  useEffect(() => subscribeContributions(() => setItems(getLauncherContributions())), [])
  return items
}
