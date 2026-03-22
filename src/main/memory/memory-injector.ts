import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MemoryStore } from './memory-store'
import type { SettingsStore } from '../store/settings-store'
import type { InternalSession } from '../session/session-types'
import type { MemoryObservation, SessionSummary } from '../../shared/memory-types'
import { debugLog } from '../app/debug-log'

const MARKER_START = '<!-- manifold:memory-context:start -->'
const MARKER_END = '<!-- manifold:memory-context:end -->'
const CONTEXT_FILE_NAME = 'MANIFOLD.md'

const DEFAULT_TOKEN_BUDGET = 2000
const CHARS_PER_TOKEN = 4

const TYPE_ICONS: Record<string, string> = {
  bugfix: 'fix',
  feature: 'feat',
  refactor: 'refactor',
  change: 'change',
  discovery: 'discovery',
  decision: 'decision',
  task_summary: 'summary',
  architecture: 'arch',
  pattern: 'pattern',
  error_resolution: 'fix',
}

function formatRelativeDate(ts: number): string {
  const diffMs = Date.now() - ts
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}

export class MemoryInjector {
  constructor(
    private memoryStore: MemoryStore,
    private settingsStore: SettingsStore
  ) {}

  async injectContext(session: InternalSession): Promise<void> {
    const settings = this.settingsStore.getSettings()
    if (!settings.memory?.injectionEnabled) {
      return
    }

    try {
      const summaries = this.memoryStore.getRecentSummaries(session.projectId, 5)

      let observations: MemoryObservation[] = []
      if (session.taskDescription) {
        const searchResult = this.memoryStore.searchObservations(
          session.projectId,
          session.taskDescription
        )
        // Fetch full observations to get narrative/concepts
        observations = searchResult.results
          .map((r) => this.memoryStore.getObservationById(session.projectId, r.id))
          .filter((o): o is MemoryObservation => o !== null)
      } else {
        observations = this.memoryStore.getRecentObservations(session.projectId, 10)
      }

      if (summaries.length === 0 && observations.length === 0) {
        debugLog(`[MemoryInjector] No memory context to inject for session ${session.id}`)
        return
      }

      const tokenBudget = settings.memory.injectionTokenBudget || DEFAULT_TOKEN_BUDGET
      const markdown = this.buildContextMarkdown(summaries, observations, tokenBudget)

      if (!markdown) return

      const contextPath = join(session.worktreePath, CONTEXT_FILE_NAME)

      let existing = ''
      try {
        existing = await readFile(contextPath, 'utf-8')
      } catch {
        // File doesn't exist yet
      }

      // Remove any previous injected section
      const cleaned = this.removeMarkerSection(existing)
      const newContent = cleaned
        ? `${cleaned.trimEnd()}\n\n${markdown}\n`
        : `${markdown}\n`

      await writeFile(contextPath, newContent, 'utf-8')
      debugLog(`[MemoryInjector] Injected memory context into ${contextPath}`)
    } catch (err) {
      debugLog(`[MemoryInjector] Error injecting context: ${err}`)
    }
  }

  buildContextMarkdown(
    summaries: SessionSummary[],
    observations: MemoryObservation[],
    tokenBudget: number
  ): string {
    const charBudget = tokenBudget * CHARS_PER_TOKEN
    const parts: string[] = []
    let usedChars = 0

    // Header
    const header = `${MARKER_START}\n## Manifold Memory Context`
    parts.push(header)
    usedChars += header.length

    // --- Summaries section (~50% budget) ---
    const summaryBudget = charBudget * 0.5
    if (summaries.length > 0) {
      const sectionHeader = '\n### Recent Sessions'
      usedChars += sectionHeader.length
      const summaryLines: string[] = [sectionHeader]

      for (const s of summaries) {
        const lines: string[] = []
        const titleLine = `\n#### ${s.taskDescription || 'Untitled session'} (${s.branchName}) — ${formatRelativeDate(s.createdAt)}`
        lines.push(titleLine)

        if (s.whatWasDone) lines.push(`- **Done:** ${s.whatWasDone}`)
        if (s.whatWasLearned) lines.push(`- **Learned:** ${s.whatWasLearned}`)
        if (s.decisionsMade.length > 0) lines.push(`- **Decisions:** ${s.decisionsMade.join('; ')}`)
        if (s.filesChanged.length > 0) lines.push(`- **Files:** ${s.filesChanged.join(', ')}`)

        const block = lines.join('\n')
        if (usedChars + block.length > summaryBudget + header.length) break
        summaryLines.push(block)
        usedChars += block.length
      }

      if (summaryLines.length > 1) {
        parts.push(summaryLines.join('\n'))
      }
    }

    // --- Observations section (~40% budget) ---
    const observationBudget = charBudget * 0.4
    if (observations.length > 0 && usedChars < charBudget) {
      const sectionHeader = '\n### Key Observations'
      usedChars += sectionHeader.length
      const obsLines: string[] = [sectionHeader]

      for (let i = 0; i < observations.length; i++) {
        const o = observations[i]
        const lines: string[] = []
        const icon = TYPE_ICONS[o.type] || o.type
        lines.push(`\n#### ${o.title} (${icon}) — ${formatRelativeDate(o.createdAt)}`)
        lines.push(o.summary)

        // Include narrative for the most recent 2 observations if within budget
        if (i < 2 && o.narrative) {
          lines.push(o.narrative)
        }

        if (o.concepts && o.concepts.length > 0) {
          lines.push(`- **Concepts:** ${o.concepts.join(', ')}`)
        }
        if (o.filesTouched.length > 0) {
          lines.push(`- **Files:** ${o.filesTouched.join(', ')}`)
        }

        const block = lines.join('\n')
        if (usedChars + block.length > header.length + charBudget * 0.9) break
        obsLines.push(block)
        usedChars += block.length
      }

      if (obsLines.length > 1) {
        parts.push(obsLines.join('\n'))
      }
    }

    // --- Key Learnings section (~10% budget) ---
    const learnings = summaries
      .map((s) => s.whatWasLearned)
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)

    if (learnings.length > 0 && usedChars < charBudget) {
      const sectionHeader = '\n### Key Learnings'
      usedChars += sectionHeader.length
      const learnLines: string[] = [sectionHeader]

      for (const l of learnings) {
        const line = `- ${l}`
        if (usedChars + line.length + 1 > charBudget) break
        learnLines.push(line)
        usedChars += line.length + 1
      }

      if (learnLines.length > 1) {
        parts.push(learnLines.join('\n'))
      }
    }

    // If we only have the header, no content was added
    if (parts.length <= 1) return ''

    parts.push(MARKER_END)
    return parts.join('\n')
  }

  async cleanupContextFile(worktreePath: string, _runtimeId: string): Promise<void> {
    const contextPath = join(worktreePath, CONTEXT_FILE_NAME)

    try {
      const existing = await readFile(contextPath, 'utf-8')
      const cleaned = this.removeMarkerSection(existing)

      if (cleaned !== existing) {
        await writeFile(contextPath, cleaned, 'utf-8')
        debugLog(`[MemoryInjector] Cleaned up memory context from ${contextPath}`)
      }
    } catch {
      // File doesn't exist, nothing to clean
    }
  }

  private removeMarkerSection(content: string): string {
    const startIdx = content.indexOf(MARKER_START)
    const endIdx = content.indexOf(MARKER_END)

    if (startIdx === -1 || endIdx === -1) return content

    const before = content.slice(0, startIdx)
    const after = content.slice(endIdx + MARKER_END.length)

    return (before + after).replace(/\n{3,}/g, '\n\n').trim()
  }
}
