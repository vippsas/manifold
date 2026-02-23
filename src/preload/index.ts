import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_INVOKE_CHANNELS = [
  'projects:list',
  'projects:add',
  'projects:remove',
  'projects:update',
  'projects:open-dialog',
  'projects:clone',
  'agent:spawn',
  'agent:kill',
  'agent:input',
  'agent:resize',
  'agent:sessions',
  'agent:resume',
  'agent:replay',
  'files:tree',
  'files:read',
  'files:write',
  'files:delete',
  'diff:get',
  'diff:file-original',
  'pr:create',
  'runtimes:list',
  'settings:get',
  'settings:update',
  'branch:suggest',
  'shell:create',
  'shell:kill',
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
  'app:beep',
  'app:version',
  'updater:install',
  'updater:check',
] as const

const ALLOWED_SEND_CHANNELS = [
  'theme:changed',
] as const

const ALLOWED_LISTEN_CHANNELS = [
  'agent:output',
  'agent:status',
  'agent:exit',
  'files:changed',
  'settings:changed',
  'agent:conflicts',
  'show-about',
  'updater:status',
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
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
