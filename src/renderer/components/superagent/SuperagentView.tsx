import type { AgentSession, Project } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import { TerminalPane } from '../terminal/TerminalPane'
import { useDockState } from '../editor/dock-panel-types'
import { FleetPanel } from './FleetPanel'
import { ApprovalInbox } from './ApprovalInbox'
import * as s from './SuperagentView.styles'

export interface SuperagentViewProps {
  superagent: Superagent
  projects: Project[]
  childSessions: AgentSession[]
  childOutputTails: Record<string, string>
}

export function SuperagentView({ superagent, projects, childSessions, childOutputTails }: SuperagentViewProps) {
  const dock = useDockState()
  return (
    <div style={s.root}>
      <div style={s.pane}>
        <TerminalPane
          sessionId={superagent.id}
          scrollbackLines={dock.scrollbackLines}
          terminalFontFamily={dock.terminalFontFamily}
          xtermTheme={dock.xtermTheme}
          label="Superagent"
        />
      </div>
      <div style={s.pane}>
        <FleetPanel
          superagent={superagent}
          childSessions={childSessions}
          projects={projects}
          outputTails={childOutputTails}
        />
      </div>
      <div style={s.bottomStrip}>
        <ApprovalInbox superagentId={superagent.id} />
      </div>
    </div>
  )
}
