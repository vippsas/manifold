import type React from 'react'

export const agentTabUsageStyles: Record<string, React.CSSProperties> = {
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  summary: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    lineHeight: 1.35,
  },
  // Model name takes the slack; the five figures are content-sized and right
  // aligned so digits line up column-wise and a big number is visible as big.
  table: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto auto auto auto',
    columnGap: '8px',
    rowGap: '2px',
    fontSize: 'var(--type-ui-micro)',
    lineHeight: 1.4,
  },
  head: {
    color: 'var(--text-muted)',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  headModel: {
    color: 'var(--text-muted)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  model: {
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // Tabular numerals stop the columns jittering between rows.
  num: {
    color: 'var(--text-secondary)',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  cost: {
    color: 'var(--text-primary)',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  // A rule separates the sums from the rows they sum, the way a ledger does.
  totalLabel: {
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    borderTop: '1px solid var(--divider)',
    paddingTop: '3px',
    marginTop: '1px',
  },
  totalNum: {
    color: 'var(--text-muted)',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    borderTop: '1px solid var(--divider)',
    paddingTop: '3px',
    marginTop: '1px',
  },
  totalCost: {
    color: 'var(--text-primary)',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    borderTop: '1px solid var(--divider)',
    paddingTop: '3px',
    marginTop: '1px',
  },
  note: {
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--text-muted)',
    lineHeight: 1.35,
  },
}
