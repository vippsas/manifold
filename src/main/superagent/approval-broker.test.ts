import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApprovalBroker } from './approval-broker'
import type { ApprovalRequest } from '../../shared/superagent-types'

describe('ApprovalBroker', () => {
  let broker: ApprovalBroker
  let emitted: ApprovalRequest[]

  beforeEach(() => {
    emitted = []
    broker = new ApprovalBroker({ emit: (req) => emitted.push(req) })
  })

  it('emits a request when requestApproval is called', async () => {
    broker.requestApproval('s1', 'spawn_agent', { projectId: 'p1' })
    expect(emitted).toHaveLength(1)
    expect(emitted[0].superagentId).toBe('s1')
    expect(emitted[0].toolName).toBe('spawn_agent')
  })

  it('resolves with approve when response is approve', async () => {
    const promise = broker.requestApproval('s1', 'spawn_agent', {})
    const requestId = emitted[0].requestId
    broker.respond({ requestId, decision: 'approve' })
    await expect(promise).resolves.toBe('approve')
  })

  it('resolves with deny when response is deny', async () => {
    const promise = broker.requestApproval('s1', 'send_prompt', {})
    broker.respond({ requestId: emitted[0].requestId, decision: 'deny' })
    await expect(promise).resolves.toBe('deny')
  })

  it('treats approve-all as approve and sets session auto-approve flag', async () => {
    const onAutoApprove = vi.fn()
    broker = new ApprovalBroker({ emit: (r) => emitted.push(r), onAutoApprove })
    const promise = broker.requestApproval('s1', 'spawn_agent', {})
    broker.respond({ requestId: emitted[0].requestId, decision: 'approve-all' })
    await expect(promise).resolves.toBe('approve')
    expect(onAutoApprove).toHaveBeenCalledWith('s1')
  })

  it('ignores responses with unknown requestId', () => {
    expect(() =>
      broker.respond({ requestId: 'missing', decision: 'approve' }),
    ).not.toThrow()
  })

  it('lists pending requests for a superagent', () => {
    broker.requestApproval('s1', 'spawn_agent', {})
    broker.requestApproval('s2', 'send_prompt', {})
    broker.requestApproval('s1', 'stop_agent', {})
    expect(broker.listPending('s1')).toHaveLength(2)
    expect(broker.listPending('s2')).toHaveLength(1)
  })

  it('removes request from pending after response', () => {
    broker.requestApproval('s1', 'spawn_agent', {})
    broker.respond({ requestId: emitted[0].requestId, decision: 'approve' })
    expect(broker.listPending('s1')).toHaveLength(0)
  })
})
