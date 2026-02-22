import { ipcMain } from 'electron'
import { CreatePROptions, AheadBehind } from '../../shared/types'
import { getRuntimeById } from '../runtimes'
import type { IpcDependencies } from './types'
import { resolveSession } from './types'

export function registerDiffHandler(deps: IpcDependencies): void {
  const { sessionManager, projectRegistry, diffProvider } = deps

  ipcMain.handle('diff:get', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)

    const [diff, changedFiles] = await Promise.all([
      diffProvider.getDiff(session.worktreePath, project.baseBranch),
      diffProvider.getChangedFiles(session.worktreePath, project.baseBranch)
    ])

    return { diff, changedFiles }
  })

  ipcMain.handle('diff:file-original', async (_event, sessionId: string, relativePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)

    return diffProvider.getOriginalContent(session.worktreePath, project.baseBranch, relativePath)
  })
}

export function registerPrHandler(deps: IpcDependencies): void {
  const { sessionManager, projectRegistry, prCreator } = deps

  ipcMain.handle('pr:create', async (_event, options: CreatePROptions) => {
    const session = sessionManager.getSession(options.sessionId)
    if (!session) throw new Error(`Session not found: ${options.sessionId}`)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)

    const url = await prCreator.createPR(session.worktreePath, session.branchName, {
      title: options.title,
      body: options.body,
      baseBranch: project.baseBranch
    })

    return url
  })
}

export function registerGitHandlers(deps: IpcDependencies): void {
  const { gitOps, sessionManager, projectRegistry } = deps

  ipcMain.handle('git:commit', async (_event, sessionId: string, message: string) => {
    await gitOps.commit(resolveSession(sessionManager, sessionId).worktreePath, message)
  })

  ipcMain.handle('git:ai-generate', async (_event, sessionId: string, prompt: string) => {
    const session = resolveSession(sessionManager, sessionId)
    const runtime = getRuntimeById(session.runtimeId)
    if (!runtime) throw new Error(`Runtime not found: ${session.runtimeId}`)
    return gitOps.aiGenerate(runtime.binary, prompt, session.worktreePath, runtime.aiModelArgs ?? [])
  })

  ipcMain.handle('git:ahead-behind', async (_event, sessionId: string): Promise<AheadBehind> => {
    const session = resolveSession(sessionManager, sessionId)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)
    return gitOps.getAheadBehind(session.worktreePath, project.baseBranch)
  })

  ipcMain.handle('git:resolve-conflict', async (_event, sessionId: string, filePath: string, resolvedContent: string) => {
    await gitOps.resolveConflict(resolveSession(sessionManager, sessionId).worktreePath, filePath, resolvedContent)
  })

  ipcMain.handle('git:pr-context', async (_event, sessionId: string) => {
    const session = resolveSession(sessionManager, sessionId)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)
    return gitOps.getPRContext(session.worktreePath, project.baseBranch)
  })
}
