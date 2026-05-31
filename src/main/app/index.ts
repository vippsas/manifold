import { app, BrowserWindow } from 'electron'
import type { AgentStatus } from '../../shared/types'
import { loadShellPath } from './shell-path'
import { configureDevProfilePaths } from './dev-profile'

loadShellPath()
configureDevProfilePaths(app)

// Remove env vars set by parent CLI agents so spawned agents don't detect
// themselves as nested sessions and refuse to start.
delete process.env.CLAUDECODE

import { SettingsStore } from '../store/settings-store'
import { ProjectRegistry } from '../store/project-registry'
import { WorktreeManager } from '../git/worktree-manager'
import { PtyPool } from '../agent/pty-pool'
import { SessionManager } from '../session/session-manager'
import { FileWatcher } from '../fs/file-watcher'
import { ChokidarTreeWatcher } from '../fs/tree-watcher'
import { DiffProvider } from '../git/diff-provider'
import { PrCreator } from '../git/pr-creator'
import { ViewStateStore } from '../store/view-state-store'
import { ShellTabStore } from '../store/shell-tab-store'
import { GitOperationsManager } from '../git/git-operations'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { DockLayoutStore } from '../store/dock-layout-store'
import { SearchViewStore } from '../store/search-view-store'
import { BackgroundAgentHost } from '../background-agent-host/background-agent-host'
import { ChatStore } from '../store/chat-store'
import { ChatAdapter } from '../agent/chat-adapter'
import { ModeSwitcher } from './mode-switcher'
import { registerAppLifecycle } from './app-lifecycle'
import { createWindow, rebuildAppMenu } from './window-factory'
import { PowerManager } from './power-manager'
import { MemoryStore } from '../memory/memory-store'
import { MemoryCapture } from '../memory/memory-capture'
import { MemoryCompressor } from '../memory/memory-compressor'
import { MemoryInjector } from '../memory/memory-injector'
import { LoopRunner } from '../loop/loop-runner'
import {
  createSessionAdapter,
  createGitAdapter,
  createEvalRunner,
  createJudgeAdapter,
  createEmitter,
  createIterationLog,
  createWaitForTurnEnd,
} from '../loop/loop-adapters'
import * as path from 'node:path'
import { SuperagentStore } from '../superagent/superagent-store'
import { ApprovalBroker } from '../superagent/approval-broker'
import { McpBridgeServer } from '../superagent/mcp-bridge-server'
import { SuperagentManager } from '../superagent/superagent-manager'
import { getRuntimeById } from '../agent/runtimes'
import { WatchRunStore } from '../watch/run-store'
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder } from '../session/verdict-recorder'
import { summarizeMiddle } from '../store/prompt-summarizer'
import type { ApprovalRequest, ApprovalResponse } from '../../shared/superagent-types'

let mainWindow: BrowserWindow | null = null

// ── Module instances ─────────────────────────────────────────────────
const settingsStore = new SettingsStore()
const powerManager = new PowerManager()
const projectRegistry = new ProjectRegistry()
const worktreeManager = new WorktreeManager(settingsStore.getSettings().storagePath)
const branchCheckout = new BranchCheckoutManager(settingsStore.getSettings().storagePath)
const ptyPool = new PtyPool()
const fileWatcher = new FileWatcher(undefined, new ChokidarTreeWatcher())
const sessionManager = new SessionManager(worktreeManager, ptyPool, projectRegistry, branchCheckout, fileWatcher)
const diffProvider = new DiffProvider()

// ── Superagent modules ───────────────────────────────────────────────
const manifoldHome = path.join(app.getPath('home'), '.manifold')
const superagentStore = new SuperagentStore(path.join(manifoldHome, 'superagents.json'))
const approvalBroker = new ApprovalBroker({
  emit: (req) => {
    mainWindow?.webContents.send('superagent:approval-request', req)
    superagentManagerRef?.appendSystemOutput(req.superagentId, formatApprovalRequestedMessage(req))
  },
  onAutoApprove: (id) => { superagentManagerRef?.setAutoApprove(id, true) },
  onResolved: (req, decision) => {
    superagentManagerRef?.appendSystemOutput(req.superagentId, formatApprovalResolvedMessage(req, decision))
  },
})
let superagentManagerRef: SuperagentManager | null = null
const mcpBridge = new McpBridgeServer({
  socketPath: path.join(manifoldHome, 'mcp-bridge.sock'),
  handleToolCall: (sid, name, args) => {
    if (!superagentManagerRef) throw new Error('SuperagentManager not initialized')
    return superagentManagerRef.handleToolCall(sid, name, args)
  },
})
const superagentManager = new SuperagentManager({
  store: superagentStore,
  storageRoot: manifoldHome,
  approvalBroker,
  worktreeManager,
  projectRegistry,
  sessionManager,
  diffProvider,
  ptyPool,
  runtimes: { getRuntimeById },
  mcpBridge,
  emitStatus: (sid, status) => { mainWindow?.webContents.send('superagent:status', { superagentId: sid, status }) },
  emitListChanged: () => { mainWindow?.webContents.send('superagent:list-changed') },
  emitChildSpawned: (sid, childId) => { mainWindow?.webContents.send('superagent:child-spawned', { superagentId: sid, sessionId: childId }) },
  emitOutput: (sid, chunk) => { mainWindow?.webContents.send('agent:output', { sessionId: sid, data: chunk }) },
})
superagentManagerRef = superagentManager
sessionManager.setStatusListener((sessionId, status) => {
  const session = sessionManager.getSession(sessionId)
  const parentId = session?.parentSuperagentId
  if (parentId) superagentManager.onChildStatusChange(parentId, sessionId, status as AgentStatus)
})
const prCreator = new PrCreator()
const viewStateStore = new ViewStateStore()
const shellTabStore = new ShellTabStore()
const gitOps = new GitOperationsManager()
const dockLayoutStore = new DockLayoutStore()
const searchViewStore = new SearchViewStore()
const watchRunStore = new WatchRunStore()
const backgroundAgentHost = new BackgroundAgentHost({
  settingsStore,
  projectRegistry,
  sessionManager,
  gitOps,
})
const chatStore = new ChatStore()
const chatAdapter = new ChatAdapter()
chatAdapter.setChatStore(chatStore)
sessionManager.setChatAdapter(chatAdapter)
sessionManager.setGitOps(gitOps)

const loopRunner = new LoopRunner({
  session: createSessionAdapter(sessionManager),
  git: createGitAdapter(),
  evalRunner: createEvalRunner(),
  judge: createJudgeAdapter(sessionManager, gitOps),
  emitter: createEmitter(() => mainWindow),
  iterationLog: createIterationLog(),
  waitForTurnEnd: createWaitForTurnEnd(sessionManager),
})

const memoryStore = new MemoryStore()
const memoryCapture = new MemoryCapture(chatAdapter, memoryStore, (sid) => sessionManager.getSession(sid))
const memoryCompressor = new MemoryCompressor(memoryStore, settingsStore)
const memoryInjector = new MemoryInjector(memoryStore, settingsStore)
memoryCapture.setMemoryCompressor(memoryCompressor)
sessionManager.setMemoryCapture(memoryCapture)
sessionManager.setMemoryCompressor(memoryCompressor)
sessionManager.setMemoryInjector(memoryInjector)

const verdictStore = new VerdictStore()
const verdictRecorder = new VerdictRecorder({
  store: verdictStore,
  getAiSettings: () => settingsStore.getSettings().transcription ?? { provider: 'none' },
  getDiffStats: (wt, base) => diffProvider.getDiffStats(wt, base),
  isBranchMerged: (wt, base, branch) => gitOps.isBranchMerged(wt, base, branch),
  summarize: (middle, settings) => summarizeMiddle(middle, settings),
})
sessionManager.setVerdictRecorder(verdictRecorder)
fileWatcher.setVerdictRecorder(verdictRecorder)

const ipcDeps = {
  settingsStore,
  projectRegistry,
  sessionManager,
  fileWatcher,
  diffProvider,
  prCreator,
  viewStateStore,
  shellTabStore,
  gitOps,
  branchCheckout,
  dockLayoutStore,
  searchViewStore,
  backgroundAgentHost,
  loopRunner,
  chatAdapter,
  chatStore,
  memoryStore,
  superagentManager,
  approvalBroker,
  watchRunStore,
  verdictStore,
  verdictRecorder,
}

function toggleKeepAwake(): void {
  const next = !settingsStore.getSettings().keepAwake
  settingsStore.updateSettings({ keepAwake: next })
  if (next) {
    powerManager.enable()
  } else {
    powerManager.disable()
  }
  if (mainWindow) {
    rebuildAppMenu(mainWindow, { keepAwake: next, onToggleKeepAwake: toggleKeepAwake })
  }
}

function doCreateWindow(): void {
  const win = createWindow({
    getSettings: () => settingsStore.getSettings(),
    wireMainWindow: (w) => {
      sessionManager.setMainWindow(w)
      fileWatcher.setMainWindow(w)
    },
    ipcDeps,
    onToggleKeepAwake: toggleKeepAwake,
  })
  mainWindow = win
  win.on('closed', () => { mainWindow = null })
}

const modeSwitcher = new ModeSwitcher({ settingsStore, sessionManager, projectRegistry, chatStore })
modeSwitcher.register(
  doCreateWindow,
  () => mainWindow,
  (win) => { mainWindow = win }
)

// ── App lifecycle ────────────────────────────────────────────────────
registerAppLifecycle({
  settingsStore,
  powerManager,
  mcpBridge,
  memoryStore,
  sessionManager,
  ptyPool,
  fileWatcher,
  chatStore,
  createWindow: doCreateWindow,
})

function formatApprovalRequestedMessage(req: ApprovalRequest): string {
  return [
    '',
    `[Manifold approval required] ${req.toolName} ${JSON.stringify(req.args)}`,
    'Approve this in the Approval Inbox below, or enable auto-approve for this superagent.',
    '',
  ].join('\r\n')
}

function formatApprovalResolvedMessage(
  req: ApprovalRequest,
  decision: ApprovalResponse['decision'],
): string {
  const label = decision === 'approve-all'
    ? 'approved; auto-approve enabled for subsequent tool calls.'
    : decision === 'approve'
      ? 'approved.'
      : 'denied.'
  return [
    '',
    `[Manifold approval ${label}] ${req.toolName}`,
    '',
  ].join('\r\n')
}
