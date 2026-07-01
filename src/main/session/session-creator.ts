import { v4 as uuidv4 } from 'uuid'
import * as path from 'node:path'
import { SpawnAgentOptions } from '../../shared/types'
import { getRuntimeById } from '../agent/runtimes'
import { WorktreeManager } from '../git/worktree-manager'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { SessionStreamWirer } from './session-stream-wirer'
import { readWorktreeMeta, writeWorktreeMeta } from '../git/worktree-meta'
import { gitExec } from '../git/git-exec'
import { generateBranchName } from '../git/branch-namer'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { MemoryInjector } from '../memory/memory-injector'
import { debugLog } from '../app/debug-log'
import type { InternalSession } from './session-types'
import { buildSimpleRuntimeCommand } from '../agent/simple-runtime'
import { agentSpawnEnv } from '../agent/agent-env'
import { claudeAnsiThemeArgs } from '../agent/claude-theme-args'
import { isGitProject } from '../../shared/project-kind'
import { buildWorkingSetArgs } from '../agent/working-set-args'

export class SessionCreator {
  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private streamWirer: SessionStreamWirer,
    private getChatAdapter: () => ChatAdapter | null,
    private branchCheckoutManager?: BranchCheckoutManager,
    private getMemoryInjector?: () => MemoryInjector | null,
    private getThemeType?: () => 'light' | 'dark',
  ) {}

  async create(options: SpawnAgentOptions): Promise<InternalSession> {
    const project = this.resolveProject(options.projectId)
    const runtime = this.resolveRuntime(options.runtimeId)
    const projectIsGit = isGitProject(project)
    const noWorktree = Boolean(options.noWorktree || !projectIsGit)

    let worktree: { branch: string; path: string }
    // Per-session base branch (diff/PR/ahead-behind) — set for the no-worktree
    // base-branch model below; undefined elsewhere (falls back to project base).
    let sessionBaseBranch: string | undefined

    if (options.existingWorktreePath) {
      const branch = projectIsGit
        ? (await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], options.existingWorktreePath)).trim()
        : path.basename(options.existingWorktreePath) || project.name
      worktree = { branch, path: options.existingWorktreePath }
    } else if (noWorktree) {
      if (!projectIsGit) {
        worktree = { branch: project.name, path: project.path }
      } else if (options.stayOnBranch) {
        const branch = (await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], project.path)).trim()
        worktree = { branch, path: project.path }
      } else if (options.existingBranch) {
        // Legacy "launch on this branch" (openDeveloperLaunch): work on it
        // directly. Skip the clean-tree check — build artifacts may be present.
        await gitExec(['checkout', options.existingBranch], project.path)
        worktree = { branch: options.existingBranch, path: project.path }
      } else if (options.prIdentifier && this.branchCheckoutManager) {
        const branch = await this.branchCheckoutManager.fetchPRBranch(
          project.path,
          options.prIdentifier
        )
        await gitExec(['checkout', branch], project.path)
        worktree = { branch, path: project.path }
      } else {
        // Base-branch model: the base is a branch chosen in the New Agent form
        // (`baseBranch`) or the project's base branch. With no typed name
        // (`autoName`) the agent works directly on that base branch; a typed name
        // cuts a new branch off it. Either way the base becomes the session's
        // diff/PR base.
        const baseRef = options.baseBranch ?? project.baseBranch
        sessionBaseBranch = baseRef
        if (options.autoName) {
          await gitExec(['checkout', baseRef], project.path)
          worktree = { branch: baseRef, path: project.path }
        } else {
          // Creating a new branch off the base — ensure the working tree is clean
          // (the renderer confirms first and sets allowDirtyWorktree to carry
          // changes along).
          if (!options.allowDirtyWorktree) {
            await this.assertCleanWorkingTree(project.path)
          }
          const branch = options.branchName ?? (await generateBranchName(project.path, options.prompt ?? ''))
          await gitExec(['checkout', '-b', branch, baseRef], project.path)
          worktree = { branch, path: project.path }
        }
      }
    } else if (options.prIdentifier && this.branchCheckoutManager) {
      const branch = await this.branchCheckoutManager.fetchPRBranch(
        project.path,
        options.prIdentifier
      )
      worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
        project.path,
        branch,
        project.name,
        project.baseBranch
      )
    } else if (options.existingBranch && this.branchCheckoutManager) {
      worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
        project.path,
        options.existingBranch,
        project.name,
        project.baseBranch
      )
    } else {
      worktree = await this.worktreeManager.createWorktree(
        project.path,
        project.baseBranch,
        project.name,
        options.branchName,
        options.prompt
      )
    }

    // Chat-mode sessions created without a first user message defer runtime
    // spawn until the user sends their first message in the chat panel. The
    // session exists with a worktree but no PTY — sendInput will route to
    // spawnPrintModeFollowUp, which spawns a fresh print-mode process per turn.
    const deferRuntime = Boolean(options.nonInteractive) && !options.userMessage

    // Mint the session id before the spawn so it can double as Claude's
    // `--session-id`, making the on-disk transcript locatable for usage capture.
    const sessionId = uuidv4()

    let commandBinary = runtime.binary
    let runtimeArgs = [...(runtime.args ?? [])]
    let nonInteractiveOutputMode: InternalSession['nonInteractiveOutputMode']

    if (options.nonInteractive && options.userMessage) {
      const simpleCommand = buildSimpleRuntimeCommand(options.runtimeId, options.prompt)
      commandBinary = simpleCommand.binary
      runtimeArgs = simpleCommand.args
      nonInteractiveOutputMode = simpleCommand.outputMode
    } else if (options.ollamaModel) {
      runtimeArgs.push('--model', options.ollamaModel)
    }

    if (!options.nonInteractive && options.additionalDirs && options.additionalDirs.length > 0) {
      runtimeArgs.push(...buildWorkingSetArgs(options.runtimeId, options.additionalDirs))
    }

    // Match the embedded Claude Code's colors to Manifold's theme. Its
    // ANSI-palette theme renders through the terminal's colors, so Manifold's
    // themed palette controls it. Only for interactive Claude Code — print-mode
    // output isn't a themed TUI, and non-claude runtimes don't take --settings.
    if (!options.nonInteractive && commandBinary === 'claude') {
      runtimeArgs.push('--session-id', sessionId)
      runtimeArgs.push(...claudeAnsiThemeArgs(this.getThemeType?.() ?? 'dark'))
    }

    debugLog(`[session] nonInteractive=${options.nonInteractive}, deferRuntime=${deferRuntime}, runtimeArgs=${JSON.stringify(runtimeArgs)}`)

    // Read worktree metadata BEFORE spawning the PTY. The spawn must be
    // immediately followed by listener wiring with no await in between: a
    // process that exits during an await gap has its pool entry deleted, so
    // wiring would throw 'PTY not found', reject create(), and strand the
    // freshly created worktree (#496).
    const existingMeta = noWorktree ? null : await readWorktreeMeta(worktree.path)

    const ptyHandle = deferRuntime
      ? { id: '', pid: 0 }
      : this.ptyPool.spawn(commandBinary, runtimeArgs, {
          cwd: worktree.path,
          env: agentSpawnEnv(runtime.env),
          cols: options.cols,
          rows: options.rows
        })

    const session = this.buildSession(sessionId, options, worktree, ptyHandle, nonInteractiveOutputMode, noWorktree)
    if (sessionBaseBranch) {
      session.baseBranch = sessionBaseBranch
    }
    if (deferRuntime) {
      session.status = 'waiting'
      session.pid = null
    }
    if (existingMeta?.displayName) {
      session.displayName = existingMeta.displayName
    }

    // Map session→storage so chat messages are persisted scoped to the worktree
    // (not the project) — multiple chat-mode sessions in the same project each
    // get their own chat history.
    this.getChatAdapter()?.setSessionStorage(session.id, worktree.path, options.projectId)

    if (options.nonInteractive) {
      if (!deferRuntime) {
        if (session.nonInteractiveOutputMode === 'plain-text') {
          this.streamWirer.wireOutputStreaming(ptyHandle.id, session)
        } else {
          this.streamWirer.wireStreamJsonOutput(ptyHandle.id, session, session.nonInteractiveOutputMode)
        }
        this.streamWirer.wirePrintModeInitialExitHandling(ptyHandle.id, session)
        this.getChatAdapter()?.addUserMessage(session.id, options.userMessage || options.prompt)
      }
    } else {
      this.streamWirer.wireOutputStreaming(ptyHandle.id, session)
      this.streamWirer.wireExitHandling(ptyHandle.id, session)
    }

    if (!noWorktree) {
      writeWorktreeMeta(worktree.path, {
        runtimeId: options.runtimeId,
        sessionId: session.id,
        displayName: session.displayName,
        taskDescription: options.userMessage || options.prompt || existingMeta?.taskDescription,
        simpleTemplateTitle: options.simpleTemplateTitle ?? existingMeta?.simpleTemplateTitle,
        simplePromptInstructions: options.simplePromptInstructions ?? existingMeta?.simplePromptInstructions,
        additionalDirs: options.additionalDirs ?? existingMeta?.additionalDirs ?? [],
        ollamaModel: options.ollamaModel ?? existingMeta?.ollamaModel,
        workspaceId: options.workspaceId,
        workspaceWorktreePaths: options.workspaceWorktreePaths,
        nonInteractive: options.nonInteractive,
        codexThreadId: session.codexThreadId,
      }).catch((err) => {
        console.error(
          `[session-creator] writeWorktreeMeta failed for ${worktree.path} — nonInteractive=${options.nonInteractive} may be lost on next launch:`,
          err,
        )
      })
    }

    await this.getMemoryInjector?.()?.injectContext(session)

    return session
  }

  private async assertCleanWorkingTree(projectPath: string): Promise<void> {
    const status = await gitExec(['status', '--porcelain'], projectPath)
    if (status.trim().length > 0) {
      throw new Error(
        'Cannot switch branches: your working tree has uncommitted changes. ' +
        'Please commit or stash them before starting a no-worktree agent.'
      )
    }
  }

  private resolveProject(projectId: string): { name: string; path: string; baseBranch: string; kind?: 'git' | 'folder' } {
    const project = this.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return project
  }

  private resolveRuntime(runtimeId: string): { binary: string; args?: string[]; env?: Record<string, string> } {
    const runtime = getRuntimeById(runtimeId)
    if (!runtime) throw new Error(`Runtime not found: ${runtimeId}`)
    return runtime
  }

  private buildSession(
    sessionId: string,
    options: SpawnAgentOptions,
    worktree: { branch: string; path: string },
    ptyHandle: { id: string; pid: number },
    nonInteractiveOutputMode?: InternalSession['nonInteractiveOutputMode'],
    noWorktree = false,
  ): InternalSession {
    return {
      id: sessionId,
      projectId: options.projectId,
      runtimeId: options.runtimeId,
      branchName: worktree.branch,
      worktreePath: worktree.path,
      status: 'running',
      pid: ptyHandle.pid,
      ptyId: ptyHandle.id,
      outputBuffer: '',
      // A no-worktree agent created without a typed name is identified by its
      // branch (the sidebar shows the branch when there's no task/displayName),
      // so drop the auto-generated placeholder prompt instead of showing it.
      taskDescription: (noWorktree && options.autoName)
        ? undefined
        : (options.userMessage || options.prompt || undefined),
      simpleTemplateTitle: options.simpleTemplateTitle,
      simplePromptInstructions: options.simplePromptInstructions,
      ollamaModel: options.ollamaModel,
      additionalDirs: options.additionalDirs ?? [],
      noWorktree,
      workspaceId: options.workspaceId,
      workspaceWorktreePaths: options.workspaceWorktreePaths,
      groupId: options.groupId,
      nonInteractive: options.nonInteractive,
      nonInteractiveOutputMode,
    }
  }
}
