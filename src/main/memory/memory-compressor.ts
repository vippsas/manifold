import { randomUUID } from 'node:crypto'
import type { MemoryStore } from './memory-store'
import type { SettingsStore } from '../store/settings-store'
import type { InternalSession } from '../session/session-types'
import type { MemoryInteraction, MemoryObservation, SessionSummary } from '../../shared/memory-types'
import { listRuntimesWithStatus } from '../agent/runtimes'
import { runAiPrompt } from '../agent/ai-prompt'
import { buildCompressionPrompt } from './compression-prompts'
import { debugLog } from '../app/debug-log'

const MIN_INTERACTIONS_FOR_COMPRESSION = 3
const INCREMENTAL_BATCH_SIZE = 5

function detectObservationType(text: string): MemoryObservation['type'] {
  const lower = text.toLowerCase()
  if (/\b(error|bug|fix|crash|fail|exception|stack\s*trace|broken)\b/.test(lower)) return 'error_resolution'
  if (/\b(architect|design|structure|refactor|pattern|module|layer)\b/.test(lower)) return 'architecture'
  if (/\b(decide|choice|trade.?off|alternative|instead of|chose|option)\b/.test(lower)) return 'decision'
  if (/\b(convention|pattern|always|never|rule|best practice)\b/.test(lower)) return 'pattern'
  return 'task_summary'
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
    facts: string[]
    filesTouched: string[]
  }>
}

export class MemoryCompressor {
  constructor(
    private memoryStore: MemoryStore,
    private settingsStore: SettingsStore
  ) {}

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

    // Compress this batch using regex (instant, no AI needed)
    this.regexFallbackCompression(projectId, sessionId, interactions)
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
        this.regexFallbackCompression(session.projectId, session.id, interactions)
        return
      }

      const prompt = buildCompressionPrompt(interactions, {
        runtimeId: session.runtimeId,
        branchName: session.branchName,
        taskDescription: session.taskDescription,
      })

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
        this.regexFallbackCompression(session.projectId, session.id, interactions)
        return
      }

      const parsed = this.parseResponse(raw)
      if (!parsed) {
        debugLog('[MemoryCompressor] Failed to parse AI response, using regex fallback')
        this.regexFallbackCompression(session.projectId, session.id, interactions)
        return
      }

      this.storeResults(session, parsed)
      debugLog(`[MemoryCompressor] Compressed session ${session.id}: ${parsed.observations.length} observations`)
    } catch (err) {
      debugLog(`[MemoryCompressor] Error compressing session ${session.id}: ${err}`)
      this.regexFallbackCompression(session.projectId, session.id, interactions)
    } finally {
      this.memoryStore.endSession(session.projectId, session.id)
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

  private parseResponse(raw: string): CompressionResult | null {
    try {
      // Strip markdown fencing if present
      let json = raw
      const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
      if (fenceMatch) {
        json = fenceMatch[1]
      }
      const parsed = JSON.parse(json.trim())
      if (!parsed.summary || !Array.isArray(parsed.observations)) {
        return null
      }
      return parsed as CompressionResult
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
        facts: obs.facts || [],
        filesTouched: obs.filesTouched || [],
        createdAt: now,
      }
      this.memoryStore.insertObservation(observation)
    }
  }

  regexFallbackCompression(
    projectId: string,
    sessionId: string,
    interactions: MemoryInteraction[]
  ): void {
    if (interactions.length === 0) return

    // Title: first message (role-agnostic — PTY agents tag everything as 'agent')
    const firstMsg = interactions[0].text
    const title = firstMsg.length > 120
      ? firstMsg.slice(0, 117) + '...'
      : firstMsg

    // Summary: the longest message is typically the most substantive
    const sorted = [...interactions].sort((a, b) => b.text.length - a.text.length)
    const bestMsg = sorted[0].text
    const summary = bestMsg.length > 500
      ? bestMsg.slice(0, 497) + '...'
      : bestMsg

    // Extract file paths and function names as supplementary facts
    const allText = interactions.map((i) => i.text).join('\n')
    const filePathPattern = /(?:^|\s)((?:src|lib|app|test|tests|packages?)\/[\w./-]+\.\w+)/g
    const filePaths = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = filePathPattern.exec(allText)) !== null) {
      filePaths.add(match[1])
    }

    const funcPattern = /(?:function|async)\s+(\w+)|\.(\w+)\s*\(/g
    const funcNames = new Set<string>()
    while ((match = funcPattern.exec(allText)) !== null) {
      const name = match[1] || match[2]
      if (name && name.length > 2 && name !== 'function' && name !== 'async') {
        funcNames.add(name)
      }
    }

    // Additional messages as facts for searchability
    const facts: string[] = interactions.slice(1, 4).map((m) =>
      m.text.length > 150 ? m.text.slice(0, 147) + '...' : m.text,
    )
    if (filePaths.size > 0) {
      facts.push(`Files: ${[...filePaths].slice(0, 15).join(', ')}`)
    }
    if (funcNames.size > 0) {
      facts.push(`Functions: ${[...funcNames].slice(0, 10).join(', ')}`)
    }

    const type = detectObservationType(allText)

    const observation: MemoryObservation = {
      id: randomUUID(),
      projectId,
      sessionId,
      type,
      title,
      summary,
      facts: facts.slice(0, 10),
      filesTouched: [...filePaths].slice(0, 20),
      createdAt: Date.now(),
    }
    this.memoryStore.insertObservation(observation)
  }
}
