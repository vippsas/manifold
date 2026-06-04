// src/shared/plugins/rpc.ts
/** Bidirectional request/reply over a structured-clone message channel. */

export type RpcMessage =
  | { t: 'req'; id: number; ctx: string; method: string; args: unknown[] }
  | { t: 'rep'; id: number; ok: true; value: unknown }
  | { t: 'rep'; id: number; ok: false; error: string }

export interface RpcTransport {
  post(message: RpcMessage): void
}

/** Context ids for the services exposed across the boundary. */
export const HOST_COMMANDS = 'HostCommands'        // main, called by host
export const PLUGIN_ACTIVATION = 'PluginActivation' // host, called by main
export const PLUGIN_COMMANDS = 'PluginCommands'     // host, called by main

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceImpl = Record<string, (...args: any[]) => unknown>

export class RpcEndpoint {
  private seq = 0
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readonly services = new Map<string, ServiceImpl>()

  constructor(private readonly transport: RpcTransport) {}

  registerService(ctx: string, impl: ServiceImpl): void {
    this.services.set(ctx, impl)
  }

  getProxy<T>(ctx: string): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy({}, {
      get: (_t, method: string) => (...args: unknown[]) => this.call(ctx, method, args),
    }) as T
  }

  private call(ctx: string, method: string, args: unknown[]): Promise<unknown> {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.transport.post({ t: 'req', id, ctx, method, args })
    })
  }

  async handleMessage(message: RpcMessage): Promise<void> {
    if (message.t === 'req') {
      const service = this.services.get(message.ctx)
      try {
        if (!service || typeof service[message.method] !== 'function') {
          throw new Error(`no such method ${message.ctx}.${message.method}`)
        }
        const value = await service[message.method](...message.args)
        this.transport.post({ t: 'rep', id: message.id, ok: true, value })
      } catch (err) {
        this.transport.post({ t: 'rep', id: message.id, ok: false, error: err instanceof Error ? err.message : String(err) })
      }
      return
    }
    const waiter = this.pending.get(message.id)
    if (!waiter) return
    this.pending.delete(message.id)
    if (message.ok) waiter.resolve(message.value)
    else waiter.reject(new Error(message.error))
  }
}
