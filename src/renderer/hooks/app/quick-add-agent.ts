import type { AgentSession } from '../../../shared/types'
import { withDefaultAgentName } from '../../components/sidebar/agent-labels'

export interface QuickAddLaunch {
  runtimeId: string
  displayName: string
  nonInteractive: boolean
}

/**
 * What the agent tab bar's "+" starts, with no dialog in between.
 *
 * With no pick it is the workspace's own runtime if it has one, else the default
 * one, in the default mode — an orchestrator (Viola) is always chat. A pick from
 * the runtime dropdown carries its own runtime and mode. The name is the shared
 * default-name rule over the workspace's agents, so a quick-added agent never
 * shares a tab label with a sibling.
 */
export function resolveQuickAddLaunch(args: {
  workspaceRuntimeId?: string
  defaultRuntime: string
  defaultAgentMode?: 'interactive' | 'chat'
  pick?: { runtimeId: string; mode: 'interactive' | 'chat' }
  workspaceSessions: readonly AgentSession[]
}): QuickAddLaunch {
  const { pick } = args
  const runtimeId = pick?.runtimeId ?? args.workspaceRuntimeId ?? args.defaultRuntime
  const nonInteractive = pick
    ? pick.mode === 'chat'
    : runtimeId === 'viola' || args.defaultAgentMode === 'chat'
  const { displayName } = withDefaultAgentName({ runtimeId }, args.workspaceSessions)
  return { runtimeId, displayName, nonInteractive }
}

/**
 * Lets one async launch run at a time and drops the calls that arrive meanwhile.
 *
 * A quick-add computes its default name from the workspace's agents as they are
 * when it starts, and the list only refreshes after the spawn lands. A second
 * click in that window would read the same list, pick the same name and start a
 * second agent that no tab can be told apart from. Dropping it is right: the user
 * asked for one more agent and is getting one.
 */
export function createSingleFlight(): <T>(run: () => Promise<T>) => Promise<T | undefined> {
  let busy = false
  return async (run) => {
    if (busy) return undefined
    busy = true
    try {
      return await run()
    } finally {
      busy = false
    }
  }
}
