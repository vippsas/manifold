// resources/plugins/manifold.loop/src/store.ts
// Per-session config/status persistence over manifold.storage.global. The storage handle is
// injected (no `manifold` import) so this is unit-testable.
import type { LoopConfig, LoopStatus } from './types'

export interface StorageLike {
  global: {
    get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
    update(key: string, value: unknown): Promise<void>
  }
}

export interface LoopStore {
  getConfig(sessionId: string): Promise<LoopConfig | null>
  setConfig(sessionId: string, config: LoopConfig): Promise<void>
  getStatus(sessionId: string): Promise<LoopStatus | null>
  setStatus(sessionId: string, status: LoopStatus): Promise<void>
  clearStatus(sessionId: string): Promise<void>
}

const configKey = (sessionId: string): string => `loop.config.${sessionId}`
const statusKey = (sessionId: string): string => `loop.status.${sessionId}`

export function createLoopStore(storage: StorageLike): LoopStore {
  return {
    async getConfig(sessionId) {
      return (await storage.global.get<LoopConfig>(configKey(sessionId))) ?? null
    },
    async setConfig(sessionId, config) {
      await storage.global.update(configKey(sessionId), config)
    },
    async getStatus(sessionId) {
      return (await storage.global.get<LoopStatus>(statusKey(sessionId))) ?? null
    },
    async setStatus(sessionId, status) {
      await storage.global.update(statusKey(sessionId), status)
    },
    async clearStatus(sessionId) {
      await storage.global.update(statusKey(sessionId), null)
    },
  }
}
