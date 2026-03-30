import type { ManifoldSettings } from './types'

export const DEFAULT_SETTINGS: ManifoldSettings = {
  storagePath: '',
  setupCompleted: false,
  defaultRuntime: 'claude',
  theme: 'manifold-atelier',
  scrollbackLines: 5000,
  terminalFontFamily: '',
  defaultBaseBranch: 'main',
  notificationSound: true,
  shellPrompt: true,
  shellHistoryScope: 'project',
  uiMode: 'simple',
  density: 'comfortable' as const,
  autoGenerateMessages: true,
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
