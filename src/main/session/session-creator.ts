import { v4 as uuidv4 } from 'uuid'
import { SpawnAgentOptions } from '../../shared/types'
import { getRuntimeById } from '../agent/runtimes'
import { WorktreeManager } from '../git/worktree-manager'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { SessionStreamWirer } from './session-stream-wirer'
import { writeWorktreeMeta } from '../git/worktree-meta'
import { gitExec } from '../git/git-exec'
import { generateBranchName } from '../git/branch-namer'
import type { ChatAdapter } from '../agent/chat-adapter'
import { debugLog } from '../app/debug-log'
import type { InternalSession } from './session-types'

export class SessionCreator {
  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private streamWirer: SessionStreamWirer,
    private getChatAdapter: () => ChatAdapter | null,
    private branchCheckoutManager?: BranchCheckoutManager,
  ) {}

  async create(options: SpawnAgentOptions): Promise<InternalSession> {
    const project = this.resolveProject(options.projectId)
    const runtime = this.resolveRuntime(options.runtimeId)

    let worktree: { branch: string; path: string }

    if (options.noWorktree) {
      await this.assertCleanWorkingTree(project.path)

      if (options.existingBranch) {
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
        const branch = options.branchName ?? (await generateBranchName(project.path, options.prompt ?? ''))
        await gitExec(['checkout', '-b', branch], project.path)
        worktree = { branch, path: project.path }
      }
    } else if (options.prIdentifier && this.branchCheckoutManager) {
      const branch = await this.branchCheckoutManager.fetchPRBranch(
        project.path,
        options.prIdentifier
      )
      worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
        project.path,
        branch,
        project.name
      )
    } else if (options.existingBranch && this.branchCheckoutManager) {
      worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
        project.path,
        options.existingBranch,
        project.name
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

    const runtimeArgs = [...(runtime.args ?? [])]
    if (options.ollamaModel) {
      runtimeArgs.push('--model', options.ollamaModel)
    }
    if (options.nonInteractive && options.prompt) {
      runtimeArgs.push('-p', options.prompt, '--output-format', 'stream-json', '--verbose')
    }

    debugLog(`[session] nonInteractive=${options.nonInteractive}, runtimeArgs=${JSON.stringify(runtimeArgs)}`)

    const ptyHandle = this.ptyPool.spawn(runtime.binary, runtimeArgs, {
      cwd: worktree.path,
      env: runtime.env,
      cols: options.cols,
      rows: options.rows
    })

    const session = this.buildSession(options, worktree, ptyHandle)

    if (options.nonInteractive) {
      this.streamWirer.wireStreamJsonOutput(ptyHandle.id, session)
      this.streamWirer.wirePrintModeInitialExitHandling(ptyHandle.id, session)
      this.getChatAdapter()?.addUserMessage(session.id, options.userMessage || options.prompt)
    } else {
      this.streamWirer.wireOutputStreaming(ptyHandle.id, session)
      this.streamWirer.wireExitHandling(ptyHandle.id, session)
    }

    if (!options.noWorktree) {
      writeWorktreeMeta(worktree.path, {
        runtimeId: options.runtimeId,
        taskDescription: options.prompt || undefined,
        ollamaModel: options.ollamaModel,
      }).catch(() => {})
    }

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

  private resolveProject(projectId: string): { name: string; path: string; baseBranch: string } {
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
    options: SpawnAgentOptions,
    worktree: { branch: string; path: string },
    ptyHandle: { id: string; pid: number }
  ): InternalSession {
    return {
      id: uuidv4(),
      projectId: options.projectId,
      runtimeId: options.runtimeId,
      branchName: worktree.branch,
      worktreePath: worktree.path,
      status: 'running',
      pid: ptyHandle.pid,
      ptyId: ptyHandle.id,
      outputBuffer: '',
      taskDescription: options.prompt || undefined,
      ollamaModel: options.ollamaModel,
      additionalDirs: [],
      noWorktree: options.noWorktree,
      nonInteractive: options.nonInteractive,
    }
  }
}
