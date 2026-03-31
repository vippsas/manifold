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

  ipcMain.handle('background-agent:resume', async (_event, projectId: string, activeSessionId: string | null) => {
    return deps.backgroundAgentHost.resumeSuggestions(projectId, activeSessionId)
  })

  ipcMain.handle('background-agent:pause', (_event, projectId: string) => {
    return deps.backgroundAgentHost.pauseSuggestions(projectId)
  })

  ipcMain.handle('background-agent:stop', (_event, projectId: string) => {
    return deps.backgroundAgentHost.stopSuggestions(projectId)
  })

  ipcMain.handle(
    'background-agent:feedback',
    (_event, projectId: string, suggestionId: string, feedbackType: BackgroundAgentFeedbackType) => {
      return deps.backgroundAgentHost.recordFeedback(projectId, suggestionId, feedbackType)
    },
  )

  ipcMain.handle('background-agent:clear', (_event, projectId: string) => {
    return deps.backgroundAgentHost.clearSuggestions(projectId)
  })

  ipcMain.handle('background-agent:get-status', (_event, projectId: string) => {
    return deps.backgroundAgentHost.getStatus(projectId)
  })
}
