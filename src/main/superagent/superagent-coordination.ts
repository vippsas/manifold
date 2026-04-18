import * as fs from 'node:fs'
import * as path from 'node:path'
import { MCP_BRIDGE_SCRIPT, TOOL_SCHEMAS } from './mcp-bridge-script'

export interface CoordinationPaths {
  coordinationPath: string
  bridgeScriptPath: string
}

export function setupCoordinationDir(storageRoot: string, superagentId: string): CoordinationPaths {
  const coordinationPath = path.join(storageRoot, 'superagents', superagentId)
  fs.mkdirSync(coordinationPath, { recursive: true })
  fs.writeFileSync(
    path.join(coordinationPath, 'plan.md'),
    '# Plan\n\n_Orchestrator may edit freely._\n',
  )

  const bridgeScriptPath = path.join(coordinationPath, 'mcp-bridge.js')
  const toolSchemasPath = path.join(coordinationPath, 'tool-schemas.json')
  fs.writeFileSync(bridgeScriptPath, MCP_BRIDGE_SCRIPT)
  fs.writeFileSync(toolSchemasPath, JSON.stringify(TOOL_SCHEMAS, null, 2))

  return { coordinationPath, bridgeScriptPath }
}

export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
  return slug || 'superagent'
}
