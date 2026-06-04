// src/main/plugins/command-registry.ts
type Invoker = (id: string, args: unknown[]) => Promise<unknown>

/** Records command ownership and routes execution to the owning invoker. */
export class CommandRegistry {
  private readonly invokers = new Map<string, Invoker>()

  register(id: string, invoke: Invoker): void { this.invokers.set(id, invoke) }
  unregister(id: string): void { this.invokers.delete(id) }
  has(id: string): boolean { return this.invokers.has(id) }

  async execute(id: string, args: unknown[]): Promise<unknown> {
    const invoke = this.invokers.get(id)
    if (!invoke) throw new Error(`command not found: ${id}`)
    return invoke(id, args)
  }
}
