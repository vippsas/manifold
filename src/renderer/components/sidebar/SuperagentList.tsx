import type { Superagent } from '../../../shared/superagent-types'

export function SuperagentList({
  superagents,
  activeSuperagentId,
  onSelect,
}: {
  superagents: Superagent[]
  activeSuperagentId: string | null
  onSelect: (id: string) => void
}) {
  if (superagents.length === 0) return null
  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Superagents
      </div>
      {superagents.map((s) => (
        <div
          key={s.id}
          onClick={() => onSelect(s.id)}
          style={{
            padding: '6px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            background: s.id === activeSuperagentId ? 'var(--color-surface-2)' : 'transparent',
          }}
        >
          <div style={{ fontSize: 13 }}>{s.name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {s.fleetProjectIds.length} repos · {s.status}
          </div>
        </div>
      ))}
    </div>
  )
}
