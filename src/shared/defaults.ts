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
  provisioning: {
    provisioners: [],
  },
  transcription: {
    provider: 'none',
  },
  pluginConfig: {},
  disabledPlugins: [],
}
