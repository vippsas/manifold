import type {
  BackgroundAgentProjectProfile,
  BackgroundAgentSuggestion,
} from '../../schemas/background-agent-types'
import type { WebResearchResult } from '../../connectors/web/web-research-types'
import { normalizeResearchSources } from '../research/source-normalizer'

export function synthesizeSuggestions(
  profile: BackgroundAgentProjectProfile,
  researchResults: WebResearchResult[],
): BackgroundAgentSuggestion[] {
  if (researchResults.length === 0) {
    return []
  }

  const suggestions: BackgroundAgentSuggestion[] = []

  for (const researchResult of researchResults) {
    const normalizedSources = normalizeResearchSources(researchResult.sources)
    for (const hint of researchResult.candidateSuggestions) {
      suggestions.push({
        id: buildSuggestionId(profile.projectId, researchResult.topic.id, hint.title),
        title: hint.title,
        category: hint.category,
        summary: hint.summary,
        whyItMatters: hint.whyItMatters,
        whyNow: hint.whyNow,
        supportingSources: normalizedSources,
        evidence: hint.evidence.length > 0 ? hint.evidence : researchResult.findings,
        confidence: hint.confidence,
        novelty: hint.novelty,
        effort: hint.effort,
        impact: hint.impact,
        createdAt: new Date().toISOString(),
      })
    }
  }

  return dedupeSuggestions(suggestions)
}

function buildSuggestionId(projectId: string, topicId: string, title: string): string {
  return `${projectId}:${topicId}:${slugify(title)}`
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function dedupeSuggestions(suggestions: BackgroundAgentSuggestion[]): BackgroundAgentSuggestion[] {
  const byKey = new Map<string, BackgroundAgentSuggestion>()

  for (const suggestion of suggestions) {
    const key = `${suggestion.category}:${suggestion.title.toLowerCase()}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, suggestion)
      continue
    }

    const mergedSources = mergeSources(existing.supportingSources, suggestion.supportingSources)
    const mergedEvidence = [...new Set([...existing.evidence, ...suggestion.evidence])].slice(0, 6)
    byKey.set(key, {
      ...existing,
      supportingSources: mergedSources,
      evidence: mergedEvidence,
      confidence: maxRating(existing.confidence, suggestion.confidence),
      novelty: maxRating(existing.novelty, suggestion.novelty),
      impact: maxRating(existing.impact, suggestion.impact),
      effort: minRating(existing.effort, suggestion.effort),
    })
  }

  return [...byKey.values()]
}

function mergeSources(
  left: BackgroundAgentSuggestion['supportingSources'],
  right: BackgroundAgentSuggestion['supportingSources'],
): BackgroundAgentSuggestion['supportingSources'] {
  const merged = new Map<string, BackgroundAgentSuggestion['supportingSources'][number]>()
  for (const source of [...left, ...right]) {
    if (!merged.has(source.url)) {
      merged.set(source.url, source)
    }
  }
  return [...merged.values()]
}

function maxRating(left: BackgroundAgentSuggestion['confidence'], right: BackgroundAgentSuggestion['confidence']) {
  return ratingScore(left) >= ratingScore(right) ? left : right
}

function minRating(left: BackgroundAgentSuggestion['effort'], right: BackgroundAgentSuggestion['effort']) {
  return ratingScore(left) <= ratingScore(right) ? left : right
}

function ratingScore(value: BackgroundAgentSuggestion['confidence']): number {
  switch (value) {
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}
