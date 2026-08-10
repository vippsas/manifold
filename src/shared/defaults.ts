import type { ManifoldSettings } from './types'

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

/**
 * Plugin ids kept out of the Settings → Plugins list: they ship with the app but
 * are not user-manageable. Pair with `DEFAULT_SETTINGS.disabledPlugins` to ship a
 * plugin dark — the only way back on is editing `config.json` by hand.
 */
export const SETTINGS_HIDDEN_PLUGINS = ['manifold.statistics']

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
  favorites: [] as string[],
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
  // Statistics ships disabled and is hidden from Settings → Plugins (see
  // SETTINGS_HIDDEN_PLUGINS). settings-store seeds each id here into existing configs
  // once — see resolveDefaults — so the default applies to current installs too.
  disabledPlugins: ['manifold.statistics'],
} satisfies ManifoldSettings
