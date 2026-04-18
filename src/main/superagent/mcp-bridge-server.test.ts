import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as net from 'node:net'
import { McpBridgeServer } from './mcp-bridge-server'

describe('McpBridgeServer', () => {
  let tmp: string
  let socketPath: string
  let server: McpBridgeServer

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bridge-'))
    socketPath = path.join(tmp, 'bridge.sock')
    server = new McpBridgeServer({
      socketPath,
      handleToolCall: async (superagentId, name, args) => ({ echoed: { superagentId, name, args } }),
    })
  })

  afterEach(async () => {
    await server.stop()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('handles a tool call request over the socket', async () => {
    await server.start()
    const result = await new Promise<any>((resolve, reject) => {
      const client = net.createConnection(socketPath)
      client.on('connect', () => {
        client.write(JSON.stringify({ superagentId: 'S', name: 'list_projects', args: {} }) + '\n')
      })
      let buf = ''
      client.on('data', (d) => {
        buf += d.toString('utf-8')
        const nl = buf.indexOf('\n')
        if (nl >= 0) {
          try { resolve(JSON.parse(buf.slice(0, nl))) } catch (e) { reject(e) }
          client.end()
        }
      })
      client.on('error', reject)
    })
    expect(result).toMatchObject({ ok: true, result: { echoed: { superagentId: 'S', name: 'list_projects' } } })
  })

  it('returns error payload when handler throws', async () => {
    server = new McpBridgeServer({
      socketPath,
      handleToolCall: async () => { throw new Error('boom') },
    })
    await server.start()
    const result = await new Promise<any>((resolve, reject) => {
      const client = net.createConnection(socketPath)
      client.on('connect', () => client.write(JSON.stringify({ superagentId: 'S', name: 'x', args: {} }) + '\n'))
      let buf = ''
      client.on('data', (d) => {
        buf += d.toString('utf-8')
        const nl = buf.indexOf('\n')
        if (nl >= 0) { resolve(JSON.parse(buf.slice(0, nl))); client.end() }
      })
      client.on('error', reject)
    })
    expect(result).toMatchObject({ ok: false, error: 'boom' })
  })
})
