import { describe, it, expect } from 'vitest'

import { buildSimplePrompt, buildSimpleFollowUpPrompt } from './simple-prompts'

describe('simple prompts', () => {
  it('includes the app description in the initial prompt', () => {
    const prompt = buildSimplePrompt('A kanban app for freelancers')
    expect(prompt).toContain('The user wants:')
    expect(prompt).toContain('A kanban app for freelancers')
  })

  it('builds a follow-up prompt from recent chat history', () => {
    const prompt = buildSimpleFollowUpPrompt(
      [
        { role: 'user', text: 'Build a habit tracker' },
        { role: 'agent', text: 'Scaffolding the app now.' },
        { role: 'user', text: 'Add streak badges', options: ['Daily', 'Weekly'] },
      ],
      'Add streak badges',
    )

    expect(prompt).toContain('Conversation so far:')
    expect(prompt).toContain('User: Build a habit tracker')
    expect(prompt).toContain('Assistant: Scaffolding the app now.')
    expect(prompt).not.toContain('User: Add streak badges')
    expect(prompt).toContain('Latest user request:')
    expect(prompt).toContain('Add streak badges')
  })

  it('reuses template-specific instructions for follow-up prompts', () => {
    const prompt = buildSimpleFollowUpPrompt(
      [
        { role: 'user', text: 'Evaluate Lovable' },
        { role: 'agent', text: 'Outlining the research plan.' },
      ],
      'Compare it with Bolt and v0',
      'Tool Researcher',
      'This repository is a research workspace, not a React app.\n\n',
    )

    expect(prompt).toContain('This repository is a research workspace, not a React app.')
    expect(prompt).not.toContain('React 19 with TypeScript')
    expect(prompt).toContain('Assistant: Outlining the research plan.')
    expect(prompt).toContain('Compare it with Bolt and v0')
  })
})
