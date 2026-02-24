import { useState, useEffect } from 'react'

interface UpdateState {
  status: 'idle' | 'available' | 'downloaded'
  version: string | null
  dismissed: boolean
}

export interface UseUpdateNotificationResult {
  updateReady: boolean
  version: string | null
  dismiss: () => void
  install: () => void
}

export function useUpdateNotification(): UseUpdateNotificationResult {
  const [state, setState] = useState<UpdateState>({ status: 'idle', version: null, dismissed: false })

  useEffect(() => {
    const unsub = window.electronAPI.on('updater:status', (payload: unknown) => {
      const { status, version } = payload as { status: string; version: string }
      if (status === 'available' || status === 'downloaded') {
        setState((prev) => ({ ...prev, status: status as 'available' | 'downloaded', version }))
      }
    })
    return unsub
  }, [])

  const dismiss = (): void => {
    setState((prev) => ({ ...prev, dismissed: true }))
  }

  const install = (): void => {
    void window.electronAPI.invoke('updater:install')
  }

  return {
    updateReady: state.status === 'downloaded' && !state.dismissed,
    version: state.version,
    dismiss,
    install,
  }
}
