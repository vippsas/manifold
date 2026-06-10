import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type {
  MemorySearchRequest,
  MemorySearchResponse,
  MemoryTimelineRequest,
  MemoryTimelineResponse,
  MemoryObservation,
  MemoryTimelineItem,
  MemoryStats,
  MemorySettings,
  ObservationType,
  SessionSummary,
} from '../../shared/memory-types'
import { parseObservationRow, parseSessionSummaryRow } from '../memory/memory-store'
import { isNoise, sanitizeMemoryText, truncate } from '../memory/memory-capture'
import { buildMemoryFtsQuery } from '../memory/store/memory-fts-query'

// Decode an opaque "<createdAt>:<id>" timeline cursor into its compound parts.
// Absent/malformed cursor => first page: a timestamp above any real row, with an
// id sentinel that never matches the equal-timestamp tiebreak branch.
function parseTimelineCursor(cursor?: string): { createdAt: number; id: string } {
  if (cursor) {
    const sep = cursor.indexOf(':')
    if (sep !== -1) {
      const createdAt = Number(cursor.slice(0, sep))
      if (Number.isFinite(createdAt)) {
        return { createdAt, id: cursor.slice(sep + 1) }
      }
    }
  }
  return { createdAt: Date.now() + 1, id: '' }
}

function getInteractionRoleLabel(role: string): string {
  return role === 'user'
    ? 'You'
    : role === 'system'
      ? 'System'
      : 'Agent'
}

function toObservationTimelineItem(observation: MemoryObservation): MemoryTimelineItem {
  return {
    ...observation,
    source: 'observation',
  }
}

function toSessionSummaryTimelineItem(summary: SessionSummary): MemoryTimelineItem {
  return {
    id: summary.id,
    projectId: summary.projectId,
    sessionId: summary.sessionId,
    source: 'session_summary',
    type: 'task_summary',
    title: summary.taskDescription || summary.branchName,
    summary: summary.whatWasDone || summary.whatWasLearned,
    runtimeId: summary.runtimeId,
    branchName: summary.branchName,
    whatWasLearned: summary.whatWasLearned,
    decisionsMade: summary.decisionsMade,
    filesChanged: summary.filesChanged,
    createdAt: summary.createdAt,
  }
}

function toInteractionTimelineItem(
  projectId: string,
  row: { id: number; sessionId: string; role: string; text: string; timestamp: number },
): MemoryTimelineItem | null {
  const cleanText = sanitizeMemoryText(row.text.trim())
  if (!cleanText || isNoise(cleanText)) {
    return null
  }

  return {
    id: `interaction-${row.id}`,
    projectId,
    sessionId: row.sessionId,
    source: 'interaction',
    type: 'task_summary',
    title: getInteractionRoleLabel(row.role),
    summary: truncate(cleanText, 400),
    role: row.role,
    createdAt: row.timestamp,
  }
}

export function registerMemoryHandlers(deps: IpcDependencies): void {
  const { memoryStore, settingsStore } = deps

  ipcMain.handle('memory:search', (_event, request: MemorySearchRequest): MemorySearchResponse => {
    const limit = request.limit ?? 20
    const ftsQuery = buildMemoryFtsQuery(request.query)

    const compressed = memoryStore.search(request.projectId, request.query, {
      type: request.type,
      concepts: request.concepts,
      runtimeId: request.runtimeId,
      limit,
    })

    const shouldIncludeInteractionMatches = (
      !request.runtimeId &&
      !(request.concepts && request.concepts.length > 0) &&
      (!request.type || request.type === 'task_summary')
    )

    if (shouldIncludeInteractionMatches && ftsQuery) {
      try {
        const db = memoryStore.getDb(request.projectId)
        const interactionRows = db.prepare(`
          SELECT i.id, i.sessionId, i.role, i.text, i.timestamp, s.runtimeId, s.branchName, s.worktreePath, rank
          FROM interactions_fts f
          JOIN interactions i ON i.id = f.rowid
          LEFT JOIN sessions s ON s.sessionId = i.sessionId
          WHERE interactions_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, limit) as Array<{
          id: number
          sessionId: string
          role: string
          text: string
          timestamp: number
          runtimeId: string | null
          branchName: string | null
          worktreePath: string | null
          rank: number
        }>

        const interactionResults = interactionRows
          .map((r) => {
            const cleanText = sanitizeMemoryText(r.text)
            if (!cleanText || isNoise(cleanText)) return null

            return {
              id: `interaction-${r.id}`,
              type: 'task_summary' as ObservationType,
              source: 'interaction' as const,
              title: getInteractionRoleLabel(r.role),
              summary: truncate(cleanText, 200),
              sessionId: r.sessionId,
              runtimeId: r.runtimeId ?? undefined,
              branchName: r.branchName ?? undefined,
              worktreePath: r.worktreePath ?? undefined,
              createdAt: r.timestamp,
              rank: r.rank,
            }
          })
          .filter((result): result is NonNullable<typeof result> => result !== null)

        // Merge and dedupe, compressed results first
        const allResults = [...compressed.results, ...interactionResults]
          .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
          .slice(0, limit)

        return { results: allResults, total: allResults.length }
      } catch {
        // FTS5 query might fail on special characters — fall back to compressed only
      }
    }

    return compressed
  })

  ipcMain.handle('memory:get', (_event, projectId: string, observationId: string): MemoryObservation | null => {
    return memoryStore.getObservationById(projectId, observationId)
  })

  ipcMain.handle('memory:timeline', (_event, request: MemoryTimelineRequest): MemoryTimelineResponse => {
    const db = memoryStore.getDb(request.projectId)
    const limit = request.limit ?? 20
    const { createdAt: cursorTime, id: cursorId } = parseTimelineCursor(request.cursor)

    // Compound (createdAt, id) bound so rows sharing a timestamp at the page
    // boundary are not skipped: a row passes when it is older, or equal-timestamp
    // but sorts after the cursor id in the merged "(createdAt DESC, id ASC)" order.
    let observationSql = `
      SELECT id, projectId, sessionId, type, title, summary, narrative, facts, concepts, filesTouched, createdAt
      FROM observations
      WHERE (createdAt < ? OR (createdAt = ? AND id > ?))
    `
    const observationParams: unknown[] = [cursorTime, cursorTime, cursorId]

    if (request.type) {
      observationSql += ' AND type = ?'
      observationParams.push(request.type)
    }

    if (request.concepts && request.concepts.length > 0) {
      const placeholders = request.concepts.map(() => '?').join(', ')
      observationSql += ` AND EXISTS (SELECT 1 FROM json_each(concepts) WHERE value IN (${placeholders}))`
      observationParams.push(...request.concepts)
    }

    observationSql += ' ORDER BY createdAt DESC, id ASC LIMIT ?'
    observationParams.push(limit + 1)

    const observationRows = db.prepare(observationSql).all(...observationParams) as Array<Record<string, unknown>>
    const observationItems = observationRows
      .map(parseObservationRow)
      .map(toObservationTimelineItem)

    const includeSummaryTimeline = (
      !(request.type && request.type !== 'task_summary') &&
      !(request.concepts && request.concepts.length > 0)
    )

    const summaryItems: MemoryTimelineItem[] =
      !includeSummaryTimeline
        ? []
        : (db.prepare(`
            SELECT *
            FROM session_summaries
            WHERE (createdAt < ? OR (createdAt = ? AND id > ?))
            ORDER BY createdAt DESC, id ASC
            LIMIT ?
          `).all(cursorTime, cursorTime, cursorId, limit + 1) as Array<Record<string, unknown>>)
          .map(parseSessionSummaryRow)
          .map(toSessionSummaryTimelineItem)

    const interactionItems: MemoryTimelineItem[] =
      !includeSummaryTimeline
        ? []
        : (db.prepare(`
            SELECT id, sessionId, role, text, timestamp
            FROM interactions
            WHERE (timestamp < ? OR (timestamp = ? AND ('interaction-' || id) > ?))
            ORDER BY timestamp DESC, id ASC
            LIMIT ?
          `).all(cursorTime, cursorTime, cursorId, (limit + 1) * 4) as Array<{
            id: number
            sessionId: string
            role: string
            text: string
            timestamp: number
          }>)
          .map((row) => toInteractionTimelineItem(request.projectId, row))
          .filter((item): item is MemoryTimelineItem => item !== null)

    const items = [...observationItems, ...summaryItems, ...interactionItems]
      .sort((a, b) => {
        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt
        return a.id.localeCompare(b.id)
      })

    const page = items.slice(0, limit)
    const hasMore = items.length > limit
    const last = page[page.length - 1]
    return {
      items: page,
      nextCursor: hasMore && last ? `${last.createdAt}:${last.id}` : null,
    }
  })

  ipcMain.handle('memory:stats', (_event, projectId: string): MemoryStats => {
    return memoryStore.getStats(projectId)
  })

  ipcMain.handle('memory:delete', (_event, projectId: string, observationId: string): void => {
    memoryStore.deleteObservation(projectId, observationId)
  })

  ipcMain.handle('memory:clear', (_event, projectId: string): void => {
    memoryStore.deleteProject(projectId)
  })

  ipcMain.handle('memory:settings', (_event, action: 'get' | 'set', partial?: Partial<MemorySettings>) => {
    if (action === 'set' && partial) {
      const current = settingsStore.getSettings()
      const updated = { ...current.memory, ...partial }
      settingsStore.updateSettings({ memory: updated as MemorySettings })
      return updated
    }
    return settingsStore.getSettings().memory
  })
}
