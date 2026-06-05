import { useEffect, useState, useCallback } from 'react'
import type { UiRequest } from '../../shared/plugins/ui'

type ToastReq = Extract<UiRequest, { kind: 'message' }>
type ModalReq = Extract<UiRequest, { kind: 'quickPick' | 'inputBox' }>

export function usePluginUiHost(): {
  toasts: ToastReq[]
  modal: ModalReq | null
  respond: (requestId: string, value: unknown) => void
  dismissToast: (requestId: string) => void
} {
  const [toasts, setToasts] = useState<ToastReq[]>([])
  const [queue, setQueue] = useState<ModalReq[]>([]) // pending modals (one shown at a time)

  const respond = useCallback((requestId: string, value: unknown): void => {
    void window.electronAPI.invoke('plugins:ui-response', requestId, value)
    setToasts((t) => t.filter((x) => x.requestId !== requestId))
    setQueue((q) => q.filter((x) => x.requestId !== requestId))
  }, [])

  const dismissToast = useCallback(
    (requestId: string): void => {
      respond(requestId, undefined)
    },
    [respond],
  )

  useEffect(() => {
    const off = window.electronAPI.on('plugins:ui-request', (...args: unknown[]) => {
      const req = args[0] as UiRequest
      if (req.kind === 'message') setToasts((t) => [...t, req])
      else setQueue((q) => [...q, req])
    })
    return () => {
      off()
    }
  }, [])

  return { toasts, modal: queue[0] ?? null, respond, dismissToast }
}
