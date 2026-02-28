import { BrowserWindow, Menu } from 'electron'

export function buildAppMenu(mainWindow: BrowserWindow): Menu {
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
          label: 'Settings\u2026',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('show-settings'),
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
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Projects',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'projects'),
        },
        {
          label: 'Toggle Agent',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'agent'),
        },
        {
          label: 'Toggle Editor',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'editor'),
        },
        {
          label: 'Toggle Files',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'fileTree'),
        },
        {
          label: 'Toggle Modified Files',
          accelerator: 'CmdOrCtrl+5',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'modifiedFiles'),
        },
        {
          label: 'Toggle Shell',
          accelerator: 'CmdOrCtrl+6',
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
