import React, { useEffect, useState } from 'react'
import { PluginViewPanel } from '../editor/plugins/PluginViewPanel'
import { CARDS } from './dashboard-cards'
import { DashboardCard } from './DashboardCard'

/**
 * The global "home layer" Dashboard surface. Covers the per-agent dock and shows a
 * grid of host-owned summary cards (Worktrees, …); selecting a card drills into its
 * full plugin webview by view id, with a back-to-grid control. Rendered inside
 * AppShell's DockStateContext provider so webviews inherit the active theme.
 */
const styles: Record<string, React.CSSProperties> = {
  wrapper: { position: 'absolute', inset: 0, zIndex: 6, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)',
    padding: '0 var(--space-md)', minHeight: 'var(--dialog-header-height)',
    background: 'var(--bg-chrome)', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  titleWrap: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', minWidth: 0 },
  title: { fontSize: 'var(--type-ui)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 },
  subtitle: { fontSize: 'var(--type-ui-caption)', color: 'var(--text-muted)', lineHeight: 1.3 },
  backBtn: {
    height: 'var(--control-height)', padding: '0 var(--space-sm)', background: 'transparent',
    border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'var(--type-ui-small)',
    display: 'flex', alignItems: 'center', gap: 'var(--space-xs)',
  },
  doneBtn: {
    height: 'var(--control-height)', padding: '0 var(--space-md)', background: 'var(--control-bg)',
    border: '1px solid var(--control-border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
    cursor: 'pointer', fontSize: 'var(--type-ui-small)', flexShrink: 0,
  },
  body: { flex: 1, minHeight: 0 },
  grid: {
    display: 'grid', gap: 'var(--space-lg)', padding: 'var(--space-lg)',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', alignContent: 'start', overflowY: 'auto', height: '100%',
  },
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

  return (
    <div data-testid="dashboard-home-view" style={styles.wrapper}>
      <div style={styles.header}>
        {activeCard ? (
          <button type="button" onClick={() => setView('grid')} aria-label="Back to Dashboard" style={styles.backBtn}>
            <span aria-hidden>←</span> Dashboard <span style={{ opacity: 0.5 }}>/ {activeCard.title}</span>
          </button>
        ) : (
          <div style={styles.titleWrap}>
            <span style={styles.title}>Dashboard</span>
            <span style={styles.subtitle}>Repo overviews and quality metrics across all your repositories</span>
          </div>
        )}
        <button type="button" onClick={onClose} aria-label="Close dashboard" style={styles.doneBtn}>
          Done <span style={{ opacity: 0.6 }}>Esc</span>
        </button>
      </div>
      <div style={styles.body}>
        {activeCard ? (
          <PluginViewPanel api={{ id: activeCard.fullViewId }} />
        ) : (
          <div style={styles.grid}>
            {CARDS.map((card) => (
              <DashboardCard key={card.id} card={card} onOpen={() => setView(card.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
