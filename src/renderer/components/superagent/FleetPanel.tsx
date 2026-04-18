import type { AgentSession, Project } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import { ChildAgentCard } from './ChildAgentCard'
import * as s from './FleetPanel.styles'

export interface FleetPanelProps {
  superagent: Superagent
  childSessions: AgentSession[]
  projects: Project[]
  outputTails: Record<string, string>
}

export function FleetPanel({ superagent, childSessions, projects, outputTails }: FleetPanelProps) {
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id
  return (
    <div style={s.root}>
      <div style={s.header}>Fleet: {superagent.fleetProjectIds.map(projectName).join(' · ')}</div>
      {childSessions.length === 0 ? (
        <div style={s.empty}>No children yet.<br />The orchestrator will request to spawn agents as it plans.</div>
      ) : (
        childSessions.map((sess) => (
          <ChildAgentCard
            key={sess.id}
            session={sess}
            projectName={projectName(sess.projectId)}
            outputTail={outputTails[sess.id] ?? ''}
          />
        ))
      )}
    </div>
  )
}
