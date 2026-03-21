import { randomUUID } from 'node:crypto'
import type { MemoryStore } from './memory-store'
import type { SettingsStore } from '../store/settings-store'
import type { InternalSession } from '../session/session-types'
import type { MemoryInteraction, MemoryObservation, SessionSummary, ToolUseEvent } from '../../shared/memory-types'
import { listRuntimesWithStatus } from '../agent/runtimes'
import { runAiPrompt } from '../agent/ai-prompt'
import { buildCompressionPrompt } from './compression-prompts'
import { debugLog } from '../app/debug-log'
import { isNoise, sanitizeMemoryText } from './memory-capture'

const MIN_INTERACTIONS_FOR_COMPRESSION = 3
const INCREMENTAL_BATCH_SIZE = 5

const VALID_OBSERVATION_TYPES = new Set([
  'bugfix', 'feature', 'refactor', 'change', 'discovery',
  'decision', 'task_summary', 'architecture', 'pattern', 'error_resolution',
])

const VALID_CONCEPTS = new Set([
  'how-it-works', 'what-changed', 'problem-solution',
  'gotcha', 'pattern', 'trade-off', 'why-it-exists',
])

function detectObservationType(text: string): MemoryObservation['type'] {
  const lower = text.toLowerCase()
  if (/\b(error|bug|fix|crash|fail|exception|stack\s*trace|broken)\b/.test(lower)) return 'bugfix'
  if (/\b(add|implement|new|create|feature|introduce)\b/.test(lower)) return 'feature'
  if (/\b(refactor|extract|rename|cleanup|reorganize|restructure)\b/.test(lower)) return 'refactor'
  if (/\b(discover|learn|realize|understand|investigate|found out)\b/.test(lower)) return 'discovery'
  if (/\b(architect|design|structure|module|layer|system)\b/.test(lower)) return 'architecture'
  if (/\b(decide|choice|trade.?off|alternative|instead of|chose|option)\b/.test(lower)) return 'decision'
  if (/\b(convention|pattern|always|never|rule|best practice)\b/.test(lower)) return 'pattern'
  if (/\b(change|update|modify|edit|alter)\b/.test(lower)) return 'change'
  return 'task_summary'
}

function detectConcepts(text: string): string[] {
  const lower = text.toLowerCase()
  const concepts: string[] = []

  if (/\b(how|works|behavior|mechanism|flow|process)\b/.test(lower)) concepts.push('how-it-works')
  if (/\b(change|update|modify|add|remove|rename)\b/.test(lower)) concepts.push('what-changed')
  if (/\b(fix|bug|error|issue|problem|resolve|solution)\b/.test(lower)) concepts.push('problem-solution')
  if (/\b(gotcha|caveat|careful|watch out|pitfall|edge case|subtle)\b/.test(lower)) concepts.push('gotcha')
  if (/\b(pattern|convention|always|never|rule|practice)\b/.test(lower)) concepts.push('pattern')
  if (/\b(trade.?off|instead|versus|chose|alternative|pros|cons)\b/.test(lower)) concepts.push('trade-off')
  if (/\b(because|reason|why|rationale|purpose|designed to)\b/.test(lower)) concepts.push('why-it-exists')

  return concepts.slice(0, 3)
}

// Priority order for cheapest AI runtime
const COMPRESSION_RUNTIME_PRIORITY = ['claude', 'gemini', 'codex'] as const

interface CompressionResult {
  summary: {
    taskDescription: string
    whatWasDone: string
    whatWasLearned: string
    decisionsMade: string[]
    filesChanged: string[]
  }
  observations: Array<{
    type: MemoryObservation['type']
    title: string
    summary: string
    narrative?: string
    facts: string[]
    concepts?: string[]
    filesTouched: string[]
  }>
}

interface RegexFallbackContext {
  runtimeId?: string
  branchName?: string
  taskDescription?: string
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength
    ? text.slice(0, maxLength - 3) + '...'
    : text
}

function scoreInteractionForSummary(interaction: MemoryInteraction): number {
  let score = Math.min(interaction.text.length, 320)

  if (interaction.role === 'user') score += 200
  if (/[.?!]/.test(interaction.text)) score += 30
  if (/\b(fix|fixed|updated|added|implemented|resolved|root cause|patch|changed|commit|pull request|pr)\b/i.test(interaction.text)) {
    score += 80
  }
  if (/^\s*(>|sh:|npm|pnpm|yarn|vitest|tsc|jest|cargo|go test)\b/im.test(interaction.text)) {
    score -= 160
  }
  if (interaction.text.includes('\n')) score -= 20

  return score
}

// --- XML parsing helpers ---

function extractXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  const match = regex.exec(xml)
  return match ? match[1].trim() : ''
}

function extractXmlTags(xml: string, tag: string): string[] {
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

export class MemoryCompressor {
  private sessionToolEvents = new Map<string, ToolUseEvent[]>()

  constructor(
    private memoryStore: MemoryStore,
    private settingsStore: SettingsStore
  ) {}

  addToolEvents(sessionId: string, events: ToolUseEvent[]): void {
    const existing = this.sessionToolEvents.get(sessionId) ?? []
    existing.push(...events)
    this.sessionToolEvents.set(sessionId, existing)
  }

  getToolEvents(sessionId: string): ToolUseEvent[] {
    return this.sessionToolEvents.get(sessionId) ?? []
  }

  /**
   * Incremental compression — runs periodically during a live session.
   * Uses regex extraction (instant, no AI cost) on the latest batch of interactions
   * that haven't been compressed yet.
   */
  compressIncremental(projectId: string, sessionId: string, sinceTimestamp: number): number {
    const db = this.memoryStore.getDb(projectId)
    const interactions = db
      .prepare(
        'SELECT * FROM interactions WHERE sessionId = ? AND timestamp > ? ORDER BY timestamp ASC',
      )
      .all(sessionId, sinceTimestamp) as MemoryInteraction[]

    if (interactions.length < INCREMENTAL_BATCH_SIZE) {
      return sinceTimestamp
    }

    const result = this.buildRegexFallbackResult(interactions)
    for (const obs of result.observations) {
      this.memoryStore.insertObservation({
        id: randomUUID(),
        projectId,
        sessionId,
        type: obs.type,
        title: obs.title,
        summary: obs.summary,
        narrative: obs.narrative ?? '',
        facts: obs.facts || [],
        concepts: obs.concepts ?? [],
        filesTouched: obs.filesTouched || [],
        createdAt: Date.now(),
      })
    }
    debugLog(`[MemoryCompressor] Incremental compression for ${sessionId}: ${interactions.length} interactions → observation`)

    // Return the timestamp of the last processed interaction
    return interactions[interactions.length - 1].timestamp
  }

  async compressSession(session: InternalSession): Promise<void> {
    const interactions = this.memoryStore.getSessionInteractions(
      session.projectId,
      session.id
    )

    try {
      if (interactions.length < MIN_INTERACTIONS_FOR_COMPRESSION) {
        debugLog(`[MemoryCompressor] Skipping compression for ${session.id}: only ${interactions.length} interactions`)
        return
      }

      const runtime = await this.resolveCompressionRuntime()

      if (!runtime) {
        debugLog('[MemoryCompressor] No AI runtime available, using regex fallback')
        this.storeResults(session, this.buildRegexFallbackResult(interactions, session))
        return
      }

      const toolEvents = this.getToolEvents(session.id)
      const prompt = buildCompressionPrompt(interactions, {
        runtimeId: session.runtimeId,
        branchName: session.branchName,
        taskDescription: session.taskDescription,
      }, toolEvents.length > 0 ? toolEvents : undefined)

      const args = [...(runtime.aiModelArgs || []), '-p']
      const raw = await runAiPrompt({
        binary: runtime.binary,
        args,
        prompt,
        cwd: session.worktreePath,
        timeoutMs: 60_000,
      })

      if (!raw) {
        debugLog('[MemoryCompressor] AI returned empty response, using regex fallback')
        this.storeResults(session, this.buildRegexFallbackResult(interactions, session))
        return
      }

      const parsed = this.parseResponse(raw)
      if (!parsed) {
        debugLog('[MemoryCompressor] Failed to parse AI response, using regex fallback')
        this.storeResults(session, this.buildRegexFallbackResult(interactions, session))
        return
      }

      this.storeResults(session, parsed)
      debugLog(`[MemoryCompressor] Compressed session ${session.id}: ${parsed.observations.length} observations`)
    } catch (err) {
      debugLog(`[MemoryCompressor] Error compressing session ${session.id}: ${err}`)
      this.storeResults(session, this.buildRegexFallbackResult(interactions, session))
    } finally {
      this.memoryStore.endSession(session.projectId, session.id)
      this.sessionToolEvents.delete(session.id)
    }
  }

  private async resolveCompressionRuntime() {
    const runtimes = await listRuntimesWithStatus()

    for (const preferredId of COMPRESSION_RUNTIME_PRIORITY) {
      const rt = runtimes.find((r) => r.id === preferredId && r.installed && r.aiModelArgs)
      if (rt) return rt
    }

    return null
  }

  /**
   * Three-tier parsing: XML → JSON → regex fallback
   */
  parseResponse(raw: string): CompressionResult | null {
    // Tier 1: Try XML parsing
    const xmlResult = this.parseXmlResponse(raw)
    if (xmlResult) return xmlResult

    // Tier 2: Try JSON parsing
    const jsonResult = this.parseJsonResponse(raw)
    if (jsonResult) return jsonResult

    // Tier 3: No structured data could be parsed
    return null
  }

  private parseXmlResponse(raw: string): CompressionResult | null {
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

  private parseJsonResponse(raw: string): CompressionResult | null {
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

  private storeResults(session: InternalSession, result: CompressionResult): void {
    const now = Date.now()

    const summary: SessionSummary = {
      id: randomUUID(),
      projectId: session.projectId,
      sessionId: session.id,
      runtimeId: session.runtimeId,
      branchName: session.branchName,
      taskDescription: result.summary.taskDescription || session.taskDescription || '',
      whatWasDone: result.summary.whatWasDone,
      whatWasLearned: result.summary.whatWasLearned,
      decisionsMade: result.summary.decisionsMade || [],
      filesChanged: result.summary.filesChanged || [],
      createdAt: now,
    }
    this.memoryStore.insertSessionSummary(summary)

    for (const obs of result.observations) {
      const observation: MemoryObservation = {
        id: randomUUID(),
        projectId: session.projectId,
        sessionId: session.id,
        type: obs.type,
        title: obs.title,
        summary: obs.summary,
        narrative: obs.narrative ?? '',
        facts: obs.facts || [],
        concepts: obs.concepts ?? [],
        filesTouched: obs.filesTouched || [],
        createdAt: now,
      }
      this.memoryStore.insertObservation(observation)
    }
  }

  buildRegexFallbackResult(
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
}
