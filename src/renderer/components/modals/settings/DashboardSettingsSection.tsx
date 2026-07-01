import React, { useState } from 'react'
import { PluginViewPanel } from '../../editor/plugins/PluginViewPanel'
import { CARDS } from '../../home/dashboard-cards'
import { DashboardCard } from '../../home/DashboardCard'
import { SectionHeader } from './SettingsSectionLayout'

/**
 * Dashboard as a Settings section: the host-owned card grid, and drilling into a
 * card mounts its plugin webview inline with a back-to-grid header. Formerly the
 * full-screen `DashboardHomeView` overlay; it now lives in the Settings modal so
 * repo overviews and quality metrics sit alongside the app's other preferences.
 */
const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gap: 'var(--space-md)',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    alignContent: 'start',
  },
  drill: { display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', height: '100%', minHeight: 0 },
  back: {
    alignSelf: 'flex-start',
    display: 'flex', alignItems: 'center', gap: 'var(--space-xs)',
    height: 'var(--control-height)', padding: '0 var(--space-sm)',
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--type-ui-small)',
  },
  body: { flex: 1, minHeight: 360 },
}

export function DashboardSettingsSection({ initialCard }: { initialCard?: string | null }): React.JSX.Element {
  const [view, setView] = useState<string>(initialCard ?? 'grid')
  const activeCard = CARDS.find((c) => c.id === view) ?? null

  if (activeCard) {
    return (
      <div style={styles.drill}>
        <button type="button" onClick={() => setView('grid')} aria-label="Back to Dashboard" style={styles.back}>
          <span aria-hidden>←</span> Dashboard
        </button>
        <div style={styles.body}>
          <PluginViewPanel api={{ id: activeCard.fullViewId }} />
        </div>
      </div>
    )
  }

  return (
    <>
      <SectionHeader title="Dashboard" description="Repo overviews and quality metrics across all your repositories." />
      <div style={styles.grid}>
        {CARDS.map((card) => (
          <DashboardCard key={card.id} card={card} onOpen={() => setView(card.id)} />
        ))}
      </div>
    </>
  )
}
