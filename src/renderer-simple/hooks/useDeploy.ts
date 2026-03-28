import { useState, useEffect, useCallback } from 'react'
import type { AppStatus, DeploymentStatus, VercelHealth } from '../../shared/simple-types'

interface DeployState {
  deployStatus: AppStatus | null
  liveUrl: string | null
  showSetupModal: boolean
  setupHealth: VercelHealth | null
  deploy: () => void
  dismissModal: () => void
  onSetupComplete: () => void
}

export function useDeploy(sessionId: string | null): DeployState {
  const [deployStatus, setDeployStatus] = useState<AppStatus | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [setupHealth, setSetupHealth] = useState<VercelHealth | null>(null)

  useEffect(() => {
    if (!sessionId) return
    const unsub = window.electronAPI.on('simple:deploy-status-update', (event: unknown) => {
      const e = event as DeploymentStatus
      if (e.sessionId === sessionId) {
        setDeployStatus(e.stage)
        if (e.url) {
          setLiveUrl(e.url)
        }
      }
    })
    return unsub
  }, [sessionId])

  const deploy = useCallback(async () => {
    if (!sessionId) return
    try {
      const result = (await window.electronAPI.invoke('simple:deploy', sessionId)) as {
        needsSetup: boolean
        health?: VercelHealth
      }
      if (result.needsSetup && result.health) {
        setSetupHealth(result.health)
        setShowSetupModal(true)
      } else {
        setDeployStatus('deploying')
      }
    } catch (err) {
      console.error('[useDeploy] deploy failed:', err)
      setDeployStatus('error')
    }
  }, [sessionId])

  const dismissModal = useCallback(() => {
    setShowSetupModal(false)
    setSetupHealth(null)
  }, [])

  const onSetupComplete = useCallback(() => {
    setShowSetupModal(false)
    setSetupHealth(null)
    void deploy()
  }, [deploy])

  return {
    deployStatus,
    liveUrl,
    showSetupModal,
    setupHealth,
    deploy,
    dismissModal,
    onSetupComplete,
  }
}
