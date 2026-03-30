import type { BackgroundAgentSuggestionSource } from '../../schemas/background-agent-types'
import type { WebResearchSourceRecord } from '../../connectors/web/web-research-types'
import { getSourceTrust, isAllowedSourceType } from './source-policy'

export function normalizeResearchSources(sources: WebResearchSourceRecord[]): BackgroundAgentSuggestionSource[] {
  return sources
    .filter((source) => isAllowedSourceType(source.type))
    .map((source, index) => ({
      id: source.id ?? `source-${index + 1}-${slugify(source.title)}`,
      title: source.title,
      url: source.url,
      type: source.type,
      trust: getSourceTrust(source.type),
      publishedAt: source.publishedAt,
      note: source.snippet,
    }))
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
