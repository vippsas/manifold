import type {
  BackgroundAgentProjectProfile,
  BackgroundAgentSuggestion,
} from '../../schemas/background-agent-types'
import type { WebResearchResult } from '../../connectors/web/web-research-types'

export function synthesizeSuggestions(
  _profile: BackgroundAgentProjectProfile,
  researchResults: WebResearchResult[],
): BackgroundAgentSuggestion[] {
  if (researchResults.length === 0) {
    return []
  }

  return []
}
