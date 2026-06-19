import React, { useEffect, useState } from 'react'
import { PluginViewPanel } from '../editor/plugins/PluginViewPanel'
import { StarfieldBackdrop } from '../StarfieldBackdrop'
import { ManifoldWordmark } from '../ManifoldWordmark'
import { CARDS } from './dashboard-cards'
import { DashboardCard } from './DashboardCard'

/**
 * The global "home layer" Dashboard surface. The landing presents the host-owned
 * card grid as a lit stage (depth background + starfield + display title), mirroring
 * the new-agent overview rather than a chrome toolbar. Selecting a card drills into
 * its plugin webview by view id, with a back-to-grid header. Rendered inside AppShell's
 * DockStateContext provider so webviews inherit the active theme.
 */
const styles: Record<string, React.CSSProperties> = {
  // Drill-in — no chrome header bar; controls float on the canvas like the landing.
  drill: { position: 'absolute', inset: 0, zIndex: 6, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' },
  drillBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)',
    padding: 'var(--space-sm) var(--space-md)', background: 'transparent', flexShrink: 0,
  },
  backBtn: {
    height: 'var(--control-height)', padding: '0 var(--space-sm)', background: 'transparent',
    border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--type-ui-small)',
    display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', transition: 'color 150ms ease, background 150ms ease',
  },
  ghostDone: {
    height: 'var(--control-height)', padding: '0 var(--space-sm)', background: 'transparent',
    border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: 'var(--type-ui-small)', flexShrink: 0, transition: 'color 150ms ease, background 150ms ease',
  },
  body: { flex: 1, minHeight: 0 },

  // Landing stage — depth, not emptiness (mirrors OnboardingView's lit canvas).
  stage: {
    position: 'absolute', inset: 0, zIndex: 6, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    backgroundColor: 'var(--bg-primary)',
    backgroundImage: [
      'radial-gradient(ellipse 70% 55% at 50% 38%, color-mix(in srgb, var(--accent) 4%, transparent), transparent 70%)',
      'radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.25) 100%)',
    ].join(', '),
  },
  // A big "X" close, used both floating on the landing and in the drill-in bar.
  closeBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, padding: 0,
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
    cursor: 'pointer', fontSize: 24, lineHeight: 1, transition: 'color 150ms ease, background 150ms ease',
  },
  stageScroll: { position: 'relative', zIndex: 1, flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' },
  stageColumn: {
    maxWidth: 1120, width: '100%', margin: 'auto', boxSizing: 'border-box',
    padding: 'var(--space-xl) var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)',
  },
  stageTitleBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)', textAlign: 'center' },
  stageTitleText: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-xs)' },
  stageTitle: { fontFamily: 'var(--font-display)', fontSize: 'var(--type-display)', fontWeight: 400, color: 'var(--text-primary)', letterSpacing: 'var(--tracking-tight)' },
  stageSubtitle: { fontSize: 'var(--type-ui-small)', color: 'var(--text-muted)' },
  stageGrid: { display: 'grid', gap: 'var(--space-lg)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignContent: 'start', width: '100%' },
}

export function DashboardHomeView({ onClose, initialCard }: { onClose: () => void; initialCard?: string | null }): React.JSX.Element {
  const [view, setView] = useState<string>(initialCard ?? 'grid')
  const activeCard = CARDS.find((c) => c.id === view) ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (activeCard) setView('grid')
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeCard, onClose])

  if (activeCard) {
    return (
      <div data-testid="dashboard-home-view" style={styles.drill}>
        <div style={styles.drillBar}>
          <button
            type="button"
            onClick={() => setView('grid')}
            aria-label="Back to Dashboard"
            style={styles.backBtn}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--list-hover-bg)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
          >
            <span aria-hidden>←</span> Dashboard <span style={{ opacity: 0.6 }}>Esc</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dashboard"
            style={styles.closeBtn}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--list-hover-bg)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
          >
            <span aria-hidden>×</span>
          </button>
        </div>
        <div style={styles.body}>
          <PluginViewPanel api={{ id: activeCard.fullViewId }} />
        </div>
      </div>
    )
  }

  return (
    <div data-testid="dashboard-home-view" style={styles.stage}>
      <StarfieldBackdrop />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dashboard"
        style={{ ...styles.closeBtn, position: 'absolute', top: 'var(--space-md)', right: 'var(--space-md)', zIndex: 2 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--list-hover-bg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
      >
        <span aria-hidden>×</span>
      </button>
      <div style={styles.stageScroll}>
        <div style={styles.stageColumn}>
          <header style={styles.stageTitleBlock}>
            <ManifoldWordmark size="normal" />
            <div style={styles.stageTitleText}>
              <div style={styles.stageTitle}>Dashboard</div>
              <div style={styles.stageSubtitle}>Repo overviews and quality metrics across all your repositories</div>
            </div>
          </header>
          <div style={styles.stageGrid}>
            {CARDS.map((card) => (
              <DashboardCard key={card.id} card={card} onOpen={() => setView(card.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
