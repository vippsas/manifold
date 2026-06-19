import React, { useState } from 'react'
import type { DashboardCardDef } from './dashboard-cards'

/**
 * A single dashboard summary tile: a tinted icon chip, the module's title + purpose,
 * and its live headline numbers. The whole card is the drill-in button; it lifts on
 * hover. Each card calls its own `useSummary` hook, so one card's failed fetch never
 * blocks the grid.
 */
const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', textAlign: 'left',
    width: '100%', minHeight: 184, padding: 'var(--space-lg)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-elevated)', cursor: 'pointer',
    transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
  },
  topRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-md)' },
  chip: {
    width: 38, height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--radius-md)', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: 18,
  },
  titleWrap: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  title: { fontSize: 'var(--type-title)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 },
  description: { fontSize: 'var(--type-ui-small)', color: 'var(--text-muted)', lineHeight: 1.35 },
  chevron: { fontSize: 'var(--type-title)', color: 'var(--text-muted)', flexShrink: 0, transition: 'color 200ms ease, transform 200ms ease' },
  stats: { display: 'flex', gap: 'var(--space-xl)', marginTop: 'auto', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--divider)' },
  stat: { display: 'flex', flexDirection: 'column', gap: 3 },
  value: { fontSize: 'var(--type-display)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 },
  label: { fontSize: 'var(--type-ui-caption)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  placeholder: { fontSize: 'var(--type-ui-small)', color: 'var(--text-muted)', marginTop: 'auto', paddingTop: 'var(--space-sm)' },
}

export function DashboardCard({ card, onOpen }: { card: DashboardCardDef; onOpen: () => void }): React.JSX.Element {
  const summary = card.useSummary()
  const [hover, setHover] = useState(false)

  const cardStyle: React.CSSProperties = hover
    ? { ...styles.card, transform: 'translateY(-2px)', boxShadow: 'var(--shadow-popover)', borderColor: 'var(--accent)' }
    : styles.card

  return (
    <button
      type="button"
      onClick={onOpen}
      style={cardStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div style={styles.topRow}>
        <span aria-hidden style={styles.chip}>{card.icon}</span>
        <span style={styles.titleWrap}>
          <span style={styles.title}>{card.title}</span>
          <span style={styles.description}>{card.description}</span>
        </span>
        <span aria-hidden style={{ ...styles.chevron, ...(hover ? { color: 'var(--accent)', transform: 'translateX(2px)' } : null) }}>→</span>
      </div>
      {summary.loading && <span style={styles.placeholder}>Loading…</span>}
      {summary.error && <span style={styles.placeholder}>Couldn’t load</span>}
      {!summary.loading && !summary.error && (
        <div style={styles.stats}>
          {summary.stats.map((stat) => (
            <span key={stat.label} style={styles.stat}>
              <span style={styles.value}>{stat.value}</span>
              <span style={styles.label}>{stat.label}</span>
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
