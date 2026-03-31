import { describe, expect, it } from 'vitest'
import type { WebResearchContext, WebResearchTopic } from '../../../background-agent/connectors/web/web-research-types'
import { buildResearchPrompt } from './background-agent-research-prompt'

describe('buildResearchPrompt', () => {
  it('keeps the research framing generic and includes project-specific details', () => {
    const topic: WebResearchTopic = {
      id: 'ecosystem-shifts',
      title: 'Ecosystem shifts',
      query: 'video editor release notes timeline editing export workflow',
      ring: 3,
      rationale: 'Find external stack or platform changes that should affect planning now.',
    }
    const context: WebResearchContext = {
      projectProfile: {
        projectId: 'project-1',
        projectName: 'Cutline Studio',
        projectPath: '/tmp/cutline-studio',
        summary: 'Collaborative video editing software for short-form creators.',
        productType: 'Video editing application',
        targetUser: 'Video editors and content creators',
        majorWorkflows: ['Timeline editing', 'Exporting vertical videos'],
        architectureShape: 'Desktop application with cloud sync',
        dependencyStack: ['ffmpeg', 'react', 'rust'],
        openQuestions: ['Which export and collaboration features matter most now?'],
        recentChanges: ['Added proxy media generation'],
        sourcePaths: ['README.md'],
        generatedAt: '2026-03-31T00:00:00.000Z',
      },
      runtimeContext: {
        runtimeId: 'codex',
        activeSessionId: null,
        worktreePath: '/tmp/cutline-studio',
        mode: 'non-interactive',
      },
    }

    const prompt = buildResearchPrompt(topic, context, 3, 2)

    expect(prompt).toContain('You are researching the web for source-backed ideas about the project described below.')
    expect(prompt).toContain('The project may be any kind of repository in any domain. Do not assume a specific product category, runtime, framework, or platform unless the project profile says so.')
    expect(prompt).toContain('Be selective and fast: do at most 3 search attempts and inspect at most 3 sources before deciding.')
    expect(prompt).toContain('Use at most 3 sources and at most 2 candidate suggestions.')
    expect(prompt).toContain('- Project: Cutline Studio')
    expect(prompt).toContain('- Major workflows: Timeline editing, Exporting vertical videos')
    expect(prompt).toContain('- Stack: ffmpeg, react, rust')
    expect(prompt).toContain('- Title: Ecosystem shifts')
    expect(prompt).toContain('- Query: video editor release notes timeline editing export workflow')
  })

  it('uses fallback placeholders when project profile fields are missing', () => {
    const topic: WebResearchTopic = {
      id: 'competitor-feature-patterns',
      title: 'Competitor feature patterns',
      query: 'developer tool feature patterns changelog',
      ring: 1,
      rationale: 'Find product ideas in direct competitors or the same product category.',
    }
    const context: WebResearchContext = {
      projectProfile: {
        projectId: 'project-1',
        projectName: 'LedgerLeaf',
        projectPath: '/tmp/ledgerleaf',
        summary: 'Accounting workspace for small businesses.',
        productType: null,
        targetUser: null,
        majorWorkflows: [],
        architectureShape: null,
        dependencyStack: [],
        openQuestions: [],
        recentChanges: [],
        sourcePaths: [],
        generatedAt: '2026-03-31T00:00:00.000Z',
      },
      runtimeContext: {
        runtimeId: 'codex',
        activeSessionId: null,
        worktreePath: '/tmp/ledgerleaf',
        mode: 'non-interactive',
      },
    }

    const prompt = buildResearchPrompt(topic, context, 4, 1)

    expect(prompt).toContain('- Product type: (unknown)')
    expect(prompt).toContain('- Target user: (unknown)')
    expect(prompt).toContain('- Major workflows: (none identified)')
    expect(prompt).toContain('- Architecture: (unknown)')
    expect(prompt).toContain('- Stack: (unknown)')
    expect(prompt).toContain('- Open questions: (none identified)')
    expect(prompt).toContain('- Recent changes: (none identified)')
  })
})
