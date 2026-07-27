import type { FavoriteRef, ManifoldSettings } from './types'

/** Supported UI scale range, matching the Settings dropdown options. */
export const UI_SCALE_MIN = 0.85
export const UI_SCALE_MAX = 2

/**
 * Clamp a persisted/user-supplied UI scale into the supported range, falling
 * back to 1 for absent or non-finite values. The setting is a bare `number`
 * that flows into font-size math, so a hand-edited NaN/negative/huge value
 * must never reach the renderer.
 */
export function clampUiScale(scale: number | undefined): number {
  return Number.isFinite(scale) ? Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, scale as number)) : 1
}

export const DEFAULT_SETTINGS = {
  storagePath: '',
  setupCompleted: false,
  lastSeenReleaseNotesVersion: '',
  defaultRuntime: 'claude',
  defaultAgentMode: 'interactive',
  theme: 'manifold-dark',
  scrollbackLines: 5000,
  terminalFontFamily: '',
  defaultBaseBranch: 'main',
  notificationSound: true,
  shellPrompt: true,
  shellPromptSegments: { repo: true, agent: true, k8sContext: false, k8sNamespace: false },
  shellHistoryScope: 'project',
  uiMode: 'developer',
  autoGenerateMessages: true,
  showCommitAndPrButtons: false,
  sidebarResizeReversed: false,
  useWorktrees: true,
  workspacesEnabled: false,
  favorites: [] as FavoriteRef[],
  keepAwake: false,
  memory: {
    enabled: true,
    compressionRuntime: 'auto',
    injectionEnabled: true,
    injectionTokenBudget: 2000,
    injectionMethod: 'auto',
    rawRetentionDays: 30,
  },
  search: {
    ai: {
      enabled: true,
      mode: 'answer',
      runtimeId: 'default',
      citationLimit: 6,
      maxContextResults: 8,
    },
  },
  uiScale: 1,
  editor: {
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
    wordWrap: 'on',
    markdownWordWrap: true,
    minimap: true,
    tabSize: 2,
  },
  transcription: {
    provider: 'none',
  },
  notifications: {
    enabled: false,
    onDone: true,
    onWaiting: true,
    onError: true,
    scope: 'non-active',
  },
  pluginConfig: {},
  // The hello-world sample plugins (the 3 bundled demos + the mark-wiemer.helloworld-2022
  // VS Code sample) ship disabled by default; users can enable them in Settings → Plugins.
  // (disabledPlugins is new in this release; settings-store seeds this set into existing
  // configs once — see resolveDefaults — so the default applies to current installs too.)
  disabledPlugins: ['manifold.hello', 'manifold.hello-tree', 'manifold.hello-vscode', 'mark-wiemer.helloworld-2022'],
} satisfies ManifoldSettings
