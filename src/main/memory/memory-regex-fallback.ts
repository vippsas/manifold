import type { MemoryInteraction } from '../../shared/memory-types'
import type { CompressionResult, RegexFallbackContext } from './memory-compression-types'
import { detectConcepts, detectObservationType, scoreInteractionForSummary } from './memory-classify'
import { isNoise, sanitizeMemoryText, truncate } from './memory-capture'

/**
 * Regex/heuristic compression used when no AI runtime is available or AI
 * output can't be parsed. Instant, no AI cost.
 */
export function buildRegexFallbackResult(
  interactions: MemoryInteraction[],
  context?: RegexFallbackContext,
): CompressionResult {
  const cleanedInteractions = interactions
    .map((interaction) => ({
      ...interaction,
      text: sanitizeMemoryText(interaction.text),
    }))
    .filter((interaction) => interaction.text && !isNoise(interaction.text))

  if (cleanedInteractions.length === 0) {
    const fallbackTitle = context?.taskDescription || 'Session summary'
    return {
      summary: {
        taskDescription: context?.taskDescription || fallbackTitle,
        whatWasDone: fallbackTitle,
        whatWasLearned: '',
        decisionsMade: [],
        filesChanged: [],
      },
      observations: [{
        type: 'task_summary',
        title: truncate(fallbackTitle, 120),
        summary: truncate(fallbackTitle, 500),
        narrative: '',
        facts: [],
        concepts: [],
        filesTouched: [],
      }],
    }
  }

  const titleSource = cleanedInteractions.find((interaction) => interaction.role === 'user')?.text
    || context?.taskDescription
    || cleanedInteractions[0].text
  const title = truncate(titleSource, 120)

  const bestSummaryInteraction = [...cleanedInteractions]
    .sort((a, b) => scoreInteractionForSummary(b) - scoreInteractionForSummary(a))[0]
  const summary = truncate(bestSummaryInteraction.text, 500)

  const whatWasDone = truncate(
    cleanedInteractions.find((interaction) =>
      interaction.role === 'agent'
      && /\b(fix|fixed|updated|added|implemented|resolved|running|created|committed|pushed)\b/i.test(interaction.text),
    )?.text || summary,
    500,
  )

  const whatWasLearned = truncate(
    cleanedInteractions.find((interaction) =>
      /\b(learned|found|discovered|root cause|turned out|cause)\b/i.test(interaction.text),
    )?.text || '',
    300,
  )

  const decisionsMade = cleanedInteractions
    .filter((interaction) => /\b(decide|decided|choice|trade.?off|instead|chose|option)\b/i.test(interaction.text))
    .map((interaction) => truncate(interaction.text, 150))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 5)

  const allText = cleanedInteractions.map((i) => i.text).join('\n')
  const filePathPattern = /(?:^|\s)((?:src|lib|app|test|tests|packages?)\/[\w./-]+\.\w+)/g
  const filePaths = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = filePathPattern.exec(allText)) !== null) {
    filePaths.add(match[1])
  }

  // Enrich file lists from tool events if available
  const toolEvents = interactions.flatMap((i) => i.toolEvents ?? [])
  for (const evt of toolEvents) {
    if (evt.toolName === 'Edit' || evt.toolName === 'Write') {
      filePaths.add(evt.inputSummary)
    }
  }

  const funcPattern = /(?:function|async)\s+(\w+)|\.(\w+)\s*\(/g
  const funcNames = new Set<string>()
  while ((match = funcPattern.exec(allText)) !== null) {
    const name = match[1] || match[2]
    if (name && name.length > 2 && name !== 'function' && name !== 'async') {
      funcNames.add(name)
    }
  }

  const facts: string[] = cleanedInteractions
    .filter((interaction) => interaction.text !== bestSummaryInteraction.text)
    .map((interaction) => truncate(interaction.text, 150))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 3)
  if (filePaths.size > 0) {
    facts.push(`Files: ${[...filePaths].slice(0, 15).join(', ')}`)
  }
  if (funcNames.size > 0) {
    facts.push(`Functions: ${[...funcNames].slice(0, 10).join(', ')}`)
  }

  const type = detectObservationType(allText)
  const concepts = detectConcepts(allText)

  // Generate narrative from the top-scored interaction
  const narrative = truncate(bestSummaryInteraction.text, 500)

  // Build filesChanged from Edit/Write tool events first, then regex-detected files
  const filesChanged = new Set<string>()
  for (const evt of toolEvents) {
    if (evt.toolName === 'Edit' || evt.toolName === 'Write') {
      filesChanged.add(evt.inputSummary)
    }
  }
  for (const fp of filePaths) {
    filesChanged.add(fp)
  }

  return {
    summary: {
      taskDescription: context?.taskDescription || title,
      whatWasDone,
      whatWasLearned,
      decisionsMade,
      filesChanged: [...filesChanged].slice(0, 20),
    },
    observations: [{
      type,
      title,
      summary,
      narrative,
      facts: facts.slice(0, 10),
      concepts,
      filesTouched: [...filePaths].slice(0, 20),
    }],
  }
}
