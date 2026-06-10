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
export const HOST_WINDOW = 'HostWindow'             // main, called by host
export const PLUGIN_WEBVIEW = 'PluginWebview'       // host, called by main
export const HOST_STORAGE = 'HostStorage'           // main, called by host
export const PLUGIN_WORKSPACE = 'PluginWorkspace'   // host, called by main
export const HOST_CONFIG = 'HostConfig'             // main, called by host
export const PLUGIN_CONFIG = 'PluginConfig'         // host, called by main
export const HOST_TREE = 'HostTree'                 // main, called by host (refresh notifications)
export const PLUGIN_TREE = 'PluginTree'             // host, called by main (get children)
export const HOST_UI = 'HostUi'                     // main, called by host (interactive UI, returns a value)
export const HOST_AGENTS = 'HostAgents'             // main, called by host (drive a session's agent)
export const HOST_LM = 'HostLm'                     // main, called by host (one-shot language-model requests)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceImpl = Record<string, (...args: any[]) => unknown>

export class RpcEndpoint {
  private seq = 0
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> | undefined }>()
  private readonly services = new Map<string, ServiceImpl>()

  /** `callTimeoutMs > 0` rejects any outbound call whose reply never arrives, so a plugin
   *  whose activate() returns a never-resolving promise (without crashing the host) can't
   *  hang the caller forever. Off by default (0): only the main→host endpoint opts in, since
   *  the host→main direction carries intentionally long calls (agent turns, LM, UI prompts). */
  constructor(private readonly transport: RpcTransport, private readonly callTimeoutMs = 0) {}

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
      let timer: ReturnType<typeof setTimeout> | undefined
      if (this.callTimeoutMs > 0) {
        timer = setTimeout(() => {
          if (!this.pending.delete(id)) return
          reject(new Error(`rpc timeout after ${this.callTimeoutMs}ms: ${ctx}.${method}`))
        }, this.callTimeoutMs)
        // Don't keep the process alive solely to fire a pending-call timeout.
        timer.unref?.()
      }
      this.pending.set(id, { resolve, reject, timer })
      this.transport.post({ t: 'req', id, ctx, method, args })
    })
  }

  /** Reject every in-flight call. Called when the peer (e.g. the plugin host
   *  utilityProcess) dies, so awaiting callers fail loudly instead of hanging
   *  forever. A late reply for an id rejected here is dropped by handleMessage
   *  (the id is no longer pending). */
  rejectAllPending(reason: string): void {
    const error = new Error(reason)
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(error) }
    this.pending.clear()
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
    clearTimeout(waiter.timer)
    if (message.ok) waiter.resolve(message.value)
    else waiter.reject(new Error(message.error))
  }
}
