import { app, ipcMain, shell } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { autoUpdater } from 'electron-updater'
import { registerProjectHandlers } from './ipc/project-handlers'
import { registerAgentHandlers } from './ipc/agent-handlers'
import { registerFileHandlers } from './ipc/file-handlers'
import { registerDiffHandler, registerPrHandler, registerGitHandlers } from './ipc/git-handlers'
import { registerSettingsHandlers, registerRuntimesHandler, registerViewStateHandlers, registerShellTabHandlers } from './ipc/settings-handlers'
export type { IpcDependencies } from './ipc/types'
import type { IpcDependencies } from './ipc/types'

export function registerIpcHandlers(deps: IpcDependencies): void {
  registerProjectHandlers(deps)
  registerAgentHandlers(deps)
  registerFileHandlers(deps)
  registerDiffHandler(deps)
  registerPrHandler(deps)
  registerSettingsHandlers(deps)
  registerRuntimesHandler()
  registerViewStateHandlers(deps)
  registerShellTabHandlers(deps)
  registerGitHandlers(deps)

  // Load a local font file as base64 so the renderer can create a web font
  // from it, bypassing macOS canvas PUA character rendering limitations.
  ipcMain.handle('font:load-data', (_event, fontFamily: string): string | null => {
    return loadFontFileAsBase64(fontFamily)
  })

  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:beep', () => {
    shell.beep()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('updater:check', () => {
    return autoUpdater.checkForUpdatesAndNotify()
  })
}

const FONT_DIRS = [
  path.join(os.homedir(), 'Library/Fonts'),
  '/Library/Fonts',
  '/System/Library/Fonts',
]

function loadFontFileAsBase64(fontFamily: string): string | null {
  // Normalize: "MesloLGS Nerd Font Mono" → "meslolgsnerd fontmono" for fuzzy matching
  const needle = fontFamily.toLowerCase().replace(/\s+/g, '')
  for (const dir of FONT_DIRS) {
    let entries: string[]
    try { entries = fs.readdirSync(dir) } catch { continue }
    for (const file of entries) {
      if (!/\.(ttf|otf|woff2?)$/i.test(file)) continue
      const normalized = file.replace(/[-_\s]+/g, '').toLowerCase()
      if (normalized.includes(needle) && /regular/i.test(normalized)) {
        try {
          const data = fs.readFileSync(path.join(dir, file))
          const ext = path.extname(file).slice(1).toLowerCase()
          const mime = ext === 'otf' ? 'font/otf' : ext === 'woff2' ? 'font/woff2' : 'font/ttf'
          return `data:${mime};base64,${data.toString('base64')}`
        } catch { continue }
      }
    }
  }
  // Second pass: match without requiring "regular" in name (single-weight fonts)
  for (const dir of FONT_DIRS) {
    let entries: string[]
    try { entries = fs.readdirSync(dir) } catch { continue }
    for (const file of entries) {
      if (!/\.(ttf|otf|woff2?)$/i.test(file)) continue
      const normalized = file.replace(/[-_\s]+/g, '').toLowerCase()
      if (normalized.includes(needle)) {
        try {
          const data = fs.readFileSync(path.join(dir, file))
          const ext = path.extname(file).slice(1).toLowerCase()
          const mime = ext === 'otf' ? 'font/otf' : ext === 'woff2' ? 'font/woff2' : 'font/ttf'
          return `data:${mime};base64,${data.toString('base64')}`
        } catch { continue }
      }
    }
  }
  return null
}
