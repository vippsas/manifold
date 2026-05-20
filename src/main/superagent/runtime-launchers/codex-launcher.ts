import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { MCP_BRIDGE_SCRIPT, TOOL_SCHEMAS } from '../mcp-bridge-script'
import type { OrchestratorLaunchContext, OrchestratorLaunchSpec, OrchestratorLauncher } from './types'

export const codexLauncher: OrchestratorLauncher = {
  prepare(ctx: OrchestratorLaunchContext): OrchestratorLaunchSpec {
    // Superagents need one shared Codex home so MCP "Always allow" decisions
    // survive creating a brand-new coordination directory.
    const codexHome = path.join(path.dirname(ctx.coordinationPath), '.codex-home')
    fs.mkdirSync(codexHome, { recursive: true })

    const sharedBridgeScriptPath = path.join(codexHome, 'mcp-bridge.js')
    const sharedToolSchemasPath = path.join(codexHome, 'tool-schemas.json')
    fs.writeFileSync(sharedBridgeScriptPath, MCP_BRIDGE_SCRIPT)
    fs.writeFileSync(sharedToolSchemasPath, JSON.stringify(TOOL_SCHEMAS, null, 2))

    ensureSharedCodexConfig(
      codexHome,
      sharedBridgeScriptPath,
      ctx.coordinationPath,
    )

    // Carry over user auth so the shared superagent CODEX_HOME still signs in. If
    // missing, we fall back to OPENAI_API_KEY passed through from process env
    // (validated at spawn time by Codex itself).
    const userAuth = path.join(os.homedir(), '.codex', 'auth.json')
    const targetAuth = path.join(codexHome, 'auth.json')
    if (fs.existsSync(userAuth) && !fs.existsSync(targetAuth)) {
      try { fs.copyFileSync(userAuth, targetAuth) } catch { /* best-effort */ }
    }

    // Persist orchestrator context (rules + fleet + initial user message) as
    // AGENTS.md in the coordination dir. Codex reads AGENTS.md from cwd on
    // every launch, so this survives resume and makes the orchestrator role
    // visible to the model instead of hoping a positional arg gets treated as
    // the first user message.
    const agentsMdPath = path.join(ctx.coordinationPath, 'AGENTS.md')
    if (ctx.persistentContext) {
      fs.writeFileSync(agentsMdPath, ctx.persistentContext + '\n')
    }

    const args = [...ctx.runtimeArgs]

    const env: Record<string, string> = {
      MANIFOLD_SUPERAGENT_ID: ctx.superagentId,
      MANIFOLD_MCP_SOCKET: ctx.mcpSocketPath,
      CODEX_HOME: codexHome,
    }
    if (process.env.OPENAI_API_KEY) env.OPENAI_API_KEY = process.env.OPENAI_API_KEY

    return { binary: ctx.runtimeBinary, args, env, cwd: ctx.coordinationPath }
  },
}

function ensureSharedCodexConfig(
  codexHome: string,
  bridgeScriptPath: string,
  coordinationPath: string,
): void {
  const configPath = path.join(codexHome, 'config.toml')
  const userConfigPath = path.join(os.homedir(), '.codex', 'config.toml')

  let config = readTextIfExists(configPath)
  if (!config && fs.existsSync(userConfigPath)) {
    config = fs.readFileSync(userConfigPath, 'utf-8')
  }

  const existingToolApprovalHeaders = new Set(
    extractManifoldToolApprovalBlocks(config).map((block) => firstLine(block)),
  )

  for (const legacyConfigPath of listLegacySuperagentConfigPaths(path.dirname(codexHome))) {
    const legacyConfig = readTextIfExists(legacyConfigPath)
    if (!legacyConfig) continue

    for (const block of extractManifoldToolApprovalBlocks(legacyConfig)) {
      const header = firstLine(block)
      if (existingToolApprovalHeaders.has(header)) continue
      config = appendTomlBlock(config, block)
      existingToolApprovalHeaders.add(header)
    }
  }

  const manifoldServerHeader = '[mcp_servers.manifold-orchestrator]'
  if (!config.includes(manifoldServerHeader)) {
    config = appendTomlBlock(
      config,
      [
        manifoldServerHeader,
        'command = "node"',
        `args = ${JSON.stringify([bridgeScriptPath])}`,
      ].join('\n'),
    )
  }

  const projectTrustHeader = `[projects.${JSON.stringify(coordinationPath)}]`
  if (!config.includes(projectTrustHeader)) {
    config = appendTomlBlock(
      config,
      [
        projectTrustHeader,
        'trust_level = "trusted"',
      ].join('\n'),
    )
  }

  fs.writeFileSync(configPath, ensureTrailingNewline(config))
}

function listLegacySuperagentConfigPaths(superagentsRoot: string): string[] {
  if (!fs.existsSync(superagentsRoot)) return []

  return fs.readdirSync(superagentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '.codex-home')
    .map((entry) => path.join(superagentsRoot, entry.name, 'codex-home', 'config.toml'))
    .filter((candidate) => fs.existsSync(candidate))
}

function extractManifoldToolApprovalBlocks(config: string): string[] {
  const blocks: string[] = []
  const lines = config.split(/\r?\n/)
  let currentBlock: string[] | null = null

  const flush = () => {
    if (!currentBlock) return
    const block = currentBlock.join('\n').trim()
    if (block && block.includes('approval_mode')) {
      blocks.push(block)
    }
    currentBlock = null
  }

  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      flush()
      currentBlock = line.startsWith('[mcp_servers.manifold-orchestrator.tools.')
        ? [line]
        : null
      continue
    }

    if (currentBlock) currentBlock.push(line)
  }

  flush()
  return blocks
}

function appendTomlBlock(config: string, block: string): string {
  const trimmedConfig = config.trimEnd()
  const trimmedBlock = block.trim()
  if (!trimmedConfig) return `${trimmedBlock}\n`
  return `${trimmedConfig}\n\n${trimmedBlock}\n`
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}

function firstLine(value: string): string {
  return value.split('\n', 1)[0] ?? ''
}

function readTextIfExists(filePath: string): string {
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf-8')
}
