import { useApprovalInbox } from '../../hooks/useApprovalInbox'
import * as s from './ApprovalInbox.styles'

export function ApprovalInbox({ superagentId }: { superagentId: string }) {
  const { pending, respond } = useApprovalInbox(superagentId)
  if (pending.length === 0) {
    return <div style={s.root}><div style={s.empty}>No pending approvals.</div></div>
  }
  return (
    <div style={s.root}>
      {pending.map((req) => (
        <div key={req.requestId} style={s.row}>
          <span style={s.toolName}>{req.toolName}</span>
          <span style={s.args}>{JSON.stringify(req.args)}</span>
          <button style={s.approve} onClick={() => respond(req.requestId, 'approve')}>Approve</button>
          <button style={s.deny} onClick={() => respond(req.requestId, 'deny')}>Deny</button>
          <button style={s.approveAll} onClick={() => respond(req.requestId, 'approve-all')}>Approve all</button>
        </div>
      ))}
    </div>
  )
}
