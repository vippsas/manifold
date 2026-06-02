import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Workspace } from '../../shared/workspace-types'

export class WorkspaceStore {
  private workspaces: Workspace[]

  constructor(private readonly filePath: string) {
    this.workspaces = this.loadFromDisk()
  }

  private loadFromDisk(): Workspace[] {
    try {
      if (!fs.existsSync(this.filePath)) return []
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      return Array.isArray(parsed) ? (parsed as Workspace[]) : []
    } catch {
      return []
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.workspaces, null, 2))
  }

  list(): Workspace[] { return [...this.workspaces] }
  get(id: string): Workspace | undefined { return this.workspaces.find((w) => w.id === id) }

  add(workspace: Workspace): void {
    this.workspaces.push(workspace)
    this.writeToDisk()
  }

  update(id: string, partial: Partial<Workspace>): Workspace | undefined {
    const idx = this.workspaces.findIndex((w) => w.id === id)
    if (idx === -1) return undefined
    this.workspaces[idx] = { ...this.workspaces[idx], ...partial }
    this.writeToDisk()
    return this.workspaces[idx]
  }

  remove(id: string): boolean {
    const before = this.workspaces.length
    this.workspaces = this.workspaces.filter((w) => w.id !== id)
    if (this.workspaces.length === before) return false
    this.writeToDisk()
    return true
  }

  addProject(id: string, projectId: string): void {
    const w = this.workspaces.find((x) => x.id === id)
    if (!w || w.projectIds.includes(projectId)) return
    w.projectIds.push(projectId)
    this.writeToDisk()
  }

  removeProject(id: string, projectId: string): void {
    const w = this.workspaces.find((x) => x.id === id)
    if (!w) return
    const before = w.projectIds.length
    w.projectIds = w.projectIds.filter((p) => p !== projectId)
    if (w.projectIds.length !== before) this.writeToDisk()
  }
}
