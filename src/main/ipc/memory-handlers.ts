import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type {
  MemorySearchRequest,
  MemorySearchResponse,
  MemoryTimelineRequest,
  MemoryTimelineResponse,
  MemoryObservation,
  MemoryStats,
  MemorySettings,
  ObservationType,
} from '../../shared/memory-types'
import { parseObservationRow } from '../memory/memory-store'
import { isNoise } from '../memory/memory-capture'

export function registerMemoryHandlers(deps: IpcDependencies): void {
  const { memoryStore, settingsStore } = deps

  ipcMain.handle('memory:search', (_event, request: MemorySearchRequest): MemorySearchResponse => {
    const limit = request.limit ?? 20

    // Search compressed observations + summaries first
    const compressed = memoryStore.search(request.projectId, request.query, {
      type: request.type,
      runtimeId: request.runtimeId,
      limit,
    })

    // Also search raw interactions via FTS5 (always available, even before compression)
    if (!request.type) {
      try {
        const db = memoryStore.getDb(request.projectId)
        const interactionRows = db.prepare(`
          SELECT i.id, i.sessionId, i.role, i.text, i.timestamp, rank
          FROM interactions_fts f
          JOIN interactions i ON i.id = f.rowid
          WHERE interactions_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(request.query, limit) as Array<{
          id: number; sessionId: string; role: string; text: string; timestamp: number; rank: number
        }>

        const interactionResults = interactionRows.map((r) => ({
          id: `interaction-${r.id}`,
          type: 'task_summary' as ObservationType,
          title: `${r.role === 'user' ? 'You' : 'Agent'}: ${r.text.slice(0, 80)}${r.text.length > 80 ? '...' : ''}`,
          summary: r.text.slice(0, 200),
          sessionId: r.sessionId,
          createdAt: r.timestamp,
          rank: r.rank,
        }))

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
    const cursor = request.cursor ?? Date.now() + 1

    // Try observations first
    let sql = `
      SELECT id, projectId, sessionId, type, title, summary, facts, filesTouched, createdAt
      FROM observations
      WHERE createdAt < ?
    `
    const params: unknown[] = [cursor]

    if (request.type) {
      sql += ' AND type = ?'
      params.push(request.type)
    }

    sql += ' ORDER BY createdAt DESC LIMIT ?'
    params.push(limit + 1)

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>

    // If we have observations, return them
    if (rows.length > 0) {
      const hasMore = rows.length > limit
      const items = rows.slice(0, limit).map(parseObservationRow)
      return { items, nextCursor: hasMore ? items[items.length - 1].createdAt : null }
    }

    // No observations yet — show recent non-noise interactions
    if (!request.type) {
      const interactionRows = db.prepare(`
        SELECT id, sessionId, text, timestamp
        FROM interactions
        WHERE timestamp < ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(cursor, (limit + 1) * 3) as Array<{
        id: number; sessionId: string; text: string; timestamp: number
      }>

      const filtered = interactionRows
        .filter((row) => !isNoise(row.text.trim()))
        .slice(0, limit + 1)

      if (filtered.length > 0) {
        const hasMore = filtered.length > limit
        const items = filtered.slice(0, limit).map((row) => ({
          id: `interaction-${row.id}`,
          projectId: request.projectId,
          sessionId: row.sessionId,
          type: 'task_summary' as ObservationType,
          title: row.text.length > 120
            ? row.text.slice(0, 117) + '...'
            : row.text,
          summary: row.text.length > 300
            ? row.text.slice(0, 297) + '...'
            : row.text,
          facts: [] as string[],
          filesTouched: [] as string[],
          createdAt: row.timestamp,
        }))
        return { items, nextCursor: hasMore ? items[items.length - 1].createdAt : null }
      }
    }

    return { items: [], nextCursor: null }
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
