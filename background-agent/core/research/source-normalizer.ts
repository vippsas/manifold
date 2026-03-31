import type { BackgroundAgentSuggestionSource } from '../../schemas/background-agent-types'
import type { WebResearchSourceRecord } from '../../connectors/web/web-research-types'
import { getSourceTrust, isAllowedSource } from './source-policy'

export function normalizeResearchSources(sources: WebResearchSourceRecord[]): BackgroundAgentSuggestionSource[] {
  const normalized = sources.flatMap((source, index) => {
    const title = source.title.trim()
    const url = normalizeUrl(source.url)
    if (!title || !url || !isAllowedSource({ title, url, type: source.type })) {
      return []
    }

    return [{
      id: source.id ?? `source-${index + 1}-${slugify(title)}`,
      title,
      url,
      type: source.type,
      trust: getSourceTrust(source.type),
      publishedAt: normalizePublishedAt(source.publishedAt),
      note: normalizeNote(source.snippet),
    }]
  })

  const deduped = new Map<string, BackgroundAgentSuggestionSource>()
  for (const source of normalized) {
    if (!deduped.has(source.url)) {
      deduped.set(source.url, source)
    }
  }

  return [...deduped.values()]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) {
        url.searchParams.delete(key)
      }
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function normalizePublishedAt(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString().slice(0, 10)
}

function normalizeNote(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > 0 ? trimmed.slice(0, 280) : undefined
}
