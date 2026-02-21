import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { v4 as uuidv4 } from 'uuid'
import { Project } from '../shared/types'
import { gitExec } from './git-exec'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const PROJECTS_FILE = path.join(CONFIG_DIR, 'projects.json')

export class ProjectRegistry {
  private projects: Project[]

  constructor() {
    this.projects = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Project[] {
    try {
      if (!fs.existsSync(PROJECTS_FILE)) {
        return []
      }
      const raw = fs.readFileSync(PROJECTS_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return []
      }
      return parsed as Project[]
    } catch {
      return []
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(this.projects, null, 2), 'utf-8')
  }

  private async detectBaseBranch(projectPath: string): Promise<string> {
    try {
      const stdout = await gitExec(['branch', '-a', '--format=%(refname:short)'], projectPath)
      const branches = stdout.trim().split('\n').filter(Boolean)
      if (branches.includes('main')) return 'main'
      if (branches.includes('master')) return 'master'
      // Get current branch
      const current = await gitExec(['branch', '--show-current'], projectPath)
      return current.trim() || 'main'
    } catch {
      return 'main'
    }
  }

  listProjects(): Project[] {
    return [...this.projects]
  }

  async addProject(projectPath: string): Promise<Project> {
    const resolvedPath = path.resolve(projectPath)
    const existing = this.projects.find((p) => p.path === resolvedPath)
    if (existing) {
      return existing
    }

    const baseBranch = await this.detectBaseBranch(resolvedPath)
    const project: Project = {
      id: uuidv4(),
      name: path.basename(resolvedPath),
      path: resolvedPath,
      baseBranch,
      addedAt: new Date().toISOString()
    }

    this.projects.push(project)
    this.writeToDisk()
    return project
  }

  removeProject(id: string): boolean {
    const index = this.projects.findIndex((p) => p.id === id)
    if (index === -1) return false
    this.projects.splice(index, 1)
    this.writeToDisk()
    return true
  }

  getProject(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id)
  }
}
