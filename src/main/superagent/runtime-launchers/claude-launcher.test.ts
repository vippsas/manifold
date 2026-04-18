import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { claudeLauncher } from './claude-launcher'

describe('claudeLauncher', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-launcher-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('produces byte-identical spawn spec to the legacy inline logic', () => {
    const bridgeScriptPath = path.join(tmp, 'mcp-bridge.js')
    fs.writeFileSync(bridgeScriptPath, '// bridge')

    const spec = claudeLauncher.prepare({
      superagentId: 'sid',
      coordinationPath: tmp,
      bridgeScriptPath,
      mcpSocketPath: '/tmp/sock',
      runtimeBinary: 'claude',
      runtimeArgs: ['--allow-dangerously-skip-permissions'],
      initialPrompt: 'hello',
    })

    const mcpConfigPath = path.join(tmp, 'mcp-config.json')
    expect(spec.binary).toBe('claude')
    expect(spec.args).toEqual([
      '--allow-dangerously-skip-permissions',
      '--mcp-config', mcpConfigPath,
      '--strict-mcp-config',
      'hello',
    ])
    expect(spec.env).toEqual({ MANIFOLD_SUPERAGENT_ID: 'sid', MANIFOLD_MCP_SOCKET: '/tmp/sock' })
    expect(spec.cwd).toBe(tmp)

    const written = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'))
    expect(written).toEqual({ mcpServers: { 'manifold-orchestrator': { command: 'node', args: [bridgeScriptPath] } } })
  })

  it('omits the prompt arg on resume (initialPrompt undefined)', () => {
    const bridgeScriptPath = path.join(tmp, 'mcp-bridge.js')
    fs.writeFileSync(bridgeScriptPath, '// bridge')

    const spec = claudeLauncher.prepare({
      superagentId: 'sid',
      coordinationPath: tmp,
      bridgeScriptPath,
      mcpSocketPath: '/tmp/sock',
      runtimeBinary: 'claude',
      runtimeArgs: ['--allow-dangerously-skip-permissions'],
      initialPrompt: undefined,
    })

    const mcpConfigPath = path.join(tmp, 'mcp-config.json')
    expect(spec.args).toEqual([
      '--allow-dangerously-skip-permissions',
      '--mcp-config', mcpConfigPath,
      '--strict-mcp-config',
    ])
  })

  it('does not overwrite an existing mcp-config.json (resume path)', () => {
    const bridgeScriptPath = path.join(tmp, 'mcp-bridge.js')
    fs.writeFileSync(bridgeScriptPath, '// bridge')
    const mcpConfigPath = path.join(tmp, 'mcp-config.json')
    fs.writeFileSync(mcpConfigPath, '{"preserved":true}')

    claudeLauncher.prepare({
      superagentId: 'sid',
      coordinationPath: tmp,
      bridgeScriptPath,
      mcpSocketPath: '/tmp/sock',
      runtimeBinary: 'claude',
      runtimeArgs: [],
      initialPrompt: undefined,
    })

    expect(fs.readFileSync(mcpConfigPath, 'utf-8')).toBe('{"preserved":true}')
  })
})
