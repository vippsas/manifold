import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { codexLauncher } from './codex-launcher'

let mockHomeDir = ''

vi.mock(import('node:os'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    homedir: () => mockHomeDir,
  }
})

describe('codexLauncher', () => {
  let tmp: string
  let homeDir: string

  beforeEach(() => {
    const tmpRoot = process.env.TMPDIR ?? '/tmp'
    tmp = fs.mkdtempSync(path.join(tmpRoot, 'codex-launcher-'))
    homeDir = path.join(tmp, 'home')
    mockHomeDir = homeDir
    fs.mkdirSync(path.join(homeDir, '.codex'), { recursive: true })
  })

  afterEach(() => {
    mockHomeDir = ''
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('uses a shared superagent CODEX_HOME and seeds config from the user home', () => {
    fs.writeFileSync(path.join(homeDir, '.codex', 'config.toml'), 'model = "gpt-5.4"\n')
    fs.writeFileSync(path.join(homeDir, '.codex', 'auth.json'), '{"token":"abc"}')

    const coordinationPath = path.join(tmp, 'superagents', 'sid-1')
    fs.mkdirSync(coordinationPath, { recursive: true })

    const spec = codexLauncher.prepare({
      superagentId: 'sid-1',
      coordinationPath,
      bridgeScriptPath: path.join(coordinationPath, 'mcp-bridge.js'),
      mcpSocketPath: '/tmp/manifold.sock',
      runtimeBinary: 'codex',
      runtimeArgs: ['--search'],
      initialPrompt: undefined,
      persistentContext: 'You are an orchestrator.',
    })

    const sharedCodexHome = path.join(tmp, 'superagents', '.codex-home')
    const configPath = path.join(sharedCodexHome, 'config.toml')
    const config = fs.readFileSync(configPath, 'utf-8')

    expect(spec.binary).toBe('codex')
    expect(spec.args).toEqual(['--search'])
    expect(spec.env).toEqual({
      MANIFOLD_SUPERAGENT_ID: 'sid-1',
      MANIFOLD_MCP_SOCKET: '/tmp/manifold.sock',
      CODEX_HOME: sharedCodexHome,
    })
    expect(spec.cwd).toBe(coordinationPath)
    expect(config).toContain('model = "gpt-5.4"')
    expect(config).toContain('[mcp_servers.manifold-orchestrator]')
    expect(config).toContain(`args = ${JSON.stringify([path.join(sharedCodexHome, 'mcp-bridge.js')])}`)
    expect(config).toContain('[mcp_servers.manifold-orchestrator.env]')
    expect(config).toContain('MANIFOLD_SUPERAGENT_ID = "sid-1"')
    expect(config).toContain('MANIFOLD_MCP_SOCKET = "/tmp/manifold.sock"')
    expect(config).toContain(`[projects.${JSON.stringify(coordinationPath)}]`)
    expect(config).toContain('trust_level = "trusted"')
    expect(fs.readFileSync(path.join(sharedCodexHome, 'auth.json'), 'utf-8')).toBe('{"token":"abc"}')
  })

  it('migrates prior manifold tool approvals into the shared config', () => {
    const legacyCoordinationPath = path.join(tmp, 'superagents', 'legacy')
    const legacyCodexHome = path.join(legacyCoordinationPath, 'codex-home')
    fs.mkdirSync(legacyCodexHome, { recursive: true })
    fs.writeFileSync(
      path.join(legacyCodexHome, 'config.toml'),
      [
        '[mcp_servers.manifold-orchestrator.tools.spawn_agent]',
        'approval_mode = "approve"',
        '',
      ].join('\n'),
    )

    const coordinationPath = path.join(tmp, 'superagents', 'sid-2')
    fs.mkdirSync(coordinationPath, { recursive: true })

    codexLauncher.prepare({
      superagentId: 'sid-2',
      coordinationPath,
      bridgeScriptPath: path.join(coordinationPath, 'mcp-bridge.js'),
      mcpSocketPath: '/tmp/manifold.sock',
      runtimeBinary: 'codex',
      runtimeArgs: [],
      initialPrompt: undefined,
      persistentContext: 'You are an orchestrator.',
    })

    const sharedConfig = fs.readFileSync(path.join(tmp, 'superagents', '.codex-home', 'config.toml'), 'utf-8')
    expect(sharedConfig).toContain('[mcp_servers.manifold-orchestrator.tools.spawn_agent]')
    expect(sharedConfig).toContain('approval_mode = "approve"')
  })

  it('reuses the shared config across new superagents without duplicating sections', () => {
    const firstCoordinationPath = path.join(tmp, 'superagents', 'sid-1')
    fs.mkdirSync(firstCoordinationPath, { recursive: true })

    codexLauncher.prepare({
      superagentId: 'sid-1',
      coordinationPath: firstCoordinationPath,
      bridgeScriptPath: path.join(firstCoordinationPath, 'mcp-bridge.js'),
      mcpSocketPath: '/tmp/manifold.sock',
      runtimeBinary: 'codex',
      runtimeArgs: [],
      initialPrompt: undefined,
      persistentContext: 'You are an orchestrator.',
    })

    const sharedConfigPath = path.join(tmp, 'superagents', '.codex-home', 'config.toml')
    fs.appendFileSync(
      sharedConfigPath,
      [
        '',
        '[mcp_servers.manifold-orchestrator.env]',
        'MANIFOLD_SUPERAGENT_ID = "stale-superagent"',
        'MANIFOLD_MCP_SOCKET = "/tmp/stale.sock"',
        '',
        '[mcp_servers.manifold-orchestrator.tools.spawn_agent]',
        'approval_mode = "approve"',
        '',
      ].join('\n'),
    )

    const secondCoordinationPath = path.join(tmp, 'superagents', 'sid-2')
    fs.mkdirSync(secondCoordinationPath, { recursive: true })

    const spec = codexLauncher.prepare({
      superagentId: 'sid-2',
      coordinationPath: secondCoordinationPath,
      bridgeScriptPath: path.join(secondCoordinationPath, 'mcp-bridge.js'),
      mcpSocketPath: '/tmp/manifold.sock',
      runtimeBinary: 'codex',
      runtimeArgs: [],
      initialPrompt: undefined,
      persistentContext: 'You are an orchestrator.',
    })

    const sharedConfig = fs.readFileSync(sharedConfigPath, 'utf-8')
    expect(spec.env.CODEX_HOME).toBe(path.join(tmp, 'superagents', '.codex-home'))
    expect(countMatches(sharedConfig, /^\[mcp_servers\.manifold-orchestrator\]$/gm)).toBe(1)
    expect(countMatches(sharedConfig, /^\[mcp_servers\.manifold-orchestrator\.env\]$/gm)).toBe(1)
    expect(countMatches(sharedConfig, /^\[mcp_servers\.manifold-orchestrator\.tools\.spawn_agent\]$/gm)).toBe(1)
    expect(sharedConfig).toContain('MANIFOLD_SUPERAGENT_ID = "sid-2"')
    expect(sharedConfig).toContain('MANIFOLD_MCP_SOCKET = "/tmp/manifold.sock"')
    expect(sharedConfig).not.toContain('stale-superagent')
    expect(sharedConfig).not.toContain('/tmp/stale.sock')
    expect(sharedConfig).toContain(`[projects.${JSON.stringify(secondCoordinationPath)}]`)
  })
})

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length
}
