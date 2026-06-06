import type { ManifoldSettings } from './types'

export const DEFAULT_SETTINGS: ManifoldSettings = {
  storagePath: '',
  setupCompleted: false,
  lastSeenReleaseNotesVersion: '',
  defaultRuntime: 'claude',
  defaultAgentMode: 'chat',
  theme: 'manifold-dark',
  scrollbackLines: 5000,
  terminalFontFamily: '',
  defaultBaseBranch: 'main',
  notificationSound: true,
  shellPrompt: true,
  shellHistoryScope: 'project',
  uiMode: 'developer',
  autoGenerateMessages: true,
  showCommitAndPrButtons: false,
  sidebarResizeReversed: false,
  favorites: [],
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
  editor: {
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
    wordWrap: 'off',
    minimap: false,
    tabSize: 2,
  },
  provisioning: {
    provisioners: [],
  },
  transcription: {
    provider: 'none',
  },
  pluginConfig: {},
  // The hello-world sample plugins (the 3 bundled demos + the mark-wiemer.helloworld-2022
  // VS Code sample) ship disabled by default; users can enable them in Settings → Plugins.
  // (disabledPlugins is new in this release; settings-store seeds this set into existing
  // configs once — see resolveDefaults — so the default applies to current installs too.)
  disabledPlugins: ['manifold.hello', 'manifold.hello-tree', 'manifold.hello-vscode', 'mark-wiemer.helloworld-2022'],
}
