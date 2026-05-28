import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AgentStatus } from '../../shared/types'
import type { Superagent, SuperagentProjectAddition } from '../../shared/superagent-types'
import { isGitProject } from '../../shared/project-kind'
import { sortProjectsByName } from '../../shared/project-sort'
import { buildOrchestratorPrompt } from './orchestrator-prompt'
import type { SuperagentManagerDeps } from './superagent-manager-deps'

type Deps = SuperagentManagerDeps

function adoptExistingSession(
  deps: Deps,
  superagentId: string,
  superagent: Superagent,
  projectId: string,
  reuseSessionId?: string,
): Superagent {
  if (!reuseSessionId) return superagent

  const session = deps.sessionManager.getSession(reuseSessionId)
  if (!session) throw new Error(`Session not found: ${reuseSessionId}`)
  if (session.projectId !== projectId) {
    throw new Error(`Session ${reuseSessionId} does not belong to project ${projectId}`)
  }
  if (session.noWorktree) {
    throw new Error('No-worktree sessions cannot be reused in a superagent fleet')
  }
  if (session.parentSuperagentId && session.parentSuperagentId !== superagentId) {
    throw new Error(`Session ${reuseSessionId} already belongs to another superagent`)
  }

  const fleetWorktreePath = superagent.fleetWorktreePaths?.[projectId]
  if (!fleetWorktreePath) {
    throw new Error(`No fleet worktree for project ${projectId}`)
  }
  if (session.worktreePath !== fleetWorktreePath) {
    throw new Error(
      `Session ${reuseSessionId} is not on the superagent worktree for project ${projectId}`,
    )
  }

  deps.sessionManager.setParentSuperagent(reuseSessionId, superagentId)
  deps.store.addChild(superagentId, reuseSessionId)
  return deps.store.get(superagentId) ?? superagent
}

function persistFleetContext(deps: Deps, superagent: Superagent): void {
  const fleet = sortProjectsByName(
    superagent.fleetProjectIds
      .map((projectId) => deps.projectRegistry.getProject(projectId))
      .filter(Boolean),
  )
  const persistentContext = buildOrchestratorPrompt({
    taskDescription: superagent.taskDescription,
    initialPrompt: '',
    fleet,
    fleetWorktreePaths: superagent.fleetWorktreePaths,
    branchName: superagent.branchName,
  })
  try {
    fs.writeFileSync(path.join(superagent.coordinationPath, 'AGENTS.md'), persistentContext + '\n')
  } catch {
    // Best-effort: the next resume rewrites AGENTS.md anyway.
  }
}

export async function addProjectToFleet(
  deps: Deps,
  superagentId: string,
  addition: SuperagentProjectAddition,
): Promise<Superagent> {
  const { projectId, reuseSessionId } = addition
  const superagent = deps.store.get(superagentId)
  if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
  if (superagent.fleetProjectIds.includes(projectId)) {
    const adopted = adoptExistingSession(deps, superagentId, superagent, projectId, reuseSessionId)
    deps.emitListChanged()
    return adopted
  }

  const project = deps.projectRegistry.getProject(projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)

  const worktreeInfo = isGitProject(project)
    ? await (async () => {
        const branchExists = await deps.worktreeManager.branchExists(project.path, superagent.branchName)
        return branchExists && deps.worktreeManager.createWorktreeFromBranch
          ? deps.worktreeManager.createWorktreeFromBranch(
              project.path,
              project.name,
              superagent.branchName,
              project.baseBranch,
            )
          : deps.worktreeManager.createWorktree(
              project.path,
              project.baseBranch,
              project.name,
              superagent.branchName,
            )
      })()
    : { branch: superagent.branchName, path: project.path }

  const nextFleet = sortProjectsByName([
    ...superagent.fleetProjectIds
      .map((id) => deps.projectRegistry.getProject(id))
      .filter((entry): entry is typeof project => Boolean(entry)),
    project,
  ])

  const updated = deps.store.update(superagentId, {
    fleetProjectIds: nextFleet.map((entry) => entry.id),
    fleetWorktreePaths: {
      ...(superagent.fleetWorktreePaths ?? {}),
      [projectId]: worktreeInfo.path,
    },
  })
  if (!updated) throw new Error(`Superagent not found: ${superagentId}`)

  const adopted = adoptExistingSession(deps, superagentId, updated, projectId, reuseSessionId)
  persistFleetContext(deps, adopted)
  deps.emitListChanged()
  return adopted
}

export async function spawnFleetAgent(
  deps: Deps,
  superagentId: string,
  projectId: string,
): Promise<{ id: string }> {
  const superagent = deps.store.get(superagentId)
  if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
  if (!superagent.fleetProjectIds.includes(projectId)) {
    throw new Error(`Project ${projectId} is not in fleet of superagent ${superagentId}`)
  }
  const worktreePath = superagent.fleetWorktreePaths?.[projectId]
  if (!worktreePath) throw new Error(`No fleet worktree for project ${projectId}`)

  const existing = superagent.childSessionIds
    .map((sid) => deps.sessionManager.getSession(sid))
    .find((s) => s && s.projectId === projectId && s.worktreePath === worktreePath)
  if (existing) return { id: existing.id }

  let targetWorktreePath = worktreePath
  const project = deps.projectRegistry.getProject(projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)

  if (isGitProject(project) && !fs.existsSync(targetWorktreePath)) {

    let restored: { path: string } | null = null
    if (deps.worktreeManager.createWorktreeFromBranch) {
      restored = await deps.worktreeManager.createWorktreeFromBranch(
        project.path,
        project.name,
        superagent.branchName,
        project.baseBranch,
      )
    } else if (!(await deps.worktreeManager.branchExists(project.path, superagent.branchName))) {
      restored = await deps.worktreeManager.createWorktree(
        project.path,
        project.baseBranch,
        project.name,
        superagent.branchName,
      )
    } else {
      throw new Error(`Fleet worktree for project ${projectId} is missing and cannot be restored`)
    }

    targetWorktreePath = restored.path
    if (targetWorktreePath !== worktreePath) {
      deps.store.update(superagentId, {
        fleetWorktreePaths: {
          ...(superagent.fleetWorktreePaths ?? {}),
          [projectId]: targetWorktreePath,
        },
      })
      deps.emitListChanged()
    }
  }

  const session = await deps.sessionManager.createSession({
    projectId,
    runtimeId: superagent.runtimeId,
    prompt: '',
    ...(isGitProject(project)
      ? { existingWorktreePath: targetWorktreePath }
      : { noWorktree: true }),
    parentSuperagentId: superagentId,
  })

  deps.store.addChild(superagentId, session.id)
  deps.emitChildSpawned(superagentId, session.id)
  deps.emitListChanged()
  return { id: session.id }
}

export function computeFleetStatus(deps: Deps, superagentId: string): void {
  const s = deps.store.get(superagentId)
  if (!s) return
  const childStatuses = s.childSessionIds
    .map((id) => deps.sessionManager.getSession(id)?.status)
    .filter((v: AgentStatus | undefined): v is AgentStatus => Boolean(v))

  let status: AgentStatus = 'waiting'
  if (childStatuses.some((st: AgentStatus) => st === 'error')) status = 'error'
  else if (childStatuses.some((st: AgentStatus) => st === 'running')) status = 'running'
  else if (childStatuses.length > 0 && childStatuses.every((st: AgentStatus) => st === 'done')) status = 'done'
  else status = 'waiting'

  deps.store.update(superagentId, { status })
  deps.emitStatus(superagentId, status)
}
