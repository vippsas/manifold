// src/main/plugins/command-registry.ts
type Invoker = (id: string, args: unknown[]) => Promise<unknown>

/** Records command ownership and routes execution to the owning invoker.
 *  First-writer-wins on cross-owner id collision (prevents silent hijack). */
export class CommandRegistry {
  private readonly invokers = new Map<string, Invoker>()
  private readonly owners = new Map<string, string>()
  private onCollisionCb: ((message: string) => void) | null = null

  // Single consumer expected (ExtensionHost); replace with an array if multiple listeners are ever needed.
  onCollision(cb: (message: string) => void): void { this.onCollisionCb = cb }

  register(id: string, owner: string, invoke: Invoker): void {
    const existing = this.owners.get(id)
    if (existing !== undefined && existing !== owner) {
      this.onCollisionCb?.(`command id "${id}" already registered by "${existing}"; ignoring registration from "${owner}"`)
      return
    }
    this.owners.set(id, owner)
    this.invokers.set(id, invoke)
  }

  unregister(id: string, owner: string): void {
    if (this.owners.get(id) !== owner) return
    this.owners.delete(id)
    this.invokers.delete(id)
  }

  has(id: string): boolean { return this.invokers.has(id) }
  ownerOf(id: string): string | undefined { return this.owners.get(id) }

  /** Drop all registrations. Called when the extension host process exits so a
   *  re-forked host starts clean — otherwise stale ids (owned by the dead host's
   *  plugins) would block the re-activated plugins from re-registering them. */
  clear(): void {
    this.invokers.clear()
    this.owners.clear()
  }

  async execute(id: string, args: unknown[]): Promise<unknown> {
    const invoke = this.invokers.get(id)
    if (!invoke) throw new Error(`command not found: ${id}`)
    return invoke(id, args)
  }
}
