import type { ManifoldSettings } from './types'

export const DEFAULT_SETTINGS: ManifoldSettings = {
  storagePath: '',
  setupCompleted: false,
  defaultRuntime: 'claude',
  theme: 'dark',
  scrollbackLines: 5000,
  defaultBaseBranch: 'main'
}
