import { randomUUID } from 'node:crypto'
import type { MemoryStore } from './memory-store'
import type { SettingsStore } from '../store/settings-store'
import type { InternalSession } from '../session/session-types'
import type { MemoryInteraction, MemoryObservation, SessionSummary, ToolUseEvent } from '../../shared/memory-types'
import { listRuntimesWithStatus } from '../agent/runtimes'
import { runAiPrompt } from '../agent/ai-prompt'
import { buildCompressionPrompt } from './compression-prompts'
import { debugLog } from '../app/debug-log'
import type { CompressionResult, RegexFallbackContext } from './memory-compression-types'
import { parseCompressionResponse } from './memory-parse'
import { buildRegexFallbackResult as computeRegexFallbackResult } from './memory-regex-fallback'

const MIN_INTERACTIONS_FOR_COMPRESSION = 3
const INCREMENTAL_BATCH_SIZE = 5

// Priority order for cheapest AI runtime
const COMPRESSION_RUNTIME_PRIORITY = ['claude', 'gemini', 'codex'] as const

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
    return parseCompressionResponse(raw)
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
    return computeRegexFallbackResult(interactions, context)
  }
}
