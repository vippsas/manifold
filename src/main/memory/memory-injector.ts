import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MemoryStore } from './memory-store'
import type { SettingsStore } from '../store/settings-store'
import type { InternalSession } from '../session/session-types'
import type { MemorySearchResult, SessionSummary } from '../../shared/memory-types'
import { debugLog } from '../app/debug-log'

const MARKER_START = '<!-- manifold:memory-context:start -->'
const MARKER_END = '<!-- manifold:memory-context:end -->'

const DEFAULT_TOKEN_BUDGET = 2000
const CHARS_PER_TOKEN = 4

const CONTEXT_FILE_MAP: Record<string, string> = {
  claude: 'CLAUDE.md',
  'ollama-claude': 'CLAUDE.md',
  codex: 'AGENTS.md',
  'ollama-codex': 'AGENTS.md',
  gemini: 'GEMINI.md',
  copilot: 'AGENTS.md',
}

function getContextFileName(runtimeId: string): string {
  return CONTEXT_FILE_MAP[runtimeId] || 'AGENTS.md'
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
      const summaries = this.memoryStore.getRecentSummaries(session.projectId, 3)

      let observations: MemorySearchResult[] = []
      if (session.taskDescription) {
        const searchResult = this.memoryStore.searchObservations(
          session.projectId,
          session.taskDescription
        )
        observations = searchResult.results
      }

      if (summaries.length === 0 && observations.length === 0) {
        debugLog(`[MemoryInjector] No memory context to inject for session ${session.id}`)
        return
      }

      const tokenBudget = settings.memory.injectionTokenBudget || DEFAULT_TOKEN_BUDGET
      const markdown = this.buildContextMarkdown(summaries, observations, tokenBudget)

      if (!markdown) return

      const contextFile = getContextFileName(session.runtimeId)
      const contextPath = join(session.worktreePath, contextFile)

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
    observations: MemorySearchResult[],
    tokenBudget: number
  ): string {
    const charBudget = tokenBudget * CHARS_PER_TOKEN
    const parts: string[] = []
    let usedChars = 0

    // Header
    const header = `${MARKER_START}\n## Manifold Memory Context`
    parts.push(header)
    usedChars += header.length

    // Summaries section
    if (summaries.length > 0) {
      const sectionHeader = '### Recent Sessions'
      usedChars += sectionHeader.length + 1
      const summaryLines: string[] = [sectionHeader]

      for (const s of summaries) {
        const line = `- **${s.taskDescription || 'Untitled session'}** (${s.branchName}): ${s.whatWasDone}`
        if (usedChars + line.length + 1 > charBudget) break
        summaryLines.push(line)
        usedChars += line.length + 1
      }

      if (summaryLines.length > 1) {
        parts.push(summaryLines.join('\n'))
      }
    }

    // Observations section — fill remaining budget
    if (observations.length > 0 && usedChars < charBudget) {
      const sectionHeader = '### Key Observations'
      usedChars += sectionHeader.length + 1
      const obsLines: string[] = [sectionHeader]

      for (const o of observations) {
        const line = `- **${o.title}** (${o.type}): ${o.summary}`
        if (usedChars + line.length + 1 > charBudget) break
        obsLines.push(line)
        usedChars += line.length + 1
      }

      if (obsLines.length > 1) {
        parts.push(obsLines.join('\n'))
      }
    }

    // If we only have the header, no content was added
    if (parts.length <= 1) return ''

    parts.push(MARKER_END)
    return parts.join('\n')
  }

  async cleanupContextFile(worktreePath: string, runtimeId: string): Promise<void> {
    const contextFile = getContextFileName(runtimeId)
    const contextPath = join(worktreePath, contextFile)

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
