// src/main/plugins/ui-broker.ts
import type { UiRequest } from '../../shared/plugins/ui'

/** Bridges a host UI request to the renderer and awaits the user's response (by requestId). */
export class UiRequestBroker {
  private seq = 0
  private readonly pending = new Map<string, (value: unknown) => void>()
  constructor(private readonly send: () => ((channel: string, ...args: unknown[]) => void) | null) {}

  request(req: Omit<UiRequest, 'requestId'>): Promise<unknown> {
    const send = this.send()
    if (!send) return Promise.resolve(undefined)
    const requestId = `ui${++this.seq}`
    return new Promise<unknown>((resolve) => {
      this.pending.set(requestId, resolve)
      send('plugins:ui-request', { ...req, requestId } as UiRequest)
    })
  }

  resolve(requestId: string, value: unknown): void {
    const r = this.pending.get(requestId)
    if (!r) return
    this.pending.delete(requestId)
    r(value)
  }

  flush(): void { for (const r of this.pending.values()) r(undefined); this.pending.clear() }
}
