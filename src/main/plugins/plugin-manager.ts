// src/main/plugins/plugin-manager.ts
import type { PluginDescriptor } from '../../shared/plugins/manifest'
import type { PanelContribution } from '../../shared/plugins/contributions'
import { scanPluginDir } from './scanner'
import { getBundledPluginsDir, getUserPluginsDir } from './plugin-paths'
import { debugLog } from '../app/debug-log'
import { ExtensionHost } from './extension-host'
import { PluginStorageStore } from './plugin-storage-store'
import { webviewContentStore } from './webview-content-store'
import { createAgentControlService } from './agent-control-service'
import { createLmService } from './lm-service'
import { createAgentSpawnService } from './agent-spawn-service'
import { createWorktreeOverviewService, type WorktreeOverviewService } from './worktree-overview-service'
import { summarizeWorktrees } from './dashboard-summary'
import type { WorktreesSummary } from '../../shared/dashboard-types'
import { getWorktreeDirty, getWorktreeLastCommitISO } from '../git/worktree-status'
import { listMergedBranches, listWorktreeBranches, getBranchDates, deleteMergedBranch } from '../git/branch-status'
import { readWorktreeMeta } from '../git/worktree-meta'
import type { SessionManager } from '../session/session-manager'
import type { GitOperationsManager } from '../git/git-operations'
import type { WorktreeManager } from '../git/worktree-manager'
import type { ProjectRegistry } from '../store/project-registry'
import type { VerdictStore } from '../store/verdict-store'
import type { SessionInfo } from '../../shared/plugins/api-types'
import * as fs from 'node:fs'

export interface PluginPanelContribution extends PanelContribution {
  pluginId: string
}

/** Pure: flatten plugin view contributions into renderer PanelContributions. */
export function viewContributionsOf(plugins: PluginDescriptor[]): PluginPanelContribution[] {
  const out: PluginPanelContribution[] = []
  for (const p of plugins) {
    for (const v of p.manifest.contributes?.views ?? []) {
      out.push({
        id: v.id,
        title: v.title,
        description: v.description ?? '',
        launcher: v.launcher ?? false,
        source: 'plugin',
        pluginId: p.id,
        kind: v.type === 'tree' ? 'tree' : 'webview',
      })
    }
  }
  return out
}

/** Pure: collect each view's manifest-declared frameSources, keyed by view id
 *  (empty array when a view declares none, so stale registrations clear on rescan). */
export function frameSourcesOf(plugins: PluginDescriptor[]): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = []
  for (const p of plugins) {
    for (const v of p.manifest.contributes?.views ?? []) {
      out.push([v.id, v.frameSources ?? []])
    }
  }
  return out
}

/** Pure helper: user override wins; falls back to manifest default; undefined when neither. */
export function mergeConfigValue(override: unknown, manifestDefault: unknown): unknown {
  return override !== undefined ? override : manifestDefault
}

export class PluginManager {
  private plugins: PluginDescriptor[] = []
  private readonly host: ExtensionHost
  private readonly worktreeOverview: WorktreeOverviewService

  constructor(
    private readonly storagePath: string,
    private readonly settings: import('../store/settings-store').SettingsStore,
    private readonly sessionManager: SessionManager,
    gitOps: GitOperationsManager,
    worktreeManager: WorktreeManager,
    projectRegistry: ProjectRegistry,
    verdictStore: VerdictStore,
  ) {
    const agentControl = createAgentControlService(this.sessionManager)
    const lm = createLmService(this.sessionManager, gitOps)
    const agentSpawn = createAgentSpawnService(this.sessionManager)
    const worktreeOverview = this.worktreeOverview = createWorktreeOverviewService({
      listProjects: () => projectRegistry.listProjects(),
      listSessions: () => this.sessionManager.listSessions(),
      listWorktrees: (p) => worktreeManager.listWorktrees(p),
      getAheadBehind: (wt, base) => gitOps.getAheadBehind(wt, base),
      getDirty: (wt) => getWorktreeDirty(wt),
      getLastCommitISO: (wt) => getWorktreeLastCommitISO(wt),
      readMeta: (wt) => readWorktreeMeta(wt),
      removeWorktree: (proj, wt) => worktreeManager.removeWorktree(proj, wt),
      pathExists: (p) => fs.existsSync(p),
      listMergedBranches: (proj, base) => listMergedBranches(proj, base),
      listWorktreeBranches: (proj) => listWorktreeBranches(proj),
      getBranchDates: (proj) => getBranchDates(proj),
      deleteMergedBranch: (proj, branch) => deleteMergedBranch(proj, branch),
    })
    this.host = new ExtensionHost(new PluginStorageStore(storagePath), agentControl, lm, agentSpawn, worktreeOverview, verdictStore)
    this.host.setConfigResolver((id, key) => this.getConfigValue(id, key))
    this.host.setEnabledResolver((id) => this.isEnabled(id))
    this.host.setOriginResolver((id) => this.plugins.find((p) => p.id === id)?.origin)
    this.host.setTranscriptionResolver(() => this.settings.getSettings().transcription)
  }

  /** Headline numbers for the global Worktrees dashboard card. */
  async getWorktreesSummary(): Promise<WorktreesSummary> {
    const [entries, cleanable] = await Promise.all([
      this.worktreeOverview.list(),
      this.worktreeOverview.listMergedOrphanBranches(),
    ])
    return summarizeWorktrees(entries, cleanable)
  }

  isEnabled(pluginId: string): boolean {
    return !(this.settings.getSettings().disabledPlugins ?? []).includes(pluginId)
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    const cur = this.settings.getSettings().disabledPlugins ?? []
    const next = enabled ? cur.filter((id) => id !== pluginId) : Array.from(new Set([...cur, pluginId]))
    this.settings.updateSettings({ disabledPlugins: next })
    // Disabling must actually tear the plugin down — run its deactivate() so subscriptions
    // (commands, workspace/config/tree listeners) and its require('manifold') API frame are
    // disposed in the host. Fire-and-forget: the IPC reply needn't await the host round-trip.
    if (!enabled) void this.host.deactivate(pluginId).catch((err) => debugLog(`[plugins] deactivate("${pluginId}") failed: ${err instanceof Error ? err.message : String(err)}`))
  }

  getConfigValue(pluginId: string, key: string): unknown {
    const override = this.settings.getSettings().pluginConfig?.[pluginId]?.[key]
    const plugin = this.plugins.find((p) => p.id === pluginId)
    const manifestDefault = plugin?.manifest.contributes?.configuration?.properties?.[key]?.default
    return mergeConfigValue(override, manifestDefault)
  }

  getConfig(pluginId: string): { properties: Record<string, unknown>; values: Record<string, unknown> } {
    const plugin = this.plugins.find((p) => p.id === pluginId)
    const properties = plugin?.manifest.contributes?.configuration?.properties ?? {}
    const values: Record<string, unknown> = {}
    for (const key of Object.keys(properties)) values[key] = this.getConfigValue(pluginId, key)
    return { properties, values }
  }

  setConfig(pluginId: string, key: string, value: unknown): void {
    const current = this.settings.getSettings().pluginConfig ?? {}
    const pluginValues = { ...(current[pluginId] ?? {}), [key]: value }
    this.settings.updateSettings({ pluginConfig: { ...current, [pluginId]: pluginValues } })
    this.host.notifyConfigChanged(pluginId)
  }

  /** Discover built-in + user plugins. Errors are logged and skipped. */
  scan(): void {
    const builtin = scanPluginDir(getBundledPluginsDir(), 'builtin')
    const user = scanPluginDir(getUserPluginsDir(this.storagePath), 'user')
    this.plugins = [...builtin.plugins, ...user.plugins]
    // Register manifest-declared frameSources so the manifold-webview protocol can
    // widen CSP frame-src for exactly these views (see webview-protocol buildCsp).
    for (const [viewId, sources] of frameSourcesOf(this.plugins)) {
      webviewContentStore.setFrameSources(viewId, sources)
    }
    for (const e of [...builtin.errors, ...user.errors]) {
      debugLog(`[plugins] skipped ${e.path}: ${e.error}`)
    }
    debugLog(`[plugins] discovered ${this.plugins.length} plugin(s)`)
  }

  listPlugins(): PluginDescriptor[] {
    return this.plugins
  }

  listViewContributions(): PluginPanelContribution[] {
    return viewContributionsOf(this.plugins.filter((p) => this.isEnabled(p.id)))
  }

  async activate(pluginId: string): Promise<void> {
    const p = this.plugins.find((x) => x.id === pluginId)
    if (!p || !p.manifest.main || !this.isEnabled(p.id)) return
    await this.host.activate({ id: p.id, root: p.root, main: p.manifest.main, kind: p.kind, capabilities: p.manifest.capabilities ?? [], origin: p.origin })
  }

  executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
    return this.host.executeContributedCommand(id, args)
  }

  setMainWindow(win: import('electron').BrowserWindow): void {
    this.host.setSend((channel, ...args) => { if (!win.isDestroyed()) win.webContents.send(channel, ...args) })
  }

  async openView(viewId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (!plugin || !plugin.manifest.main || !this.isEnabled(plugin.id)) { debugLog(`[plugins] openView("${viewId}"): no enabled plugin owns this view`); return }
    await this.host.resolveView({ id: plugin.id, root: plugin.root, main: plugin.manifest.main, kind: plugin.kind, capabilities: plugin.manifest.capabilities ?? [], origin: plugin.origin }, viewId)
  }

  async openTreeView(viewId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (!plugin || !plugin.manifest.main || !this.isEnabled(plugin.id)) { debugLog(`[plugins] openTreeView("${viewId}"): no enabled plugin owns this view`); return }
    await this.host.activate({ id: plugin.id, root: plugin.root, main: plugin.manifest.main, kind: plugin.kind, capabilities: plugin.manifest.capabilities ?? [], origin: plugin.origin })
  }

  async treeGetChildren(viewId: string, parentNodeId: string | undefined): Promise<unknown> {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (!plugin || !plugin.manifest.main || !this.isEnabled(plugin.id)) { debugLog(`[plugins] treeGetChildren("${viewId}"): no enabled plugin owns this view`); return [] }
    return this.host.treeGetChildren({ id: plugin.id, root: plugin.root, main: plugin.manifest.main, kind: plugin.kind, capabilities: plugin.manifest.capabilities ?? [], origin: plugin.origin }, viewId, parentNodeId)
  }

  deliverWebviewMessage(viewId: string, message: unknown): void {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (plugin && !this.isEnabled(plugin.id)) { debugLog(`[plugins] deliverWebviewMessage("${viewId}"): owning plugin is disabled`); return }
    this.host.deliverWebviewMessage(viewId, message)
  }

  resolveUiResponse(requestId: string, value: unknown): void { this.host.resolveUi(requestId, value) }

  /** Tear down the plugin host (kills the forked utility process and settles pending RPC/UI).
   *  Wired into app before-quit so the host child doesn't orphan on shutdown. */
  dispose(): void { this.host.dispose() }

  setActiveContext(context: { project?: unknown; session?: SessionInfo }): void {
    let session = context.session
    if (session?.id) {
      const internal = this.sessionManager.getSession(session.id)
      if (internal?.worktreePath) session = { ...session, worktreePath: internal.worktreePath }
      // Runtime drives the skill-invocation syntax a plugin types into the
      // agent (Claude Code's `/plugin:command` vs Codex's `$skill`).
      if (internal?.runtimeId) session = { ...session, runtimeId: internal.runtimeId }
    }
    this.host.setActiveContext({ ...context, session })
  }
}
