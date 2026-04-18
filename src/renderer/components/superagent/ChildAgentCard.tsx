import type { AgentSession } from '../../../shared/types'
import * as s from './FleetPanel.styles'

export function ChildAgentCard({ session, outputTail, projectName }: { session: AgentSession; outputTail: string; projectName: string }) {
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <strong>{projectName}</strong>
        <span style={s.statusChip}>{session.status}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{session.branchName}</div>
      {outputTail && <pre style={s.outputTail}>{outputTail}</pre>}
    </div>
  )
}
