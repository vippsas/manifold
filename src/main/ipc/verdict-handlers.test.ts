import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ipcMain } from 'electron'
import { registerVerdictHandlers } from './verdict-handlers'
import { VerdictStore } from '../store/verdict-store'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { IpcDependencies } from './types'

vi.mock('electron', () => ({
  ipcMain: {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      ;(this.handlers as Map<string, (...args: unknown[]) => unknown>).set(channel, handler)
    },
    removeAllListeners() { (this.handlers as Map<string, unknown>).clear() },
  },
}))

describe('verdict-handlers', () => {
  let tmp: string
  beforeEach(() => {
    ;(ipcMain as unknown as { removeAllListeners: () => void }).removeAllListeners()
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-ipc-'))
  })

  it('verdicts:list returns records for projectId', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert({
      sessionId: 's1', projectId: 'p1', branch: 'b', runtime: 'claude',
      taskPrompt: { kind: 'full', text: 't' }, outcome: 'merged',
      createdAt: '2026-05-16T00:00:00Z',
      metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 1, removed: 0 }, filesChanged: 1 },
    })
    registerVerdictHandlers({ verdictStore: store } as unknown as IpcDependencies)
    const handler = (ipcMain as unknown as { handlers: Map<string, (e: unknown, req: unknown) => unknown> })
      .handlers.get('verdicts:list')
    const list = handler!(null, { projectId: 'p1' }) as Array<{ sessionId: string }>
    expect(list[0].sessionId).toBe('s1')
  })

  it('verdicts:get returns null for missing sessionId', () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    registerVerdictHandlers({ verdictStore: store } as unknown as IpcDependencies)
    const handler = (ipcMain as unknown as { handlers: Map<string, (e: unknown, sid: string) => unknown> })
      .handlers.get('verdicts:get')
    expect(handler!(null, 'nope')).toBeNull()
  })
})
