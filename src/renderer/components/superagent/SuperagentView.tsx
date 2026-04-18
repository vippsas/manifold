import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { AgentSession, Project } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
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
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({ convertEol: true })
    term.open(hostRef.current)
    termRef.current = term
    const off = window.electronAPI.on('superagent:output', (msg: { superagentId: string; chunk: string }) => {
      if (msg.superagentId !== superagent.id) return
      term.write(msg.chunk)
    })
    return () => { off(); term.dispose() }
  }, [superagent.id])

  return (
    <div style={s.root}>
      <div style={s.pane}><div ref={hostRef} style={s.terminalHost} /></div>
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
