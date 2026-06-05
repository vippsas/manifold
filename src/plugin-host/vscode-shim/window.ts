// src/plugin-host/vscode-shim/window.ts
import { notImplemented } from './types'

interface HostMessagesProxy {
  $showMessage(level: 'info' | 'warning' | 'error', message: string, items: string[]): Promise<string | undefined>
}

interface RealWindowApi {
  registerWebviewViewProvider(viewId: string, provider: unknown): { dispose(): void }
  registerTreeDataProvider(viewId: string, provider: unknown): { dispose(): void }
  createTreeView(viewId: string, options: unknown): { dispose(): void }
}

export function createShimWindow(host: HostMessagesProxy, windowApi: RealWindowApi): Record<string, unknown> {
  const show = (level: 'info' | 'warning' | 'error') =>
    (message: string, ...items: unknown[]): Promise<string | undefined> =>
      host.$showMessage(level, message, items.filter((i): i is string => typeof i === 'string'))
  return {
    showInformationMessage: show('info'),
    showWarningMessage: show('warning'),
    showErrorMessage: show('error'),
    registerWebviewViewProvider: (viewId: string, provider: unknown) => windowApi.registerWebviewViewProvider(viewId, provider),
    registerTreeDataProvider: (viewId: string, provider: unknown) => windowApi.registerTreeDataProvider(viewId, provider),
    createTreeView: (viewId: string, options: unknown) => windowApi.createTreeView(viewId, options),
    createWebviewPanel: notImplemented('window.createWebviewPanel'),
    showQuickPick: notImplemented('window.showQuickPick'),
    showInputBox: notImplemented('window.showInputBox'),
    createStatusBarItem: notImplemented('window.createStatusBarItem'),
    withProgress: notImplemented('window.withProgress'),
    createOutputChannel: notImplemented('window.createOutputChannel'),
  }
}
