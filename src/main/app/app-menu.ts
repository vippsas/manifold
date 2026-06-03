import { BrowserWindow, Menu } from 'electron'

export interface AppMenuOptions {
  keepAwake: boolean
  onToggleKeepAwake: () => void
}

export function buildAppMenu(mainWindow: BrowserWindow, options: AppMenuOptions): Menu {
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Manifold',
      submenu: [
        {
          label: 'About Manifold',
          click: () => mainWindow?.webContents.send('show-about'),
        },
        { type: 'separator' },
        {
          label: "What's New",
          click: () => mainWindow?.webContents.send('show-update-log'),
        },
        {
          label: 'Check for Updates...',
          click: () => mainWindow?.webContents.send('show-update-check'),
        },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('show-settings'),
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
          click: () => mainWindow?.webContents.send('view:show-search'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Projects',
          accelerator: 'CmdOrCtrl+Alt+1',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'projects'),
        },
        {
          label: 'Toggle Agent',
          accelerator: 'CmdOrCtrl+Alt+2',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'agent'),
        },
        {
          label: 'Toggle Editor',
          accelerator: 'CmdOrCtrl+Alt+3',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'editor'),
        },
        {
          label: 'Toggle Files',
          accelerator: 'CmdOrCtrl+Alt+4',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'fileTree'),
        },
        {
          label: 'Toggle Modified Files',
          accelerator: 'CmdOrCtrl+Alt+5',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'modifiedFiles'),
        },
        {
          label: 'Toggle Shell',
          accelerator: 'CmdOrCtrl+Alt+6',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'shell'),
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
        click: () => mainWindow?.webContents.send('view:jump-favorite', i),
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
