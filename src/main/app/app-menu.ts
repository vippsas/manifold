import { BrowserWindow, Menu } from 'electron'

export interface AppMenuOptions {
  keepAwake: boolean
  onToggleKeepAwake: () => void
}

export function buildAppMenu(mainWindow: BrowserWindow, options: AppMenuOptions): Menu {
  // On macOS, closing the window (Cmd+W) keeps the app alive but destroys this
  // captured BrowserWindow. The reference is non-null but destroyed, so optional
  // chaining doesn't help — guard with isDestroyed() before touching webContents.
  const send = (channel: string, ...args: unknown[]): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
  }
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Manifold',
      submenu: [
        {
          label: 'About Manifold',
          click: () => send('show-about'),
        },
        { type: 'separator' },
        {
          label: "What's New",
          click: () => send('show-update-log'),
        },
        {
          label: 'Check for Updates...',
          click: () => send('show-update-check'),
        },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => send('show-settings'),
        },
        { type: 'separator' },
        {
          label: 'Keep Mac Awake',
          type: 'checkbox',
          checked: options.keepAwake,
          click: () => options.onToggleKeepAwake(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in Files',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => send('view:show-search'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Projects',
          accelerator: 'CmdOrCtrl+Alt+1',
          click: () => send('view:toggle-panel', 'projects'),
        },
        {
          label: 'Toggle Agent',
          accelerator: 'CmdOrCtrl+Alt+2',
          click: () => send('view:toggle-panel', 'agent'),
        },
        {
          label: 'Toggle Editor',
          accelerator: 'CmdOrCtrl+Alt+3',
          click: () => send('view:toggle-panel', 'editor'),
        },
        {
          label: 'Toggle Files',
          accelerator: 'CmdOrCtrl+Alt+4',
          click: () => send('view:toggle-panel', 'fileTree'),
        },
        {
          label: 'Toggle Modified Files',
          accelerator: 'CmdOrCtrl+Alt+5',
          click: () => send('view:toggle-panel', 'modifiedFiles'),
        },
        {
          label: 'Toggle Shell',
          accelerator: 'CmdOrCtrl+Alt+6',
          click: () => send('view:toggle-panel', 'shell'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Go',
      submenu: Array.from({ length: 9 }, (_, i) => ({
        label: `Jump to Favorite ${i + 1}`,
        accelerator: `CmdOrCtrl+${i + 1}`,
        click: () => send('view:jump-favorite', i),
      })),
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
  return Menu.buildFromTemplate(menuTemplate)
}
