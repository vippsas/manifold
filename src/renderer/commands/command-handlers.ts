import { COMMANDS, PANEL_TOGGLE_IDS, type CommandId } from '../../shared/commands/catalog'

/**
 * The renderer functions every command needs. All already exist in App.tsx's
 * assembled state — command handlers only wire them, adding no feature logic.
 * Context-sensitive handlers (next agent, commit, …) no-op inside these
 * callbacks when there is no active session/project.
 */
export interface CommandContext {
  openSettings: () => void
  openCommandPalette: () => void
  openShortcuts: () => void
  openAbout: () => void
  openQuickOpen: () => void
  findInFiles: () => void
  jumpToFavorite: (index: number) => void
  newAgent: () => void
  nextAgent: () => void
  previousAgent: () => void
  deleteActiveAgent: () => void
  commit: () => void
  createPR: () => void
  togglePanel: (panelId: string) => void
  openModule: (panelId: string) => void
  toggleTheme: () => void
  openDashboard: () => void
}

const FOCUS_PANEL_IDS: Record<string, string> = {
  'view.focusChat': 'agent',
  'view.focusTerminal': 'shell',
  'view.focusFiles': 'projects',
}

/** Build the id → handler map consumed by useCommands and the command palette. */
export function createCommandHandlers(ctx: CommandContext): Record<string, () => void> {
  const handlers: Record<string, () => void> = {
    'general.settings': ctx.openSettings,
    'general.commandPalette': ctx.openCommandPalette,
    'help.shortcuts': ctx.openShortcuts,
    'help.about': ctx.openAbout,
    'navigation.quickOpenFile': ctx.openQuickOpen,
    'navigation.findInFiles': ctx.findInFiles,
    'agents.new': ctx.newAgent,
    'agents.next': ctx.nextAgent,
    'agents.previous': ctx.previousAgent,
    'agents.delete': ctx.deleteActiveAgent,
    'scm.commit': ctx.commit,
    'scm.createPR': ctx.createPR,
    'view.toggleTheme': ctx.toggleTheme,
    'view.dashboard': ctx.openDashboard,
  }

  for (const command of COMMANDS) {
    const favorite = command.id.match(/^navigation\.favorite\.(\d+)$/)
    if (favorite) {
      const index = Number(favorite[1]) - 1
      handlers[command.id] = () => ctx.jumpToFavorite(index)
      continue
    }
    const panelId = PANEL_TOGGLE_IDS[command.id]
    if (panelId) {
      handlers[command.id] = () => ctx.togglePanel(panelId)
      continue
    }
    const focusPanel = FOCUS_PANEL_IDS[command.id]
    if (focusPanel) {
      handlers[command.id] = () => ctx.openModule(focusPanel)
    }
  }

  return handlers
}

export type { CommandId }
