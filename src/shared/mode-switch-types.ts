import type { SimpleApp } from './simple-types'

export interface PendingDeveloperLaunch {
  kind: 'developer'
  projectId: string
  branchName?: string
  runtimeId?: string
}

export interface PendingSimpleLaunch {
  kind: 'simple'
  app: SimpleApp
}

export type PendingLaunchAction = PendingDeveloperLaunch | PendingSimpleLaunch
