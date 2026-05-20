import { randomUUID } from 'node:crypto'
import type {
  ApprovalRequest,
  ApprovalResponse,
  ApprovalToolName,
} from '../../shared/superagent-types'

type Decision = 'approve' | 'deny'

export interface ApprovalBrokerDeps {
  emit: (request: ApprovalRequest) => void
  onAutoApprove?: (superagentId: string) => void
  onResolved?: (request: ApprovalRequest, decision: ApprovalResponse['decision']) => void
}

interface PendingEntry {
  request: ApprovalRequest
  resolve: (decision: Decision) => void
}

export class ApprovalBroker {
  private readonly pending = new Map<string, PendingEntry>()

  constructor(private readonly deps: ApprovalBrokerDeps) {}

  requestApproval(
    superagentId: string,
    toolName: ApprovalToolName,
    args: Record<string, unknown>,
  ): Promise<Decision> {
    const request: ApprovalRequest = {
      requestId: randomUUID(),
      superagentId,
      toolName,
      args,
      requestedAt: Date.now(),
    }
    const promise = new Promise<Decision>((resolve) => {
      this.pending.set(request.requestId, { request, resolve })
    })
    this.deps.emit(request)
    return promise
  }

  respond(response: ApprovalResponse): void {
    const entry = this.pending.get(response.requestId)
    if (!entry) return
    this.pending.delete(response.requestId)
    this.deps.onResolved?.(entry.request, response.decision)
    if (response.decision === 'approve-all') {
      this.deps.onAutoApprove?.(entry.request.superagentId)
      entry.resolve('approve')
    } else {
      entry.resolve(response.decision)
    }
  }

  listPending(superagentId: string): ApprovalRequest[] {
    return [...this.pending.values()]
      .filter((e) => e.request.superagentId === superagentId)
      .map((e) => e.request)
  }
}
