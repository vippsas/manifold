import type { BackgroundAgentProjectProfile } from '../../schemas/background-agent-types'
import type { WebResearchTopic } from '../../connectors/web/web-research-types'

export function generateResearchTopics(profile: BackgroundAgentProjectProfile): WebResearchTopic[] {
  const projectAnchor = profile.productType ?? profile.projectName
  const workflowAnchor = profile.majorWorkflows[0] ?? profile.summary
  const architectureAnchor = profile.architectureShape ?? profile.dependencyStack.join(' ')
  const ecosystemAnchor = profile.dependencyStack.slice(0, 3).join(' ')

  return [
    {
      id: 'ring-1-feature-opportunities',
      title: 'Direct competitor feature expectations',
      query: `${projectAnchor} direct competitor feature expectations`,
      ring: 1,
      rationale: 'Find adjacent feature ideas in the same product category.',
    },
    {
      id: 'ring-2-workflow-patterns',
      title: 'Same-workflow patterns',
      query: `${workflowAnchor} workflow patterns developer tools`,
      ring: 2,
      rationale: 'Find patterns from tools solving the same user workflow.',
    },
    {
      id: 'ring-3-architecture-patterns',
      title: 'Architecture and interaction patterns',
      query: `${architectureAnchor} architecture patterns`,
      ring: 3,
      rationale: 'Find structural patterns that may transfer well to this project.',
    },
    {
      id: 'ecosystem-shifts',
      title: 'Ecosystem changes',
      query: `${ecosystemAnchor} changelog ecosystem updates`,
      ring: 3,
      rationale: 'Watch the surrounding stack for shifts worth reacting to.',
    },
  ].filter((topic) => topic.query.trim().length > 0)
}
