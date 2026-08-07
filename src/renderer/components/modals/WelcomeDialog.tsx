import React, { useState, useCallback } from 'react'
import { ManifoldWordmark } from '../ManifoldWordmark'
import { StarfieldBackdrop } from '../StarfieldBackdrop'
import { onboardingLinkStyle } from './NewAgentForm.styles'

interface WelcomeDialogProps {
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onComplete: () => void
}

/**
 * First-run hero shown when `settings.setupCompleted` is false. It is the
 * entire app surface (rendered below the title bar, nothing behind it), so it
 * wears the same stage as the empty-state heroes — starfield, ghost wordmark,
 * display-serif title — rather than a boxed modal. Newcomers get a one-line
 * explanation of Manifold and two clearly-ranked ways into the workspace:
 * open a local folder (primary) or clone a remote repo (secondary).
 */
export function WelcomeDialog({ onAddProject, onCloneProject, onComplete }: WelcomeDialogProps): React.JSX.Element {
  const [showClone, setShowClone] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloning, setCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [cloneLinkHover, setCloneLinkHover] = useState(false)

  const handleOpenProject = useCallback((): void => {
    onAddProject()
    onComplete()
  }, [onAddProject, onComplete])

  const handleCloneSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const url = cloneUrl.trim()
      if (url && !cloning) {
        setCloning(true)
        setCloneError(null)
        try {
          const success = await onCloneProject(url)
          if (success) {
            onComplete()
          } else {
            setCloneError('Clone failed. Check the URL and that you have access to the repository, then try again.')
          }
        } finally {
          setCloning(false)
        }
      }
    },
    [cloneUrl, cloning, onCloneProject, onComplete]
  )

  const canClone = cloneUrl.trim().length > 0 && !cloning

  return (
    <section style={styles.hero} aria-label="Welcome to Manifold">
      <StarfieldBackdrop />
      <ManifoldWordmark size="large" />

      <div style={styles.copy}>
        <h1 style={styles.title}>
          Welcome to <span style={styles.titleEmphasis}>Manifold</span>
        </h1>
        <p style={styles.tagline}>
          Run multiple AI coding agents in parallel — each on its own task, in its own branch, at the same time.
        </p>
      </div>

      <div style={styles.actions}>
        <button onClick={handleOpenProject} className="btn-metal" style={styles.primaryButton}>
          Open a local project
        </button>
        <p style={styles.actionHint}>Point Manifold at a folder already on your machine.</p>

        <button
          onClick={() => setShowClone((p) => !p)}
          onMouseEnter={() => setCloneLinkHover(true)}
          onMouseLeave={() => setCloneLinkHover(false)}
          style={onboardingLinkStyle(cloneLinkHover)}
          aria-expanded={showClone}
        >
          Clone a repository
        </button>

        {showClone && (
          <div style={styles.cloneBlock}>
            <form onSubmit={(e) => void handleCloneSubmit(e)} style={styles.cloneRow}>
              <input
                type="text"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="git@github.com:user/repo.git"
                style={{ ...styles.cloneInput, opacity: cloning ? 0.6 : 1 }}
                autoFocus
                disabled={cloning}
              />
              <button
                type="submit"
                className="btn-metal"
                style={{ ...styles.cloneButton, opacity: canClone ? 1 : 0.5, cursor: canClone ? 'pointer' : 'default' }}
                disabled={!canClone}
                aria-busy={cloning || undefined}
              >
                {cloning && <span className="spinner" aria-hidden="true" />}
                {cloning ? 'Cloning…' : 'Clone'}
              </button>
            </form>
            <p style={styles.cloneHelp}>Use an SSH or HTTPS Git URL. You&apos;ll need access to the repository.</p>
            {cloneError && <div style={styles.cloneError}>{cloneError}</div>}
          </div>
        )}
      </div>

      <p style={styles.footer}>
        Each agent works in its own Git worktree, so your main branch stays untouched.
        You can add more projects anytime from the sidebar.
      </p>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  hero: {
    position: 'relative',
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-xl)',
    minHeight: 0,
    padding: 'var(--space-2xl)',
    color: 'var(--text-secondary)',
    userSelect: 'none',
    // Depth, not emptiness: a faint accent aura behind the content and a
    // vignette toward the edges so the canvas reads as a lit stage — the same
    // treatment as the new-agent and no-project heroes.
    background: [
      'radial-gradient(ellipse 70% 55% at 50% 42%, color-mix(in srgb, var(--accent) 4%, transparent), transparent 70%)',
      'radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.25) 100%)',
    ].join(', '),
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--type-display)',
    fontWeight: 400,
    color: 'var(--text-primary)',
    letterSpacing: 'var(--tracking-tight)',
    margin: 0,
    textAlign: 'center',
  },
  titleEmphasis: {
    fontStyle: 'italic',
    fontWeight: 500,
    color: 'var(--accent-hi, var(--text-primary))',
  },
  tagline: {
    fontSize: 'var(--type-ui)',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.6,
    textAlign: 'center',
    maxWidth: 420,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    width: 360,
    maxWidth: '90%',
  },
  primaryButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'var(--control-height)',
    padding: '0 32px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--type-ui)',
    cursor: 'pointer',
    border: 'none',
  },
  actionHint: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
    margin: 0,
    textAlign: 'center',
  },
  cloneBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
    width: '100%',
    marginTop: 'var(--space-xs)',
  },
  cloneRow: {
    display: 'flex',
    gap: 'var(--space-sm)',
  },
  cloneInput: {
    flex: 1,
    minWidth: 0,
    padding: '10px 14px',
    fontSize: 'var(--type-ui)',
    color: 'var(--text-primary)',
    background: 'var(--control-bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-md)',
    outline: 'none',
  },
  cloneButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 'var(--control-height)',
    padding: '0 20px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--type-ui)',
    border: 'none',
    flexShrink: 0,
  },
  cloneHelp: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
    margin: 0,
    textAlign: 'center',
  },
  cloneError: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--status-error)',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 'var(--space-xl)',
    left: '50%',
    transform: 'translateX(-50%)',
    margin: 0,
    fontSize: 'var(--type-ui-caption)',
    lineHeight: 1.6,
    color: 'var(--text-muted)',
    textAlign: 'center',
    maxWidth: 460,
  },
}
