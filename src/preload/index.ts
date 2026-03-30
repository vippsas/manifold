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
  'provisioning:list-templates',
  'provisioning:refresh-templates',
  'provisioning:get-statuses',
  'provisioning:check-health',
  'provisioning:create',
  'agent:spawn',
  'agent:kill',
  'agent:interrupt',
  'agent:input',
  'agent:resize',
  'agent:sessions',
  'agent:resume',
  'agent:replay',
  'files:tree',
  'files:tree-dir',
  'files:read',
  'files:write',
  'files:delete',
  'files:rename',
  'files:create-file',
  'files:create-dir',
  'files:import',
  'files:reveal',
  'files:open-terminal',
  'files:dir-branch',
  'files:search-content',
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
  'dock-layout:get',
  'dock-layout:set',
  'font:load-data',
  'app:beep',
  'app:version',
  'updater:install',
  'updater:check',
  'app:switch-mode',
  'app:consume-pending-launch',
  'memory:search',
  'memory:get',
  'memory:timeline',
  'memory:stats',
  'memory:delete',
  'memory:clear',
  'memory:settings',
  'search:context',
  'search:view-state:get',
  'search:view-state:set',
  'search:query',
  'search:ask',
  'background-agent:list-suggestions',
  'background-agent:refresh',
  'background-agent:feedback',
  'background-agent:get-status',
] as const

const ALLOWED_SEND_CHANNELS = [
  'theme:changed',
] as const

const ALLOWED_LISTEN_CHANNELS = [
  'agent:output',
  'agent:activity',
  'agent:status',
  'agent:exit',
  'agent:sessions-changed',
  'agent:dirs-changed',
  'files:changed',
  'files:tree-changed',
  'settings:changed',
  'agent:conflicts',
  'show-about',
  'show-settings',
  'updater:status',
  'view:toggle-panel',
  'view:show-search',
  'preview:url-detected',
  'app:auto-spawn',
  'provisioning:progress',
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
