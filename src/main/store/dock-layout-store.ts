import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { writeFileAtomicSync } from './atomic-write'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'dock-layout.json')

/** A serialized dockview layout, recognised by the two keys dockview always
 *  writes. Distinguishes the current single layout from the `{ sessionId:
 *  layout }` map this file held while layouts were per agent. */
function isSerializedLayout(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { grid?: unknown; panels?: unknown }
  return typeof candidate.grid === 'object' && candidate.grid !== null
    && typeof candidate.panels === 'object' && candidate.panels !== null
}

/**
 * The one dock layout, shared by the whole window. Panel arrangement is a
 * property of the window rather than of whatever agent is selected, so
 * switching agents leaves the dock exactly where the user put it.
 */
export class DockLayoutStore {
  private layout: unknown | null

  constructor() {
    this.layout = this.loadFromDisk()
  }

  private loadFromDisk(): unknown | null {
    try {
      if (!fs.existsSync(STATE_FILE)) return null
      const parsed: unknown = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
      // A per-agent map from before the layout became window-scoped: there is no
      // one layout to pick out of it, so it's dropped and the default rebuilt.
      return isSerializedLayout(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  get(): unknown | null {
    return this.layout
  }

  set(layout: unknown): void {
    this.layout = layout
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileAtomicSync(STATE_FILE, JSON.stringify(layout, null, 2))
  }
}
