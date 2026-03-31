import type { BackgroundAgentProjectProfile } from '../../schemas/background-agent-types'
import type { WebResearchTopic } from '../../connectors/web/web-research-types'

export function generateResearchTopics(profile: BackgroundAgentProjectProfile): WebResearchTopic[] {
  const projectAnchor = compact(profile.productType ?? profile.projectName)
  const workflowAnchor = compact(profile.majorWorkflows[0] ?? profile.summary)
  const architectureAnchor = compact(profile.architectureShape ?? profile.dependencyStack.join(' '))
  const stackAnchor = compact(profile.dependencyStack.slice(0, 4).join(' '))
  const openQuestionAnchor = compact(profile.openQuestions[0] ?? profile.recentChanges[0] ?? profile.summary)

  return dedupeTopics([
    {
      id: 'competitor-feature-patterns',
      title: 'Competitor feature patterns',
      query: compact(`${projectAnchor} ${workflowAnchor} feature patterns changelog`),
      ring: 1,
      rationale: 'Find product ideas in direct competitors or the same product category.',
    },
    {
      id: 'workflow-transfer-patterns',
      title: 'Workflow transfer patterns',
      query: compact(`${workflowAnchor} workflow tools product patterns engineering teams`),
      ring: 2,
      rationale: 'Find tools solving the same workflow or user problem in a transferable way.',
    },
    {
      id: 'architecture-patterns',
      title: 'Architecture and interaction patterns',
      query: compact(`${architectureAnchor} ${stackAnchor} architecture patterns developer tools`),
      ring: 3,
      rationale: 'Find structural patterns that may transfer well to this project.',
    },
    {
      id: 'ecosystem-shifts',
      title: 'Ecosystem shifts',
      query: compact(`${stackAnchor || projectAnchor} release notes changelog ecosystem shifts ${openQuestionAnchor}`),
      ring: 3,
      rationale: 'Find external stack or platform changes that should affect planning now.',
    },
  ])
    .filter((topic) => topic.query.length > 0)
}

function dedupeTopics(topics: WebResearchTopic[]): WebResearchTopic[] {
  const seen = new Set<string>()
  const unique: WebResearchTopic[] = []

  for (const topic of topics) {
    const key = topic.query.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(topic)
  }

  return unique
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
