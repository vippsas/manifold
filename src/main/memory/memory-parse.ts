import type { MemoryObservation } from '../../shared/memory-types'
import type { CompressionResult } from './memory-compression-types'
import { VALID_CONCEPTS, VALID_OBSERVATION_TYPES } from './memory-classify'

// --- XML parsing helpers ---

export function extractXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  const match = regex.exec(xml)
  return match ? match[1].trim() : ''
}

export function extractXmlTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  const results: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    const val = match[1].trim()
    if (val) results.push(val)
  }
  return results
}

function parseXmlObservation(xml: string): CompressionResult['observations'][0] | null {
  const title = extractXmlTag(xml, 'title')
  if (!title) return null

  let type = extractXmlTag(xml, 'type') as MemoryObservation['type']
  if (!VALID_OBSERVATION_TYPES.has(type)) type = 'task_summary'

  const summary = extractXmlTag(xml, 'summary')
  const narrative = extractXmlTag(xml, 'narrative')
  const facts = extractXmlTags(xml, 'fact')
  const concepts = extractXmlTags(xml, 'concept').filter((c) => VALID_CONCEPTS.has(c))
  const filesTouched = extractXmlTags(xml, 'file')

  return { type, title, summary, narrative, facts, concepts, filesTouched }
}

function parseXmlResponse(raw: string): CompressionResult | null {
  // Check if response contains XML observation tags
  if (!/<observation>/.test(raw)) return null

  try {
    const summaryBlock = extractXmlTag(raw, 'summary')

    const summary = {
      taskDescription: extractXmlTag(summaryBlock, 'taskDescription'),
      whatWasDone: extractXmlTag(summaryBlock, 'whatWasDone'),
      whatWasLearned: extractXmlTag(summaryBlock, 'whatWasLearned'),
      decisionsMade: extractXmlTags(summaryBlock, 'decision'),
      filesChanged: extractXmlTags(summaryBlock, 'file'),
    }

    // Extract each <observation>...</observation> block
    const obsRegex = /<observation>([\s\S]*?)<\/observation>/g
    const observations: CompressionResult['observations'] = []
    let match: RegExpExecArray | null
    while ((match = obsRegex.exec(raw)) !== null) {
      const obs = parseXmlObservation(match[1])
      if (obs) observations.push(obs)
    }

    if (observations.length === 0 && !summary.taskDescription && !summary.whatWasDone) {
      return null
    }

    return { summary, observations }
  } catch {
    return null
  }
}

function parseJsonResponse(raw: string): CompressionResult | null {
  try {
    let json = raw
    const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    if (fenceMatch) {
      json = fenceMatch[1]
    }
    const parsed = JSON.parse(json.trim())
    if (!parsed.summary || !Array.isArray(parsed.observations)) {
      return null
    }
    // Normalize JSON observations to include new fields
    const result = parsed as CompressionResult
    result.observations = result.observations.map((obs) => ({
      ...obs,
      narrative: obs.narrative ?? '',
      concepts: (obs.concepts ?? []).filter((c: string) => VALID_CONCEPTS.has(c)),
    }))
    return result
  } catch {
    return null
  }
}

/**
 * Three-tier parsing: XML → JSON → null
 */
export function parseCompressionResponse(raw: string): CompressionResult | null {
  const xmlResult = parseXmlResponse(raw)
  if (xmlResult) return xmlResult

  const jsonResult = parseJsonResponse(raw)
  if (jsonResult) return jsonResult

  return null
}
