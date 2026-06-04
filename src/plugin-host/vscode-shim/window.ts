// src/plugin-host/vscode-shim/window.ts
import { notImplemented } from './types'

interface HostMessagesProxy {
  $showMessage(level: 'info' | 'warning' | 'error', message: string, items: string[]): Promise<string | undefined>
}

export function createShimWindow(host: HostMessagesProxy): Record<string, unknown> {
  const show = (level: 'info' | 'warning' | 'error') =>
    (message: string, ...items: unknown[]): Promise<string | undefined> =>
      host.$showMessage(level, message, items.filter((i): i is string => typeof i === 'string'))
  return {
    showInformationMessage: show('info'),
    showWarningMessage: show('warning'),
    showErrorMessage: show('error'),
    // Deferred surface — present so references resolve, but throws when called.
    createTreeView: notImplemented('window.createTreeView'),
    registerTreeDataProvider: notImplemented('window.registerTreeDataProvider'),
    createWebviewPanel: notImplemented('window.createWebviewPanel'),
    registerWebviewViewProvider: notImplemented('window.registerWebviewViewProvider'),
    showQuickPick: notImplemented('window.showQuickPick'),
    showInputBox: notImplemented('window.showInputBox'),
    createStatusBarItem: notImplemented('window.createStatusBarItem'),
    withProgress: notImplemented('window.withProgress'),
    createOutputChannel: notImplemented('window.createOutputChannel'),
  }
}
