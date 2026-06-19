import React from 'react'
import type { DashboardCardDef } from './dashboard-cards'

/**
 * A single dashboard summary tile. Shows live headline numbers and drills into
 * the card's full plugin view on click. Calls the card's own `useSummary` hook,
 * so each card fetches independently — one card's failure never blocks the grid.
 */
const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', textAlign: 'left',
    width: '100%', minHeight: 132, padding: 'var(--space-lg)',
    background: 'var(--bg-chrome)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    cursor: 'pointer', transition: 'background 150ms ease, border-color 150ms ease',
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' },
  icon: { opacity: 0.7, fontSize: 'var(--type-ui)' },
  title: { fontSize: 'var(--type-ui)', fontWeight: 700, color: 'var(--text-primary)' },
  stats: { display: 'flex', gap: 'var(--space-xl)', marginTop: 'auto' },
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
  value: { fontSize: 'var(--type-heading)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 },
  label: { fontSize: 'var(--type-ui-caption)', color: 'var(--text-muted)' },
  placeholder: { fontSize: 'var(--type-ui-small)', color: 'var(--text-muted)' },
}

export function DashboardCard({ card, onOpen }: { card: DashboardCardDef; onOpen: () => void }): React.JSX.Element {
  const summary = card.useSummary()
  return (
    <button
      type="button"
      onClick={onOpen}
      style={styles.card}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--control-bg-hover)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-chrome)'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={styles.titleRow}>
        <span aria-hidden style={styles.icon}>{card.icon}</span>
        <span style={styles.title}>{card.title}</span>
      </div>
      {summary.loading && <span style={styles.placeholder}>Loading…</span>}
      {summary.error && <span style={styles.placeholder}>—</span>}
      {!summary.loading && !summary.error && (
        <div style={styles.stats}>
          {summary.stats.map((s) => (
            <span key={s.label} style={styles.stat}>
              <span style={styles.value}>{s.value}</span>
              <span style={styles.label}>{s.label}</span>
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
