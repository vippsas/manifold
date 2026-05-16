import { getRuntimeById } from '../agent/runtimes'
import type { PtyPool } from '../agent/pty-pool'
import type { GitOperationsManager } from '../git/git-operations'
import { hasShellPromptAtEnd, type SessionStreamWirer } from './session-stream-wirer'
import { createShellPtySession } from './session-resume'
import { NlInputBuffer, RollingOutputBuffer, buildNlTranslationPrompt } from './nl-command-translator'
import {
  clearGhostText,
  dismissSuggestion,
  gatherGitStatus,
  injectGhostText,
  predictNextCommand,
} from './shell-suggestion'
import type { InternalSession } from './session-types'

export class ShellSessionController {
  private gitOps: GitOperationsManager | null = null

  constructor(
    private ptyPool: PtyPool,
    private streamWirer: SessionStreamWirer,
    private sessions: Map<string, InternalSession>,
  ) {}

  setGitOps(gitOps: GitOperationsManager): void {
    this.gitOps = gitOps
  }

  createShellSession(cwd: string, options?: { shellPrompt?: boolean; historyDir?: string }): { sessionId: string } {
    const result = createShellPtySession(cwd, this.ptyPool, this.streamWirer, this.sessions, options)
    const session = this.sessions.get(result.sessionId)
    if (session) {
      session.nlInputBuffer = new NlInputBuffer()
      session.nlOutputBuffer = new RollingOutputBuffer()
    }
    return result
  }

  handleInput(session: InternalSession, input: string): boolean {
    if (!session.nlInputBuffer) return false

    const result = session.nlInputBuffer.feed(input)
    if (result.type === 'nl-query') {
      void this.translateNlCommand(session, result.query, result.pasted)
      return true
    }

    return false
  }

  triggerSuggestion(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.runtimeId !== '__shell__' || !session.ptyId || !this.gitOps) return
    if (session.shellSuggestion?.pending || session.nlPending) return
    if (!hasShellPromptAtEnd(session.outputBuffer)) return

    dismissSuggestion(session, this.ptyPool)
    if (!session.nlInputBuffer?.hasBufferedInput()) {
      void predictNextCommand(session, this.ptyPool, this.gitOps)
    }
  }

  private async translateNlCommand(session: InternalSession, query: string, pasted: boolean): Promise<void> {
    if (!session.ptyId || !this.gitOps || session.nlPending) return

    session.nlPending = true
    dismissSuggestion(session, this.ptyPool)

    const ptyId = session.ptyId
    // When pasted, the text was never forwarded to the PTY — write it now.
    // When typed character-by-character, it's already on the prompt — just send Enter.
    this.ptyPool.write(ptyId, pasted ? `# ${query}\r` : '\r')

    setTimeout(() => {
      if (!session.nlPending || session.ptyId !== ptyId) return
      injectGhostText(this.ptyPool, ptyId, '⏳ ...')
    }, 200)

    try {
      const terminalOutput = session.nlOutputBuffer?.getText() ?? ''
      const gitStatus = await gatherGitStatus(session.worktreePath)

      const prompt = buildNlTranslationPrompt({
        query,
        terminalOutput,
        cwd: session.worktreePath,
        gitStatus,
        os: process.platform,
        shell: 'zsh',
      })

      const runtime = getRuntimeById('codex')
      if (!runtime) return

      const result = await this.gitOps.aiGenerate(
        runtime,
        prompt,
        session.worktreePath,
        runtime.aiModelArgs ?? [],
        { timeoutMs: 60_000 },
      )

      if (session.ptyId !== ptyId) return

      const command = result.trim().split('\n')[0].trim()
      if (!command) return

      this.ptyPool.write(ptyId, command)
    } catch {
      // Error silently — user sees empty prompt.
    } finally {
      if (session.ptyId === ptyId) {
        clearGhostText(this.ptyPool, ptyId)
      }
      session.nlPending = false
    }
  }
}
