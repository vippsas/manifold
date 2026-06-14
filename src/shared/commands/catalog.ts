/**
 * The single source of truth for Manifold's commands. Both the native menu
 * (main process, src/main/app/app-menu.ts) and the renderer (useCommands, the
 * command palette, and the shortcuts cheat-sheet) are generated from this list.
 *
 * Pure data only — no behavior. The renderer maps each `id` to a handler in
 * src/renderer/commands/command-handlers.ts; the menu maps each `id` to a
 * `command:run` IPC send. Keys are de-conflicted against Electron roles, Monaco
 * bindings (Cmd+/, Cmd+Shift+O, Ctrl+G) and macOS conventions — see the design
 * spec docs/superpowers/specs/2026-06-14-keyboard-command-registry-design.md.
 */

export const COMMAND_CATEGORIES = [
  'General',
  'Navigation',
  'Agents',
  'Source Control',
  'View',
  'Help',
] as const
export type CommandCategory = (typeof COMMAND_CATEGORIES)[number]

export const MENU_SECTIONS = ['manifold', 'edit', 'view', 'go', 'agent', 'scm', 'help'] as const
export type MenuSectionId = (typeof MENU_SECTIONS)[number]

export interface CommandDef {
  id: string
  title: string
  category: CommandCategory
  /** Electron accelerator string; omitted commands are reachable via the palette. */
  accelerator?: string
  /** Where the command appears in the native menu; omitted = palette-only. */
  menu?: { section: MenuSectionId; order: number }
}

const RAW_COMMANDS = [
  // General
  { id: 'general.settings', title: 'Settings…', category: 'General', accelerator: 'CmdOrCtrl+,', menu: { section: 'manifold', order: 10 } },
  { id: 'general.commandPalette', title: 'Command Palette…', category: 'General', accelerator: 'CmdOrCtrl+Shift+P', menu: { section: 'go', order: 20 } },

  // Navigation
  { id: 'navigation.quickOpenFile', title: 'Quick Open File…', category: 'Navigation', accelerator: 'CmdOrCtrl+P', menu: { section: 'go', order: 10 } },
  { id: 'navigation.findInFiles', title: 'Find in Files', category: 'Navigation', accelerator: 'CmdOrCtrl+Shift+F', menu: { section: 'edit', order: 10 } },
  { id: 'navigation.favorite.1', title: 'Jump to Favorite 1', category: 'Navigation', accelerator: 'CmdOrCtrl+1', menu: { section: 'go', order: 31 } },
  { id: 'navigation.favorite.2', title: 'Jump to Favorite 2', category: 'Navigation', accelerator: 'CmdOrCtrl+2', menu: { section: 'go', order: 32 } },
  { id: 'navigation.favorite.3', title: 'Jump to Favorite 3', category: 'Navigation', accelerator: 'CmdOrCtrl+3', menu: { section: 'go', order: 33 } },
  { id: 'navigation.favorite.4', title: 'Jump to Favorite 4', category: 'Navigation', accelerator: 'CmdOrCtrl+4', menu: { section: 'go', order: 34 } },
  { id: 'navigation.favorite.5', title: 'Jump to Favorite 5', category: 'Navigation', accelerator: 'CmdOrCtrl+5', menu: { section: 'go', order: 35 } },
  { id: 'navigation.favorite.6', title: 'Jump to Favorite 6', category: 'Navigation', accelerator: 'CmdOrCtrl+6', menu: { section: 'go', order: 36 } },
  { id: 'navigation.favorite.7', title: 'Jump to Favorite 7', category: 'Navigation', accelerator: 'CmdOrCtrl+7', menu: { section: 'go', order: 37 } },
  { id: 'navigation.favorite.8', title: 'Jump to Favorite 8', category: 'Navigation', accelerator: 'CmdOrCtrl+8', menu: { section: 'go', order: 38 } },
  { id: 'navigation.favorite.9', title: 'Jump to Favorite 9', category: 'Navigation', accelerator: 'CmdOrCtrl+9', menu: { section: 'go', order: 39 } },

  // Agents
  { id: 'agents.new', title: 'New Agent', category: 'Agents', accelerator: 'CmdOrCtrl+N', menu: { section: 'agent', order: 10 } },
  { id: 'agents.next', title: 'Next Agent', category: 'Agents', accelerator: 'CmdOrCtrl+Shift+]', menu: { section: 'agent', order: 20 } },
  { id: 'agents.previous', title: 'Previous Agent', category: 'Agents', accelerator: 'CmdOrCtrl+Shift+[', menu: { section: 'agent', order: 30 } },
  { id: 'agents.delete', title: 'Delete Agent…', category: 'Agents', menu: { section: 'agent', order: 40 } },

  // Source Control
  { id: 'scm.commit', title: 'Commit…', category: 'Source Control', accelerator: 'CmdOrCtrl+Shift+C', menu: { section: 'scm', order: 10 } },
  { id: 'scm.createPR', title: 'Create Pull Request…', category: 'Source Control', menu: { section: 'scm', order: 20 } },

  // View
  { id: 'view.toggle.projects', title: 'Toggle Projects', category: 'View', accelerator: 'CmdOrCtrl+Alt+1', menu: { section: 'view', order: 10 } },
  { id: 'view.toggle.agent', title: 'Toggle Agent', category: 'View', accelerator: 'CmdOrCtrl+Alt+2', menu: { section: 'view', order: 11 } },
  { id: 'view.toggle.editor', title: 'Toggle Editor', category: 'View', accelerator: 'CmdOrCtrl+Alt+3', menu: { section: 'view', order: 12 } },
  { id: 'view.toggle.fileTree', title: 'Toggle Files', category: 'View', accelerator: 'CmdOrCtrl+Alt+4', menu: { section: 'view', order: 13 } },
  { id: 'view.toggle.modifiedFiles', title: 'Toggle Modified Files', category: 'View', accelerator: 'CmdOrCtrl+Alt+5', menu: { section: 'view', order: 14 } },
  { id: 'view.toggle.shell', title: 'Toggle Shell', category: 'View', accelerator: 'CmdOrCtrl+Alt+6', menu: { section: 'view', order: 15 } },
  { id: 'view.worktrees', title: 'Worktrees', category: 'View', menu: { section: 'view', order: 16 } },
  { id: 'view.focusChat', title: 'Focus Chat', category: 'View', menu: { section: 'view', order: 20 } },
  { id: 'view.focusTerminal', title: 'Focus Terminal', category: 'View', accelerator: 'Ctrl+`', menu: { section: 'view', order: 21 } },
  { id: 'view.focusFiles', title: 'Focus File Tree', category: 'View', accelerator: 'CmdOrCtrl+Shift+E', menu: { section: 'view', order: 22 } },
  { id: 'view.toggleTheme', title: 'Toggle Theme', category: 'View', menu: { section: 'view', order: 30 } },

  // Help
  { id: 'help.shortcuts', title: 'Keyboard Shortcuts', category: 'Help', accelerator: 'CmdOrCtrl+Shift+/', menu: { section: 'help', order: 10 } },
  { id: 'help.about', title: 'About Manifold', category: 'Help', menu: { section: 'manifold', order: 1 } },
] as const satisfies readonly CommandDef[]

/** Derive the id union from the literal tuple, then expose the list widened to
 * CommandDef so consumers see `accelerator`/`menu` as optional fields. */
export type CommandId = (typeof RAW_COMMANDS)[number]['id']
export const COMMANDS: readonly CommandDef[] = RAW_COMMANDS

/** Panel-toggle commands map 1:1 to dock panel ids (renderer side). */
export const PANEL_TOGGLE_IDS: Record<string, string> = {
  'view.toggle.projects': 'projects',
  'view.toggle.agent': 'agent',
  'view.toggle.editor': 'editor',
  'view.toggle.fileTree': 'fileTree',
  'view.toggle.modifiedFiles': 'modifiedFiles',
  'view.toggle.shell': 'shell',
}
