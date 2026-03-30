import type { BackgroundAgentProjectProfile } from '../../schemas/background-agent-types'
import type { WebResearchTopic } from '../../connectors/web/web-research-types'

export function generateResearchTopics(profile: BackgroundAgentProjectProfile): WebResearchTopic[] {
  const projectAnchor = profile.productType ?? profile.projectName
  const workflowAnchor = profile.majorWorkflows[0] ?? profile.summary
  const architectureAnchor = profile.architectureShape ?? profile.dependencyStack.join(' ')
  return [
    {
      id: 'feature-and-workflow-patterns',
      title: 'Competitor and workflow patterns',
      query: `${projectAnchor} ${workflowAnchor} feature patterns developer tools`,
      ring: 1,
      rationale: 'Find product ideas and workflow patterns in adjacent tools.',
    },
    {
      id: 'architecture-patterns',
      title: 'Architecture and interaction patterns',
      query: `${architectureAnchor} architecture patterns developer tools`,
      ring: 3,
      rationale: 'Find structural patterns that may transfer well to this project.',
    },
  ].filter((topic) => topic.query.trim().length > 0)
}
