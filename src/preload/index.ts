import { contextBridge, ipcRenderer, webUtils } from 'electron'

const ALLOWED_INVOKE_CHANNELS = [
  'projects:list',
  'projects:add',
  'projects:remove',
  'projects:update',
  'projects:open-dialog',
  'projects:clone',
  'projects:clone-dialog',
  'projects:create-new',
  'projects:create-new-dialog',
  'provisioning:list-templates',
  'provisioning:refresh-templates',
  'provisioning:get-statuses',
  'provisioning:check-health',
  'provisioning:create',
  'agent:spawn',
  'agent:kill',
  'agent:kill-worktree',
  'agent:delete-app',
  'agent:start-dev-server',
  'agent:interrupt',
  'agent:input',
  'chat:save-pasted-image',
  'chat:read-pasted-image',
  'agent:resize',
  'agent:rename',
  'agent:set-locked',
  'agent:sessions',
  'agent:resume',
  'agent:replay',
  'files:tree',
  'files:tree-dir',
  'files:tree-by-project',
  'files:read',
  'files:read-data-url',
  'files:write',
  'files:delete',
  'files:rename',
  'files:create-file',
  'files:create-dir',
  'files:import',
  'files:paste-image',
  'files:paste-clipboard-image',
  'files:reveal',
  'files:open-terminal',
  'files:dir-branch',
  'files:search-content',
  'files:list',
  'diff:get',
  'diff:file-original',
  'pr:create',
  'runtimes:list',
  'ollama:list-models',
  'settings:get',
  'settings:update',
  'branch:suggest',
  'shell:create',
  'shell:kill',
  'shell:predict-suggestion',
  'shell:accept-suggestion',
  'shell:dismiss-suggestion',
  'storage:open-dialog',
  'view-state:get',
  'view-state:set',
  'view-state:delete',
  'shell-tabs:get',
  'shell-tabs:set',
  'git:commit',
  'git:ai-generate',
  'git:ahead-behind',
  'git:resolve-conflict',
  'git:pr-context',
  'git:list-branches',
  'git:list-prs',
  'git:fetch-pr-branch',
  'git:fetch',
  'git:staleness',
  'dock-layout:get',
  'dock-layout:set',
  'font:load-data',
  'app:beep',
  'app:version',
  'updater:install',
  'updater:check',
  'updater:log',
  'updater:clear-log',
  'release-notes:get',
  'release-notes:open-external',
  'app:switch-mode',
  'app:consume-pending-launch',
  'memory:search',
  'memory:get',
  'memory:timeline',
  'memory:stats',
  'memory:delete',
  'memory:clear',
  'memory:settings',
  'verdicts:list',
  'verdicts:get',
  'search:context',
  'search:view-state:get',
  'search:view-state:set',
  'search:query',
  'search:ask',
  'workspace:list',
  'workspace:create',
  'workspace:remove',
  'workspace:add-project',
  'workspace:remove-project',
  'workspace:spawn-agent',
  'simple:chat-messages',
  'simple:send-message',
  'simple:subscribe-chat',
  'simple:get-preview-url',
  'simple:get-agent-status',
  'simple:get-slash-commands',
  'plugins:list-contributions',
  'plugins:list',
  'plugins:activate',
  'plugins:execute-command',
  'plugins:open-view',
  'plugins:webview-to-host',
  'plugins:set-active-context',
  'plugins:get-config',
  'plugins:set-config',
  'plugins:open-tree-view',
  'plugins:tree-get-children',
  'plugins:ui-response',
  'plugins:set-enabled',
] as const

const ALLOWED_SEND_CHANNELS = [
  'theme:changed',
] as const

const ALLOWED_LISTEN_CHANNELS = [
  'agent:output',
  'agent:activity',
  'agent:activity-state',
  'agent:status',
  'agent:slash-commands',
  'agent:exit',
  'agent:sessions-changed',
  'agent:dirs-changed',
  'files:changed',
  'files:tree-changed',
  'settings:changed',
  'agent:conflicts',
  'show-about',
  'show-settings',
  'show-update-log',
  'show-update-check',
  'updater:status',
  'view:toggle-panel',
  'view:show-search',
  'view:jump-favorite',
  'preview:url-detected',
  'app:auto-spawn',
  'provisioning:progress',
  'workspace:list-changed',
  'simple:chat-message',
  'plugins:webview-html',
  'plugins:webview-message',
  'plugins:tree-refresh',
  'plugins:ui-request',
  'plugins:contributions-changed',
  'plugins:reveal-session',
] as const

type InvokeChannel = (typeof ALLOWED_INVOKE_CHANNELS)[number]
type SendChannel = (typeof ALLOWED_SEND_CHANNELS)[number]
type ListenChannel = (typeof ALLOWED_LISTEN_CHANNELS)[number]

function isAllowedInvokeChannel(channel: string): channel is InvokeChannel {
  return (ALLOWED_INVOKE_CHANNELS as readonly string[]).includes(channel)
}

function isAllowedSendChannel(channel: string): channel is SendChannel {
  return (ALLOWED_SEND_CHANNELS as readonly string[]).includes(channel)
}

function isAllowedListenChannel(channel: string): channel is ListenChannel {
  return (ALLOWED_LISTEN_CHANNELS as readonly string[]).includes(channel)
}

type IpcCallback = (...args: unknown[]) => void

const electronAPI = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!isAllowedInvokeChannel(channel)) {
      return Promise.reject(new Error(`IPC invoke channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  send(channel: string, ...args: unknown[]): void {
    if (isAllowedSendChannel(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },

  on(channel: string, callback: IpcCallback): () => void {
    if (!isAllowedListenChannel(channel)) {
      return () => {}
    }
    const wrappedCallback = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      callback(...args)
    }
    ipcRenderer.on(channel, wrappedCallback)
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback)
    }
  },

  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
