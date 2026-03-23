import * as fs from 'node:fs'
import { join } from 'node:path'

const DEV_PROFILE_NAME = 'Manifold Dev'
const DEV_SESSION_DIR = 'session-data'

const DEV_SESSION_CACHE_DIRS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'Shared Dictionary',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
]

interface AppPathApi {
  isPackaged: boolean
  getPath(name: 'appData'): string
  setPath(name: 'userData' | 'sessionData', path: string): void
}

function resetDevSessionCaches(sessionDataPath: string): void {
  for (const entry of DEV_SESSION_CACHE_DIRS) {
    try {
      fs.rmSync(join(sessionDataPath, entry), { recursive: true, force: true })
    } catch {
      // Best effort: Chromium can recreate these caches on startup.
    }
  }
}

export function configureDevProfilePaths(app: AppPathApi): void {
  if (app.isPackaged) return

  const devProfileRoot = join(app.getPath('appData'), DEV_PROFILE_NAME)
  const sessionDataPath = join(devProfileRoot, DEV_SESSION_DIR)

  fs.mkdirSync(devProfileRoot, { recursive: true })
  fs.mkdirSync(sessionDataPath, { recursive: true })
  resetDevSessionCaches(sessionDataPath)

  app.setPath('userData', devProfileRoot)
  app.setPath('sessionData', sessionDataPath)
}

export { DEV_PROFILE_NAME, DEV_SESSION_CACHE_DIRS }
