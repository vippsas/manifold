import * as fs from 'node:fs'
import type { Workspace } from '../../shared/workspace-types'

interface LegacySuperagent {
  id?: string
  name?: string
  fleetProjectIds?: string[]
  createdAt?: string
}

/** One-time, best-effort conversion of legacy superagents into workspaces. Never throws. */
export function migrateSuperagentsToWorkspaces(superagentsPath: string, workspacesPath: string): void {
  try {
    if (!fs.existsSync(superagentsPath)) return
    if (fs.existsSync(workspacesPath)) return // already migrated / user has workspaces
    const parsed = JSON.parse(fs.readFileSync(superagentsPath, 'utf-8'))
    if (!Array.isArray(parsed)) return
    const workspaces: Workspace[] = (parsed as LegacySuperagent[])
      .filter((s) => s.id && Array.isArray(s.fleetProjectIds))
      .map((s) => ({
        id: s.id as string,
        name: s.name ?? 'workspace',
        projectIds: s.fleetProjectIds as string[],
        createdAt: s.createdAt ?? new Date().toISOString(),
      }))
    if (workspaces.length === 0) return
    fs.writeFileSync(workspacesPath, JSON.stringify(workspaces, null, 2))
  } catch {
    // Best-effort: a failed migration must never block startup.
  }
}
