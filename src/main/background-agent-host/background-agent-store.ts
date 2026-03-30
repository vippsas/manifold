import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type {
  BackgroundAgentFeedbackEvent,
  BackgroundAgentGenerationStatus,
  BackgroundAgentProjectProfile,
  BackgroundAgentSuggestion,
} from '../../../background-agent/schemas/background-agent-types'
import {
  cloneProjectState,
  createEmptyProjectState,
  type BackgroundAgentProjectState,
  type BackgroundAgentStoreData,
} from './background-agent-types'

const CONFIG_DIR = path.join(os.homedir(), '.manifold', 'background-agent')
const STATE_FILE = path.join(CONFIG_DIR, 'state.json')

export class BackgroundAgentStore {
  private state: BackgroundAgentStoreData

  constructor(private readonly stateFile = STATE_FILE) {
    this.state = this.loadFromDisk()
  }

  getProjectState(projectId: string): BackgroundAgentProjectState {
    const existing = this.state.projects[projectId]
    return cloneProjectState(existing ?? createEmptyProjectState())
  }

  setProjectState(projectId: string, nextState: BackgroundAgentProjectState): void {
    this.state.projects[projectId] = cloneProjectState(nextState)
    this.writeToDisk()
  }

  setProjectSnapshot(
    projectId: string,
    snapshot: {
      profile: BackgroundAgentProjectProfile | null
      suggestions: BackgroundAgentSuggestion[]
      status: BackgroundAgentGenerationStatus
    },
  ): void {
    const current = this.getProjectState(projectId)
    current.profile = snapshot.profile ? {
      ...snapshot.profile,
      majorWorkflows: [...snapshot.profile.majorWorkflows],
      dependencyStack: [...snapshot.profile.dependencyStack],
      openQuestions: [...snapshot.profile.openQuestions],
      sourcePaths: [...snapshot.profile.sourcePaths],
    } : null
    current.suggestions = snapshot.suggestions.map((suggestion) => ({
      ...suggestion,
      supportingSources: suggestion.supportingSources.map((source) => ({ ...source })),
      evidence: [...suggestion.evidence],
    }))
    current.status = {
      ...snapshot.status,
      recentActivity: [...snapshot.status.recentActivity],
    }
    this.setProjectState(projectId, current)
  }

  addFeedback(projectId: string, event: BackgroundAgentFeedbackEvent): void {
    const current = this.getProjectState(projectId)
    current.feedback.push({ ...event })
    this.setProjectState(projectId, current)
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true })
  }

  private loadFromDisk(): BackgroundAgentStoreData {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return { projects: {} }
      }
      const raw = fs.readFileSync(this.stateFile, 'utf-8')
      const parsed = JSON.parse(raw) as BackgroundAgentStoreData
      if (!parsed || typeof parsed !== 'object' || typeof parsed.projects !== 'object' || parsed.projects === null) {
        return { projects: {} }
      }
      return parsed
    } catch {
      return { projects: {} }
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8')
  }
}
