import type { WebResearchClient } from '../../../background-agent/connectors/web/web-research-client'
import type {
  WebResearchContext,
  WebResearchResult,
  WebResearchSourceRecord,
  WebResearchSuggestionHint,
  WebResearchTopic,
} from '../../../background-agent/connectors/web/web-research-types'
import { runBackgroundAgentPrompt } from './background-agent-runtime'
import type { BackgroundAgentHostDeps } from './background-agent-types'

interface RuntimeResearchClientOptions {
  maxSourcesPerTopic?: number
  maxSuggestionsPerTopic?: number
}

interface PromptResponseShape {
  topicSummary?: unknown
  findings?: unknown
  sources?: unknown
  candidateSuggestions?: unknown
}

export class RuntimeWebResearchClient implements WebResearchClient {
  private readonly maxSourcesPerTopic: number
  private readonly maxSuggestionsPerTopic: number

  constructor(
    private readonly deps: Pick<BackgroundAgentHostDeps, 'settingsStore' | 'projectRegistry' | 'sessionManager' | 'gitOps'>,
    options: RuntimeResearchClientOptions = {},
  ) {
    this.maxSourcesPerTopic = Math.max(1, options.maxSourcesPerTopic ?? 4)
    this.maxSuggestionsPerTopic = Math.max(1, options.maxSuggestionsPerTopic ?? 2)
  }

  async research(topics: WebResearchTopic[], context: WebResearchContext): Promise<WebResearchResult[]> {
    const results: WebResearchResult[] = []

    for (const topic of topics) {
      const prompt = buildResearchPrompt(topic, context, this.maxSourcesPerTopic, this.maxSuggestionsPerTopic)
      const output = await runBackgroundAgentPrompt(this.deps, {
        projectId: context.projectProfile.projectId,
        activeSessionId: context.runtimeContext.activeSessionId,
        prompt,
        timeoutMs: 90_000,
        mode: 'research',
      })

      const parsed = parseResearchOutput(output)
      results.push({
        topic,
        topicSummary: typeof parsed.topicSummary === 'string' ? parsed.topicSummary.trim() : '',
        findings: normalizeFindings(parsed.findings),
        sources: normalizeSources(parsed.sources).slice(0, this.maxSourcesPerTopic),
        candidateSuggestions: normalizeSuggestionHints(parsed.candidateSuggestions).slice(0, this.maxSuggestionsPerTopic),
      })
    }

    return results
  }
}

function buildResearchPrompt(
  topic: WebResearchTopic,
  context: WebResearchContext,
  maxSources: number,
  maxSuggestions: number,
): string {
  const profile = context.projectProfile
  const workflows = profile.majorWorkflows.length > 0 ? profile.majorWorkflows.join(', ') : '(none identified)'
  const stack = profile.dependencyStack.length > 0 ? profile.dependencyStack.join(', ') : '(unknown)'
  const openQuestions = profile.openQuestions.length > 0 ? profile.openQuestions.join('; ') : '(none identified)'

  return [
    'You are researching the web for a project-aware background agent inside Manifold.',
    'Use a strong research approach. Prefer official docs, changelogs, OSS repos, OSS issues/discussions, and strong engineering blogs.',
    'Forums and communities may be used only as supporting evidence, never as the only basis for a suggestion.',
    'If your runtime supports web search or browsing, use it. If it does not, return an empty result object with no invented sources.',
    'Return JSON only. Do not include markdown fences or commentary.',
    '',
    'JSON schema:',
    '{',
    '  "topicSummary": "short summary",',
    '  "findings": ["finding 1", "finding 2"],',
    '  "sources": [',
    '    {',
    '      "title": "source title",',
    '      "url": "https://...",',
    '      "type": "official_docs|changelog|oss_repo|oss_issue|oss_discussion|engineering_blog|forum|community|other",',
    '      "publishedAt": "YYYY-MM-DD or null",',
    '      "snippet": "short evidence snippet"',
    '    }',
    '  ],',
    '  "candidateSuggestions": [',
    '    {',
    '      "title": "suggestion title",',
    '      "category": "feature_opportunity|architecture_improvement|pattern_transfer|ecosystem_shift",',
    '      "summary": "short summary",',
    '      "whyItMatters": "why it matters for this project",',
    '      "whyNow": "why now or null",',
    '      "evidence": ["evidence 1", "evidence 2"],',
    '      "confidence": "low|medium|high",',
    '      "novelty": "low|medium|high",',
    '      "effort": "low|medium|high",',
    '      "impact": "low|medium|high"',
    '    }',
    '  ]',
    '}',
    '',
    `Use at most ${maxSources} sources and at most ${maxSuggestions} candidate suggestions.`,
    '',
    'Project profile:',
    `- Project: ${profile.projectName}`,
    `- Summary: ${profile.summary}`,
    `- Product type: ${profile.productType ?? '(unknown)'}`,
    `- Target user: ${profile.targetUser ?? '(unknown)'}`,
    `- Major workflows: ${workflows}`,
    `- Architecture: ${profile.architectureShape ?? '(unknown)'}`,
    `- Stack: ${stack}`,
    `- Open questions: ${openQuestions}`,
    '',
    'Research topic:',
    `- Ring: ${topic.ring}`,
    `- Title: ${topic.title}`,
    `- Query: ${topic.query}`,
    `- Rationale: ${topic.rationale}`,
    '',
    'Important rules:',
    '- Do not invent sources or URLs.',
    '- Only include a candidate suggestion if it is genuinely relevant to this project.',
    '- Prefer source-backed, concrete ideas over generic trend summaries.',
  ].join('\n')
}

function parseResearchOutput(output: string): PromptResponseShape {
  const trimmed = output.trim()
  if (!trimmed) return {}

  const direct = tryParseJson(trimmed)
  if (direct && typeof direct === 'object') {
    return direct as PromptResponseShape
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)
  if (fenceMatch) {
    const fenced = tryParseJson(fenceMatch[1])
    if (fenced && typeof fenced === 'object') {
      return fenced as PromptResponseShape
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = tryParseJson(trimmed.slice(firstBrace, lastBrace + 1))
    if (sliced && typeof sliced === 'object') {
      return sliced as PromptResponseShape
    }
  }

  return {}
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function normalizeFindings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeSources(value: unknown): WebResearchSourceRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    const type = typeof record.type === 'string' ? record.type : 'other'
    if (!title || !url) return []
    return [{
      title,
      url,
      type: type as WebResearchSourceRecord['type'],
      publishedAt: typeof record.publishedAt === 'string' && record.publishedAt.trim() ? record.publishedAt.trim() : null,
      snippet: typeof record.snippet === 'string' ? record.snippet.trim() : undefined,
    }]
  })
}

function normalizeSuggestionHints(value: unknown): WebResearchSuggestionHint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    const category = typeof record.category === 'string' ? record.category : ''
    const summary = typeof record.summary === 'string' ? record.summary.trim() : ''
    const whyItMatters = typeof record.whyItMatters === 'string' ? record.whyItMatters.trim() : ''
    if (!title || !summary || !whyItMatters) return []
    return [{
      title,
      category: normalizeLevelValue(category, 'category') as WebResearchSuggestionHint['category'],
      summary,
      whyItMatters,
      whyNow: typeof record.whyNow === 'string' && record.whyNow.trim() ? record.whyNow.trim() : null,
      evidence: normalizeFindings(record.evidence),
      confidence: normalizeRating(record.confidence),
      novelty: normalizeRating(record.novelty),
      effort: normalizeRating(record.effort),
      impact: normalizeRating(record.impact),
    }]
  })
}

function normalizeRating(value: unknown): WebResearchSuggestionHint['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium'
}

function normalizeLevelValue(value: string, kind: 'category'): string {
  if (kind === 'category') {
    if (
      value === 'feature_opportunity' ||
      value === 'architecture_improvement' ||
      value === 'pattern_transfer' ||
      value === 'ecosystem_shift'
    ) {
      return value
    }
    return 'pattern_transfer'
  }

  return value
}
