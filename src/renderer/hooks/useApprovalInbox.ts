import { useCallback, useEffect, useState } from 'react'
import type { ApprovalRequest, ApprovalResponse } from '../../shared/superagent-types'

export interface UseApprovalInboxResult {
  pending: ApprovalRequest[]
  respond: (requestId: string, decision: ApprovalResponse['decision']) => Promise<void>
}

export function useApprovalInbox(superagentId: string): UseApprovalInboxResult {
  const [pending, setPending] = useState<ApprovalRequest[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = (await window.electronAPI.invoke('superagent:list-pending-approvals', superagentId)) as ApprovalRequest[]
      if (!cancelled) setPending(list)
    })()
    return () => { cancelled = true }
  }, [superagentId])

  useEffect(() => {
    const off = window.electronAPI.on('superagent:approval-request', (req: ApprovalRequest) => {
      if (req.superagentId !== superagentId) return
      setPending((prev) => [...prev, req])
    })
    return off
  }, [superagentId])

  const respond = useCallback(async (requestId: string, decision: ApprovalResponse['decision']) => {
    await window.electronAPI.invoke('superagent:approval-response', { requestId, decision })
    setPending((prev) => prev.filter((r) => r.requestId !== requestId))
  }, [])

  return { pending, respond }
}
