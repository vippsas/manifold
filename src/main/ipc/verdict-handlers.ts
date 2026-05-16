import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type { VerdictRecord, VerdictListRequest } from '../../shared/verdict-types'

export function registerVerdictHandlers(deps: IpcDependencies): void {
  ipcMain.handle('verdicts:list', (_event, request: VerdictListRequest): VerdictRecord[] => {
    return deps.verdictStore.listByProject(request.projectId, request.limit)
  })
  ipcMain.handle('verdicts:get', (_event, sessionId: string): VerdictRecord | null => {
    return deps.verdictStore.getBySessionId(sessionId)
  })
}
