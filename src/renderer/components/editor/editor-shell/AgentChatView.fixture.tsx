import React from 'react'
import type { ChatMessage } from '../../../../shared/simple-types'
import { AgentChatView } from './AgentChatView'

const messages: ChatMessage[] = [
  {
    id: 'goal',
    sessionId: 'viola-demo',
    role: 'user',
    text: 'Add request validation and cover the missing checkout edge cases.',
    timestamp: 1,
  },
  {
    id: 'plan',
    sessionId: 'viola-demo',
    role: 'agent',
    text: '## Proposed plan\n\nSplit the goal into two independent changes.\n\n1. **Request validation**\n   Add validation at the API boundary.\n\n   Done when:\n   - Invalid requests return the documented error\n\n2. **Checkout regression tests**\n   Cover the missing edge cases without changing the API work.\n\n   Done when:\n   - The focused checkout suite passes\n\nNo worker has started. Approve this plan or tell me what to change.',
    options: ['Start plan', 'Revise plan'],
    timestamp: 2,
  },
]

const baseStub = window.electronAPI
window.electronAPI = {
  ...baseStub,
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'simple:chat-messages') return Promise.resolve(messages)
    if (channel === 'simple:get-agent-status') return Promise.resolve('waiting')
    if (channel === 'simple:get-slash-commands') return Promise.resolve([])
    return baseStub.invoke(channel, ...args)
  },
}

export default <AgentChatView sessionId="viola-demo" runtimeId="viola" />
