import { describe, expect, it } from 'vitest'
import { generateResearchTopics } from '../../../background-agent/core/research/research-topic-generator'

describe('generateResearchTopics', () => {
  it('includes all three similarity rings and an ecosystem topic', () => {
    const topics = generateResearchTopics({
      projectId: 'project-1',
      projectName: 'Manifold',
      projectPath: '/repo',
      summary: 'An Electron app for agentic developer workflows.',
      productType: 'Developer tool',
      targetUser: 'Developers',
      majorWorkflows: ['Ideas research', 'Workspace orchestration'],
      architectureShape: 'Electron desktop app with separate main and renderer layers',
      dependencyStack: ['electron', 'react', 'dockview'],
      openQuestions: ['How should the Ideas tab track ecosystem shifts?'],
      recentChanges: ['Recent work: Added the Ideas tab to the agent workspace'],
      sourcePaths: ['README.md'],
      generatedAt: '2026-03-31T07:00:00.000Z',
    })

    expect(topics).toHaveLength(4)
    expect(topics.map((topic) => topic.ring)).toEqual([1, 2, 3, 3])
    expect(topics.some((topic) => topic.id === 'workflow-transfer-patterns')).toBe(true)
    expect(topics.some((topic) => topic.id === 'ecosystem-shifts')).toBe(true)
  })
})
