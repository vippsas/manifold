import React, { useState } from 'react'
import type { VercelHealth } from '../../shared/simple-types'
import * as styles from './DeployModal.styles'

interface Props {
  health: VercelHealth
  onComplete: () => void
  onCancel: () => void
}

type ModalStage = 'installing' | 'auth' | 'error'

export function DeployModal({ health, onComplete, onCancel }: Props): React.JSX.Element {
  const initialStage: ModalStage = health.cliInstalled ? 'auth' : 'installing'
  const [stage, setStage] = useState<ModalStage>(initialStage)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    if (stage !== 'installing') return
    let cancelled = false
    void (async () => {
      try {
        await window.electronAPI.invoke('simple:deploy-install-cli')
        if (cancelled) return
        setStage('auth')
      } catch {
        if (cancelled) return
        setError('Could not install Vercel CLI. You may need to install Node.js first.')
        setStage('error')
      }
    })()
    return () => { cancelled = true }
  }, [stage])

  const handleLogin = async (): Promise<void> => {
    try {
      await window.electronAPI.invoke('simple:deploy-login')
      onComplete()
    } catch {
      setError('Sign-in timed out or was cancelled. Please try again.')
      setStage('error')
    }
  }

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.logo}>
          <svg width="48" height="48" viewBox="0 0 76 65" fill="var(--text)">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/>
          </svg>
        </div>

        {stage === 'installing' && (
          <>
            <h3 style={styles.title}>Setting up Vercel</h3>
            <p style={styles.subtitle}>Installing the Vercel CLI so your app can go live...</p>
            <div style={styles.progressBox}>
              <div style={styles.spinner} />
              <span style={{ fontFamily: 'monospace', fontSize: 13, opacity: 0.7, color: 'var(--text)' }}>
                npm install -g vercel
              </span>
            </div>
            <p style={styles.hint}>This only needs to happen once</p>
          </>
        )}

        {stage === 'auth' && (
          <>
            <h3 style={styles.title}>Connect to Vercel</h3>
            <p style={styles.subtitle}>
              Sign in to deploy your app to the web.<br/>
              If you don&apos;t have an account, one will be created for you.
            </p>
            <button style={styles.githubButton} onClick={handleLogin}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#000">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>
            <p style={styles.hint}>Opens your browser to sign in securely</p>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button style={styles.cancelButton} onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}

        {stage === 'error' && (
          <>
            <h3 style={styles.title}>Setup Failed</h3>
            <p style={styles.errorText}>{error}</p>
            <button
              style={styles.githubButton}
              onClick={() => {
                setError(null)
                setStage(health.cliInstalled ? 'auth' : 'installing')
              }}
            >
              Try Again
            </button>
            <div style={{ marginTop: 12 }}>
              <button style={styles.cancelButton} onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
