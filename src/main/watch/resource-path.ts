import * as path from 'node:path'
import * as fs from 'node:fs'
import { app } from 'electron'

export function getBundledWatchSkillPath(): string {
  if (app?.isPackaged) {
    return path.join(process.resourcesPath, 'skills', 'watch')
  }
  // Dev mode: walk up from the compiled main bundle to repo root.
  const candidates = [
    path.join(__dirname, '..', '..', 'resources', 'skills', 'watch'),
    path.join(__dirname, '..', '..', '..', 'resources', 'skills', 'watch'),
    path.join(process.cwd(), 'resources', 'skills', 'watch'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'plugin.json'))) return c
  }
  return candidates[candidates.length - 1]
}
