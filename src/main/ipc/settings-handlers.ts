import { ipcMain } from 'electron'
import { mkdirSync } from 'node:fs'
import { ManifoldSettings, SessionViewState } from '../../shared/types'
import { SavedShellState } from '../shell-tab-store'
import { listRuntimesWithStatus } from '../runtimes'
import type { IpcDependencies } from './types'

export function registerSettingsHandlers(deps: IpcDependencies): void {
  const { settingsStore } = deps

  ipcMain.handle('settings:get', () => {
    return settingsStore.getSettings()
  })

  ipcMain.handle('settings:update', (_event, partial: Partial<ManifoldSettings>) => {
    if (partial.storagePath) {
      mkdirSync(partial.storagePath, { recursive: true })
    }
    return settingsStore.updateSettings(partial)
  })
}

export function registerRuntimesHandler(): void {
  ipcMain.handle('runtimes:list', () => {
    return listRuntimesWithStatus()
  })
}

export function registerViewStateHandlers(deps: IpcDependencies): void {
  const { viewStateStore } = deps

  ipcMain.handle('view-state:get', (_event, sessionId: string) => {
    return viewStateStore.get(sessionId)
  })

  ipcMain.handle('view-state:set', (_event, sessionId: string, state: SessionViewState) => {
    viewStateStore.set(sessionId, state)
  })

  ipcMain.handle('view-state:delete', (_event, sessionId: string) => {
    viewStateStore.delete(sessionId)
  })
}

export function registerShellTabHandlers(deps: IpcDependencies): void {
  const { shellTabStore } = deps

  ipcMain.handle('shell-tabs:get', (_event, agentKey: string) => {
    return shellTabStore.get(agentKey)
  })

  ipcMain.handle('shell-tabs:set', (_event, agentKey: string, state: SavedShellState) => {
    shellTabStore.set(agentKey, state)
  })
}
