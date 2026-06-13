import { BrowserWindow, Menu } from 'electron'
import { COMMANDS, type MenuSectionId } from '../../shared/commands/catalog'

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

  // Every command in the catalog renders as a menu item that fires the single
  // `command:run` IPC channel — the renderer's useCommands hook dispatches it.
  const commandItems = (section: MenuSectionId): Electron.MenuItemConstructorOptions[] =>
    COMMANDS.filter((c) => c.menu?.section === section)
      .slice()
      .sort((a, b) => (a.menu?.order ?? 0) - (b.menu?.order ?? 0))
      .map((c) => ({
        label: c.title,
        accelerator: c.accelerator,
        click: () => send('command:run', c.id),
      }))

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Manifold',
      submenu: [
        ...commandItems('manifold').filter((i) => i.label === 'About Manifold'),
        { type: 'separator' },
        { label: "What's New", click: () => send('show-update-log') },
        { label: 'Check for Updates...', click: () => send('show-update-check') },
        ...commandItems('manifold').filter((i) => i.label !== 'About Manifold'),
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
        ...commandItems('edit'),
      ],
    },
    {
      label: 'View',
      submenu: [
        ...commandItems('view'),
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
    { label: 'Go', submenu: commandItems('go') },
    { label: 'Agent', submenu: commandItems('agent') },
    { label: 'Source Control', submenu: commandItems('scm') },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    { role: 'help', submenu: commandItems('help') },
  ]
  return Menu.buildFromTemplate(menuTemplate)
}
