import React, { useEffect, useRef } from 'react'
import type { UiRequest } from '../../../shared/plugins/ui'

type ToastReq = Extract<UiRequest, { kind: 'message' }>

const AUTO_DISMISS_MS = 5000

const levelColors: Record<string, string> = {
  info: 'var(--text-secondary)',
  warning: 'var(--warning, #f59e0b)',
  error: 'var(--error, #ef4444)',
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'flex-end',
  },
  toast: {
    width: '320px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    animation: 'toast-slide-up 0.25s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px 0 12px',
  },
  levelIndicator: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
    marginRight: '6px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--text-primary)',
    textTransform: 'capitalize' as const,
  },
  dismissButton: {
    fontSize: '16px',
    lineHeight: 1,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0 4px',
    borderRadius: '4px',
    background: 'none',
    border: 'none',
  },
  body: {
    padding: '6px 12px 10px 12px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },
  footer: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    padding: '0 12px 10px 12px',
  },
  actionButton: {
    fontSize: '12px',
    fontWeight: 500,
    padding: '5px 14px',
    borderRadius: '4px',
    background: 'var(--control-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--control-border)',
    cursor: 'pointer',
  },
}

interface ToastItemProps {
  req: ToastReq
  respond: (requestId: string, value: unknown) => void
  dismissToast: (requestId: string) => void
}

function ToastItem({ req, respond, dismissToast }: ToastItemProps): React.JSX.Element {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (req.actions.length === 0) {
      timerRef.current = setTimeout(() => {
        dismissToast(req.requestId)
      }, AUTO_DISMISS_MS)
    }
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [req.requestId, req.actions.length, dismissToast])

  const levelColor = levelColors[req.level] ?? levelColors.info

  return (
    <div style={styles.toast} role="alert" aria-live="polite">
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <span style={{ ...styles.levelIndicator, background: levelColor }} />
          <span style={styles.title}>{req.level}</span>
        </div>
        <button
          type="button"
          onClick={() => dismissToast(req.requestId)}
          style={styles.dismissButton}
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
      <div style={styles.body}>{req.message}</div>
      {req.actions.length > 0 && (
        <div style={styles.footer}>
          {req.actions.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => respond(req.requestId, label)}
              style={styles.actionButton}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastReq[]
  respond: (requestId: string, value: unknown) => void
  dismissToast: (requestId: string) => void
}

export function ToastContainer({ toasts, respond, dismissToast }: ToastContainerProps): React.JSX.Element {
  return (
    <div style={styles.container}>
      {toasts.map((req) => (
        <ToastItem key={req.requestId} req={req} respond={respond} dismissToast={dismissToast} />
      ))}
    </div>
  )
}
