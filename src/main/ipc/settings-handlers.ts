import { BrowserWindow, ipcMain } from 'electron'
import { mkdirSync } from 'node:fs'
import { ManifoldSettings, SessionViewState } from '../../shared/types'
import { SavedShellState } from '../store/shell-tab-store'
import { listRuntimesWithStatus } from '../agent/runtimes'
import { listOllamaModels } from '../agent/ollama-models'
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
    const updated = settingsStore.updateSettings(partial)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('settings:changed', updated)
      }
    }
    return updated
  })
}

export function registerRuntimesHandler(): void {
  ipcMain.handle('runtimes:list', () => {
    return listRuntimesWithStatus()
  })
}

export function registerOllamaHandler(): void {
  ipcMain.handle('ollama:list-models', () => {
    return listOllamaModels()
  })
}

export function registerViewStateHandlers(deps: IpcDependencies): void {
  const { viewStateStore, dockLayoutStore } = deps

  ipcMain.handle('view-state:get', (_event, sessionId: string) => {
    return viewStateStore.get(sessionId)
  })

  ipcMain.handle('view-state:set', (_event, sessionId: string, state: SessionViewState) => {
    viewStateStore.set(sessionId, state)
  })

  ipcMain.handle('view-state:delete', (_event, sessionId: string) => {
    viewStateStore.delete(sessionId)
    dockLayoutStore.delete(sessionId)
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

export function registerDockLayoutHandlers(deps: IpcDependencies): void {
  const { dockLayoutStore } = deps

  ipcMain.handle('dock-layout:get', (_event, sessionId: string) => {
    return dockLayoutStore.get(sessionId)
  })

  ipcMain.handle('dock-layout:set', (_event, sessionId: string, layout: unknown) => {
    dockLayoutStore.set(sessionId, layout)
  })
}
