import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_INVOKE_CHANNELS = [
  'projects:list',
  'projects:add',
  'projects:update',
  'projects:open-dialog',
  'projects:clone',
  'provisioning:list-templates',
  'provisioning:refresh-templates',
  'provisioning:get-statuses',
  'provisioning:check-health',
  'provisioning:create',
  'agent:spawn',
  'agent:kill',
  'agent:interrupt',
  'agent:delete-app',
  'agent:start-dev-server',
  'agent:input',
  'chat:save-pasted-image',
  'agent:resize',
  'agent:sessions',
  'agent:replay',
  'settings:get',
  'settings:update',
  'app:version',
  'updater:install',
  'updater:check',
  'updater:log',
  'updater:clear-log',
  'release-notes:get',
  'release-notes:open-external',
  'simple:chat-messages',
  'simple:get-preview-url',
  'simple:get-agent-status',
  'simple:subscribe-chat',
  'simple:deploy',
  'simple:deploy-status',
  'simple:deploy-install-cli',
  'simple:deploy-login',
  'app:switch-mode',
  'app:consume-pending-launch',
  'simple:send-message',
] as const

const ALLOWED_SEND_CHANNELS = [
  'theme:changed',
] as const

const ALLOWED_LISTEN_CHANNELS = [
  'agent:status',
  'agent:exit',
  'simple:chat-message',
  'simple:deploy-status-update',
  'preview:url-detected',
  'updater:status',
  'show-about',
  'show-settings',
  'show-update-log',
  'show-update-check',
  'settings:changed',
  'app:auto-open-app',
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
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
