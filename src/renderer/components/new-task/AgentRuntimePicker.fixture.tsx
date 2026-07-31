// Gallery fixture for the runtime tiles — the states that depend on what is
// installed on the machine. `npm run screenshot:component AgentRuntimePicker`.
import React from 'react'
import type { AgentRuntime } from '../../../shared/types'
import { AgentRuntimePicker } from './AgentRuntimePicker'

const runtime = (id: string, name: string, installed: boolean): AgentRuntime =>
  ({ id, name, binary: id, installed })

const cases: { caption: string; value: string; runtimes: AgentRuntime[] }[] = [
  {
    caption: 'One runtime installed',
    value: 'claude',
    runtimes: [runtime('claude', 'Claude Code', true), runtime('codex', 'Codex', false)],
  },
  {
    caption: 'Two installed',
    value: 'codex',
    runtimes: [runtime('claude', 'Claude Code', true), runtime('codex', 'Codex', true)],
  },
  {
    caption: 'Four installed',
    value: 'claude',
    runtimes: [
      runtime('claude', 'Claude Code', true),
      runtime('codex', 'Codex', true),
      runtime('copilot', 'Copilot', true),
      runtime('gemini', 'Gemini CLI', true),
    ],
  },
  {
    caption: 'Selected runtime missing its binary',
    value: 'codex',
    runtimes: [runtime('claude', 'Claude Code', true), runtime('codex', 'Codex', false)],
  },
]

export default (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', padding: 'var(--space-lg)', width: 420 }}>
    {cases.map((c) => (
      <div key={c.caption} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
        <span style={{ fontSize: 'var(--type-ui-micro)', color: 'var(--text-muted)' }}>{c.caption}</span>
        <AgentRuntimePicker value={c.value} runtimes={c.runtimes} onChange={() => undefined} />
      </div>
    ))}
  </div>
)
