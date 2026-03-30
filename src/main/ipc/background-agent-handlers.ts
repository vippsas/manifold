import { ipcMain } from 'electron'
import type { BackgroundAgentFeedbackType } from '../../../background-agent/schemas/background-agent-types'
import type { IpcDependencies } from './types'

export function registerBackgroundAgentHandlers(deps: IpcDependencies): void {
  ipcMain.handle('background-agent:list-suggestions', (_event, projectId: string) => {
    return deps.backgroundAgentHost.listSuggestions(projectId)
  })

  ipcMain.handle('background-agent:refresh', async (_event, projectId: string, activeSessionId: string | null) => {
    return deps.backgroundAgentHost.refreshSuggestions(projectId, activeSessionId)
  })

  ipcMain.handle(
    'background-agent:feedback',
    (_event, projectId: string, suggestionId: string, feedbackType: BackgroundAgentFeedbackType) => {
      deps.backgroundAgentHost.recordFeedback(projectId, suggestionId, feedbackType)
    },
  )

  ipcMain.handle('background-agent:get-status', (_event, projectId: string) => {
    return deps.backgroundAgentHost.getStatus(projectId)
  })
}
