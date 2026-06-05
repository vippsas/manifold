// src/main/plugins/host-commands-service.ts
import type { CommandRegistry } from './command-registry'

/** The HOST_COMMANDS RPC service (main side), split out so it can be unit-tested
 *  without importing the Electron-only ExtensionHost.
 *
 *  `pluginId` is threaded from the calling plugin (see api-impl `makeCommandsApi`)
 *  so the CommandRegistry can enforce ownership end-to-end: a second plugin can't
 *  silently hijack an existing command id, and only the owning plugin may
 *  unregister it. */
// A `type` (not `interface`) so it carries an implicit index signature and stays
// assignable to the RpcEndpoint `ServiceImpl` (Record<string, fn>) at registerService.
export type HostCommandsService = {
  $registerCommand(pluginId: string, id: string): void
  $unregisterCommand(pluginId: string, id: string): void
  $executeCommand(id: string, args: unknown[]): Promise<unknown>
}

export function createHostCommandsService(
  commands: CommandRegistry,
  invoke: (id: string, args: unknown[]) => Promise<unknown>,
): HostCommandsService {
  return {
    $registerCommand: (pluginId, id) => { commands.register(id, pluginId, (cid, args) => invoke(cid, args)) },
    $unregisterCommand: (pluginId, id) => { commands.unregister(id, pluginId) },
    $executeCommand: (id, args) => commands.execute(id, args),
  }
}
