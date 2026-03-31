import { describe, expect, it } from 'vitest'
import type {
  BackgroundAgentFeedbackEvent,
  BackgroundAgentProjectProfile,
  BackgroundAgentSuggestion,
} from '../../../background-agent/schemas/background-agent-types'
import { rankSuggestions } from '../../../background-agent/core/ranking/suggestion-ranker'

describe('rankSuggestions', () => {
  it('filters weak evidence and caps the feed to five suggestions', () => {
    const suggestions = [
      createSuggestion('invalid', {
        title: 'Weakly sourced idea',
        supportingSources: [createSource('official', 'https://example.com/docs')],
      }),
      ...Array.from({ length: 6 }, (_, index) => createSuggestion(`valid-${index}`, {
        title: `Idea ${index} for electron developer workflows`,
        impact: index < 2 ? 'high' : 'medium',
      })),
    ]

    const ranked = rankSuggestions(suggestions, {
      limit: 5,
      profile: createProfile(),
    })

    expect(ranked).toHaveLength(5)
    expect(ranked.some((suggestion) => suggestion.id === 'invalid')).toBe(false)
  })

  it('uses recorded feedback to rerank similar suggestions', () => {
    const suggestions = [
      createSuggestion('suggestion-a', {
        title: 'Improve dockview workspace ideas',
        summary: 'Improve dockview workspace ideas for Electron developers.',
        whyItMatters: 'The current dockview-based workflow is central to this project.',
        impact: 'high',
      }),
      createSuggestion('suggestion-b', {
        title: 'Add changelog-aware ecosystem watch',
        summary: 'Track Electron and runtime changelogs in the Ideas feed.',
        whyItMatters: 'This project depends on Electron and background-agent research quality.',
        impact: 'medium',
      }),
    ]

    const feedbackEvents: BackgroundAgentFeedbackEvent[] = [
      {
        suggestionId: 'suggestion-a',
        feedbackType: 'not_relevant',
        createdAt: '2026-03-31T07:00:00.000Z',
      },
      {
        suggestionId: 'suggestion-b',
        feedbackType: 'useful',
        createdAt: '2026-03-31T07:01:00.000Z',
      },
    ]

    const ranked = rankSuggestions(suggestions, {
      limit: 5,
      profile: createProfile(),
      feedbackEvents,
    })

    expect(ranked.map((suggestion) => suggestion.id)).toEqual([
      'suggestion-b',
      'suggestion-a',
    ])
  })
})

function createProfile(): BackgroundAgentProjectProfile {
  return {
    projectId: 'project-1',
    projectName: 'Manifold',
    projectPath: '/repo',
    summary: 'An Electron desktop app for agentic developer workflows.',
    productType: 'Developer tool',
    targetUser: 'Developers',
    majorWorkflows: ['Workspace orchestration', 'Ideas research'],
    architectureShape: 'Electron desktop app with separate main and renderer layers',
    dependencyStack: ['electron', 'react', 'dockview'],
    openQuestions: ['How should the Ideas tab surface timely ecosystem shifts?'],
    recentChanges: ['Recent work: Added the Ideas tab to the agent workspace'],
    sourcePaths: ['README.md'],
    generatedAt: '2026-03-31T07:00:00.000Z',
  }
}

function createSuggestion(
  id: string,
  overrides: Partial<BackgroundAgentSuggestion> = {},
): BackgroundAgentSuggestion {
  return {
    id,
    title: 'Default suggestion',
    category: 'feature_opportunity',
    summary: 'A source-backed suggestion for the current project.',
    whyItMatters: 'It matches the current Electron and React workflow.',
    whyNow: 'Recent changes make this timely.',
    supportingSources: [
      createSource('official', 'https://example.com/docs'),
      createSource('blog', 'https://engineering.example.com/post'),
    ],
    evidence: ['Electron teams are adopting this workflow.', 'The current project already uses dockview.'],
    confidence: 'high',
    novelty: 'medium',
    effort: 'medium',
    impact: 'medium',
    createdAt: '2026-03-31T07:00:00.000Z',
    ...overrides,
  }
}

function createSource(id: string, url: string): BackgroundAgentSuggestion['supportingSources'][number] {
  return {
    id,
    title: id === 'official' ? 'Official docs' : 'Engineering blog',
    url,
    type: id === 'official' ? 'official_docs' : 'engineering_blog',
    trust: id === 'official' ? 'high' : 'medium',
    publishedAt: '2026-03-20',
    note: 'A concrete source note.',
  }
}
