import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { SpawnAgentOptions } from '../../shared/types'
import { pickRandomNorwegianCityName } from '../../shared/norwegian-cities'
import { generateBranchName } from '../git/branch-namer'
import { acceptSuggestion, dismissSuggestion } from '../session/shell-suggestion'
import { debugLog } from '../app/debug-log'
import type { IpcDependencies } from './types'
import { isGitProject } from '../../shared/project-kind'

const NO_WORKTREE_ERROR =
  'A no-worktree agent is already running for this project. ' +
  'Only one no-worktree agent can run at a time per project.'

async function isWithinExistingDir(filePath: string, dirPath: string): Promise<boolean> {
  try {
    const baseDir = await fs.realpath(dirPath)
    const resolved = await fs.realpath(path.resolve(filePath))
    return resolved === baseDir || resolved.startsWith(baseDir + path.sep)
  } catch {
    return false
  }
}

async function realpathIfReadable(filePath: string): Promise<string | null> {
  try {
    return await fs.realpath(path.resolve(filePath))
  } catch {
    return null
  }
}

async function resolveReadableChatImagePath(filePath: string, projectGeneratedImageDirs: string[] = [], projectImageRoot?: string): Promise<string> {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const allowedDirs = [
    path.join(os.tmpdir(), 'manifold-chat-images'),
    path.join(codexHome, 'generated_images'),
    ...projectGeneratedImageDirs,
    ...(projectImageRoot ? [projectImageRoot] : []),
  ]

  const candidates = path.isAbsolute(filePath)
    ? [filePath]
    : [
        ...(projectImageRoot ? [path.join(projectImageRoot, filePath)] : []),
        filePath,
      ]

  for (const candidate of candidates) {
    const resolved = await realpathIfReadable(candidate)
    if (!resolved) continue
    for (const dir of allowedDirs) {
      if (await isWithinExistingDir(resolved, dir)) return resolved
    }
  }

  throw new Error('Image path is outside the allowed chat image directories')
}

function sessionWorktreePath(deps: IpcDependencies, sessionId?: string): string | undefined {
  return sessionId ? deps.sessionManager.getSession(sessionId)?.worktreePath : undefined
}

function projectGeneratedImageDirs(deps: IpcDependencies, sessionId?: string, sessionWorktree = sessionWorktreePath(deps, sessionId)): string[] {
  const dirs: string[] = []
  if (sessionWorktree) {
    dirs.push(path.join(sessionWorktree, 'public', 'generated-images'))
  }
  for (const project of deps.projectRegistry?.listProjects?.() ?? []) {
    dirs.push(path.join(project.path, 'public', 'generated-images'))
  }
  return dirs
}

/**
 * Resolve the shell history directory based on the scope setting.
 *
 * For 'project' scope: ~/.manifold/history/<projectName>/
 *   - Worktree paths: ~/.manifold/worktrees/<projectName>/manifold-<agent> → projectName
 *   - Other paths: uses path.basename(cwd) as fallback
 *
 * For 'global' scope: ~/.manifold/history/
 */
export function resolveShellHistoryDir(cwd: string, scope: 'project' | 'global'): string {
  const historyBase = path.join(os.homedir(), '.manifold', 'history')
  if (scope === 'global') {
    return historyBase
  }
  // Extract project name from worktree path: .../worktrees/<projectName>/manifold-<agent>
  const worktreeMatch = cwd.match(/worktrees\/([^/]+)\//)
  const projectName = worktreeMatch ? worktreeMatch[1] : path.basename(cwd)
  return path.join(historyBase, projectName)
}

async function clearDormantNoWorktreeSessions(
  deps: Pick<IpcDependencies, 'sessionManager' | 'fileWatcher'>,
  projectIsGit: boolean,
  options: SpawnAgentOptions,
): Promise<void> {
  const requiresNoWorktree = Boolean(options.noWorktree || !projectIsGit)

  const sessions = deps.sessionManager.listSessions()
    .filter((session) => session.projectId === options.projectId && session.noWorktree)

  for (const session of sessions) {
    const internal = deps.sessionManager.getInternalSession(session.id)
    if (!requiresNoWorktree) continue
    if (internal?.ptyId || internal?.devServerPtyId || internal?.status === 'running') {
      throw new Error(NO_WORKTREE_ERROR)
    }
  }

  for (const session of sessions) {
    const internal = deps.sessionManager.getInternalSession(session.id)
    if (internal?.ptyId || internal?.devServerPtyId || internal?.status === 'running') continue
    await deps.fileWatcher.unwatch(session.worktreePath)
    await deps.sessionManager.killSession(session.id)
  }
}

export function registerAgentHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher, viewStateStore } = deps

  ipcMain.handle('branch:suggest', async (_event, projectId: string, taskDescription: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) return project.name
    const branchHint = taskDescription?.trim() || pickRandomNorwegianCityName()
    return generateBranchName(project.path, branchHint)
  })

  ipcMain.handle('agent:spawn', async (_event, options: SpawnAgentOptions) => {
    const project = deps.projectRegistry.getProject(options.projectId)
    if (!project) throw new Error(`Project not found: ${options.projectId}`)
    await clearDormantNoWorktreeSessions(deps, isGitProject(project), options)
    const session = await sessionManager.createSession(options)
    fileWatcher.watch(session.worktreePath, session.id)
    return session
  })

  ipcMain.handle('chat:save-pasted-image', async (_event, sessionId: string, dataUrl: string) => {
    const match = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) throw new Error('Invalid image data URL')
    const mimeSubtype = match[1].toLowerCase()
    const allowed: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp' }
    const ext = allowed[mimeSubtype]
    if (!ext) throw new Error(`Unsupported image type: image/${mimeSubtype}`)
    const buffer = Buffer.from(match[2], 'base64')
    if (buffer.byteLength === 0) throw new Error('Empty image data')
    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const dir = path.join(os.tmpdir(), 'manifold-chat-images', safeSessionId)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${randomUUID()}.${ext}`)
    await fs.writeFile(filePath, buffer)
    return filePath
  })

  ipcMain.handle('chat:read-pasted-image', async (_event, filePath: string, sessionId?: string) => {
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    }
    const mime = mimeMap[ext]
    if (!mime) throw new Error(`Unsupported image type: ${ext}`)
    // Only ever read back chat attachments, Codex generated images, or image files in the active worktree.
    const worktreePath = sessionWorktreePath(deps, sessionId)
    const resolved = await resolveReadableChatImagePath(filePath, projectGeneratedImageDirs(deps, sessionId, worktreePath), worktreePath)
    const buffer = await fs.readFile(resolved)
    return `data:${mime};base64,${buffer.toString('base64')}`
  })

  ipcMain.handle('agent:input', (_event, sessionId: string, input: string) => {
    sessionManager.sendInput(sessionId, input)
  })

  ipcMain.handle('agent:resize', (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle('agent:interrupt', (_event, sessionId: string) => {
    sessionManager.interruptSession(sessionId)
  })

  ipcMain.handle('agent:kill', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    debugLog(`[agent:kill] sessionId=${sessionId} found=${!!session} worktreePath=${session?.worktreePath ?? 'n/a'} noWorktree=${session?.noWorktree ?? 'n/a'}`)
    if (session) {
      await fileWatcher.unwatch(session.worktreePath)
    }
    await sessionManager.killSession(sessionId)
    viewStateStore.delete(sessionId)
    debugLog(`[agent:kill] done sessionId=${sessionId}`)
  })

  ipcMain.handle('agent:kill-worktree', async (_event, worktreePath: string) => {
    debugLog(`[agent:kill-worktree] path=${worktreePath}`)
    const idsBefore = Array.from(sessionManager.listSessions())
      .filter((s) => s.worktreePath === worktreePath)
      .map((s) => s.id)
    if (worktreePath) {
      await fileWatcher.unwatch(worktreePath)
    }
    await sessionManager.killAllSessionsOnWorktree(worktreePath)
    for (const id of idsBefore) viewStateStore.delete(id)
    debugLog(`[agent:kill-worktree] done path=${worktreePath} killed=${idsBefore.length}`)
  })

  ipcMain.handle('agent:delete-app', async (_event, sessionId: string, projectId: string) => {
    // 1. Kill session (also removes worktree if applicable)
    const session = sessionManager.getSession(sessionId)
    if (session) {
      await fileWatcher.unwatch(session.worktreePath)
      await sessionManager.killSession(sessionId)
      viewStateStore.delete(sessionId)
    }

    // 2. Remove the project directory from disk
    const project = deps.projectRegistry.getProject(projectId)
    if (project) {
      try {
        await fs.rm(project.path, { recursive: true, force: true })
      } catch {
        // Best-effort: directory may already be gone
      }
    }

    // 3. Remove persisted chat history for every session in this project
    deps.chatStore.deleteByProject(projectId)

    // 3b. Remove memory data
    deps.memoryStore.deleteProject(projectId)

    // 4. Remove project from registry
    deps.projectRegistry.removeProject(projectId)
  })

  ipcMain.handle(
    'agent:start-dev-server',
    (
      _event,
      projectId: string,
      branchName: string,
      description?: string,
      simpleTemplateTitle?: string,
      simplePromptInstructions?: string,
      runtimeId?: string,
    ) => {
      return sessionManager.startDevServerSession(
        projectId,
        branchName,
        description,
        simpleTemplateTitle,
        simplePromptInstructions,
        runtimeId,
      )
    },
  )

  ipcMain.handle('agent:resume', async (_event, sessionId: string, runtimeId: string) => {
    const session = await sessionManager.resumeSession(sessionId, runtimeId)
    fileWatcher.watch(session.worktreePath, session.id)
    return session
  })

  ipcMain.handle('agent:replay', (_event, sessionId: string) => {
    return sessionManager.getOutputBuffer(sessionId)
  })

  ipcMain.handle('agent:sessions', async (_event, projectId?: string) => {
    if (projectId) {
      return sessionManager.discoverSessionsForProject(projectId)
    }
    const settings = deps.settingsStore.getSettings()
    const simpleProjectsBase = path.join(settings.storagePath, 'projects')
    return sessionManager.discoverAllSessions(simpleProjectsBase)
  })

  ipcMain.handle('shell:create', (_event, cwd: string) => {
    const settings = deps.settingsStore.getSettings()
    const historyDir = resolveShellHistoryDir(cwd, settings.shellHistoryScope)
    return sessionManager.createShellSession(cwd, {
      shellPrompt: settings.shellPrompt,
      historyDir,
    })
  })

  ipcMain.handle('shell:kill', async (_event, sessionId: string) => {
    if (!sessionManager.hasSession(sessionId)) return
    await sessionManager.killSession(sessionId)
  })

  ipcMain.handle('shell:predict-suggestion', (_event, sessionId: string) => {
    sessionManager.triggerShellSuggestion(sessionId)
  })

  ipcMain.handle('shell:accept-suggestion', (_event, sessionId: string) => {
    const session = sessionManager.getInternalSession(sessionId)
    if (!session) return false
    return acceptSuggestion(session, deps.sessionManager.getPtyPool())
  })

  ipcMain.handle('shell:dismiss-suggestion', (_event, sessionId: string) => {
    const session = sessionManager.getInternalSession(sessionId)
    if (!session) return
    dismissSuggestion(session, deps.sessionManager.getPtyPool())
  })

  ipcMain.handle('git:list-branches', async (_event, projectId: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    return deps.branchCheckout.listBranches(project.path)
  })

  ipcMain.handle('git:list-prs', async (_event, projectId: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    return deps.branchCheckout.listOpenPRs(project.path)
  })

  ipcMain.handle('git:fetch-pr-branch', async (_event, projectId: string, prIdentifier: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    const branch = await deps.branchCheckout.fetchPRBranch(project.path, prIdentifier)
    return { branch }
  })
}
