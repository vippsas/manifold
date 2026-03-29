import type { ManifoldSettings } from './types'

export const DEFAULT_SETTINGS: ManifoldSettings = {
  storagePath: '',
  setupCompleted: false,
  defaultRuntime: 'claude',
  theme: 'jacob-co-dark',
  scrollbackLines: 5000,
  terminalFontFamily: '',
  defaultBaseBranch: 'main',
  notificationSound: true,
  uiMode: 'simple',
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
    provisioners: [
      {
        id: 'vercel-bundled',
        label: 'Vercel Templates',
        type: 'builtin',
        enabled: true,
      },
    ],
  },
}
