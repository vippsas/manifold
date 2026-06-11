import { join } from 'node:path'

/** The watch skill bundled with this plugin (copied under skills/watch). */
export function getBundledWatchSkillPath(pluginUri: string): string {
  return join(pluginUri, 'skills', 'watch')
}
