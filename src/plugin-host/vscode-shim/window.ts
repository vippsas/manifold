// src/plugin-host/vscode-shim/window.ts
import { notImplemented } from './types'
import type { QuickPickItem, QuickPickOptions, InputBoxOptions } from '../../shared/plugins/ui'

export interface RealWindowApi {
  registerWebviewViewProvider(viewId: string, provider: unknown): { dispose(): void }
  registerTreeDataProvider(viewId: string, provider: unknown): { dispose(): void }
  createTreeView(viewId: string, options: unknown): { dispose(): void }
  showInformationMessage(message: string, ...actions: string[]): Promise<string | undefined>
  showWarningMessage(message: string, ...actions: string[]): Promise<string | undefined>
  showErrorMessage(message: string, ...actions: string[]): Promise<string | undefined>
  showQuickPick(items: ReadonlyArray<string | QuickPickItem>, options?: QuickPickOptions): Promise<QuickPickItem | string | undefined>
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>
}

export function createShimWindow(windowApi: RealWindowApi): Record<string, unknown> {
  return {
    showInformationMessage: (message: string, ...items: unknown[]) =>
      windowApi.showInformationMessage(message, ...items.filter((i): i is string => typeof i === 'string')),
    showWarningMessage: (message: string, ...items: unknown[]) =>
      windowApi.showWarningMessage(message, ...items.filter((i): i is string => typeof i === 'string')),
    showErrorMessage: (message: string, ...items: unknown[]) =>
      windowApi.showErrorMessage(message, ...items.filter((i): i is string => typeof i === 'string')),
    registerWebviewViewProvider: (viewId: string, provider: unknown) => windowApi.registerWebviewViewProvider(viewId, provider),
    registerTreeDataProvider: (viewId: string, provider: unknown) => windowApi.registerTreeDataProvider(viewId, provider),
    createTreeView: (viewId: string, options: unknown) => windowApi.createTreeView(viewId, options),
    createWebviewPanel: notImplemented('window.createWebviewPanel'),
    showQuickPick: (items: ReadonlyArray<string | QuickPickItem>, options?: QuickPickOptions) => windowApi.showQuickPick(items, options),
    showInputBox: (options?: InputBoxOptions) => windowApi.showInputBox(options),
    createStatusBarItem: notImplemented('window.createStatusBarItem'),
    withProgress: notImplemented('window.withProgress'),
    createOutputChannel: notImplemented('window.createOutputChannel'),
  }
}
