import { useEffect, useState } from 'react'
import type { FileChange } from '../../shared/types'

const POLL_INTERVAL_MS = 3000

export function useSuperagentFleetChanges(
  superagentId: string | null | undefined,
): Record<string, FileChange[]> {
  const [changes, setChanges] = useState<Record<string, FileChange[]>>({})

  useEffect(() => {
    if (!superagentId) {
      setChanges({})
      return
    }

    let cancelled = false
    const poll = async (): Promise<void> => {
      try {
        const next = (await window.electronAPI.invoke(
          'files:fleet-changes',
          superagentId,
        )) as Record<string, FileChange[]>
        if (!cancelled) setChanges(next)
      } catch {
        if (!cancelled) setChanges({})
      }
    }

    void poll()
    const handle = setInterval(() => { void poll() }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [superagentId])

  return changes
}
