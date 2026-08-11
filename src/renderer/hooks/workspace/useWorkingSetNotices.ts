import { useEffect, useState } from 'react'
import type { WorkingSetNotice } from '../../../shared/types'

export interface WorkingSetNoticeState {
  notices: WorkingSetNotice[]
  dismiss: (sessionId: string, dir: string) => void
}

/** Adding a folder to a workspace only reaches its running agents on a best
 *  effort — a busy agent, or a runtime that takes folders only at launch, has to
 *  be reported rather than left to look like it worked. Agents that took the
 *  folder cleanly say nothing; only outcomes the user must act on surface. */
export function useWorkingSetNotices(): WorkingSetNoticeState {
  const [notices, setNotices] = useState<WorkingSetNotice[]>([])

  useEffect(() => {
    return window.electronAPI.on('agent:working-set-notice', (payload: unknown) => {
      const notice = payload as WorkingSetNotice
      if (notice.delivery === 'live') return
      setNotices((prev) => [
        ...prev.filter((n) => !(n.sessionId === notice.sessionId && n.dir === notice.dir)),
        notice,
      ])
    })
  }, [])

  const dismiss = (sessionId: string, dir: string): void => {
    setNotices((prev) => prev.filter((n) => !(n.sessionId === sessionId && n.dir === dir)))
  }

  return { notices, dismiss }
}
