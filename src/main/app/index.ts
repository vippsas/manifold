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
import { setupAutoUpdater } from './auto-updater'
import { ModeSwitcher } from './mode-switcher'
import { createWindow } from './window-factory'
import { MemoryStore } from '../memory/memory-store'
import { MemoryCapture } from '../memory/memory-capture'
import { MemoryCompressor } from '../memory/memory-compressor'
import { MemoryInjector } from '../memory/memory-injector'
import { VercelHealthCheck } from '../deploy/vercel-health-check'
import { LoopRunner } from '../loop/loop-runner'
import {
  createSessionAdapter,
  createGitAdapter,
  createEvalRunner,
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

let mainWindow: BrowserWindow | null = null

// ── Module instances ─────────────────────────────────────────────────
const settingsStore = new SettingsStore()
const projectRegistry = new ProjectRegistry()
const worktreeManager = new WorktreeManager(settingsStore.getSettings().storagePath)
const branchCheckout = new BranchCheckoutManager(settingsStore.getSettings().storagePath)
const ptyPool = new PtyPool()
const fileWatcher = new FileWatcher()
const sessionManager = new SessionManager(worktreeManager, ptyPool, projectRegistry, branchCheckout, fileWatcher)
const diffProvider = new DiffProvider()

// ── Superagent modules ───────────────────────────────────────────────
const manifoldHome = path.join(app.getPath('home'), '.manifold')
const superagentStore = new SuperagentStore(path.join(manifoldHome, 'superagents.json'))
const approvalBroker = new ApprovalBroker({
  emit: (req) => { mainWindow?.webContents.send('superagent:approval-request', req) },
  onAutoApprove: (id) => { superagentManagerRef?.setAutoApprove(id, true) },
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

const vercelHealthCheck = new VercelHealthCheck()

const loopRunner = new LoopRunner({
  session: createSessionAdapter(sessionManager),
  git: createGitAdapter(),
  evalRunner: createEvalRunner(),
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
  vercelHealthCheck,
  superagentManager,
  approvalBroker,
}

function doCreateWindow(): void {
  const win = createWindow({
    getSettings: () => settingsStore.getSettings(),
    wireMainWindow: (w) => {
      sessionManager.setMainWindow(w)
      fileWatcher.setMainWindow(w)
    },
    ipcDeps,
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
app.whenReady().then(async () => {
  doCreateWindow()
  setupAutoUpdater()

  try {
    await mcpBridge.start()
  } catch (err) {
    console.error('Failed to start MCP bridge:', err)
  }

  try {
    const settings = settingsStore.getSettings()
    memoryStore.pruneAll(settings.memory?.rawRetentionDays ?? 30)
  } catch {
    // Best-effort pruning
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      doCreateWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  // Kill all active sessions and clean up
  sessionManager.killAllSessions()
  ptyPool.killAll()
  await fileWatcher.unwatchAll()
  memoryStore.close()
})
