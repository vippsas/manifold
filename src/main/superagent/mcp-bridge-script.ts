/** MCP stdio forwarder script — written to disk per superagent; talks to main via Unix socket. */
export const MCP_BRIDGE_SCRIPT = `#!/usr/bin/env node
const net = require('node:net')
const readline = require('node:readline')
const path = require('node:path')
const fs = require('node:fs')
const SOCKET_PATH = process.env.MANIFOLD_MCP_SOCKET
const SUPERAGENT_ID = process.env.MANIFOLD_SUPERAGENT_ID
if (!SOCKET_PATH || !SUPERAGENT_ID) {
  console.error('MANIFOLD_MCP_SOCKET and MANIFOLD_SUPERAGENT_ID must be set')
  process.exit(1)
}

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }

const TOOLS = JSON.parse(fs.readFileSync(path.join(__dirname, 'tool-schemas.json'), 'utf-8'))

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  let msg; try { msg = JSON.parse(line) } catch { return }
  if (msg.method === 'initialize') {
    const clientVersion = msg.params && msg.params.protocolVersion
    const protocolVersion = typeof clientVersion === 'string' ? clientVersion : '2024-11-05'
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'manifold-orchestrator', version: '0.1.0' } } })
    return
  }
  if (msg.method === 'notifications/initialized' || msg.method === 'initialized') {
    return
  }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } })
    return
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params
    const client = net.createConnection(SOCKET_PATH)
    let buf = ''
    client.on('connect', () => client.write(JSON.stringify({ superagentId: SUPERAGENT_ID, name, args }) + '\\n'))
    client.on('data', (d) => {
      buf += d.toString('utf-8')
      const nl = buf.indexOf('\\n')
      if (nl < 0) return
      const parsed = JSON.parse(buf.slice(0, nl))
      client.end()
      if (parsed.ok) {
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(parsed.result) }] } })
      } else {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: parsed.error } })
      }
    })
    client.on('error', (e) => {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: e.message } })
    })
  }
})
`

export const TOOL_SCHEMAS = [
  { name: 'list_projects', description: 'List the fleet of projects this superagent may touch', inputSchema: { type: 'object', properties: {} } },
  { name: 'spawn_agent', description: 'Spawn a child agent in a project', inputSchema: { type: 'object', required: ['projectId', 'runtime', 'prompt'], properties: { projectId: { type: 'string' }, runtime: { type: 'string' }, prompt: { type: 'string' }, branchName: { type: 'string' } } } },
  { name: 'send_prompt', description: 'Send a prompt to a running child', inputSchema: { type: 'object', required: ['sessionId', 'prompt'], properties: { sessionId: { type: 'string' }, prompt: { type: 'string' } } } },
  { name: 'read_output', description: 'Read recent output from a child', inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
  { name: 'read_status', description: 'Read status of a child', inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
  { name: 'read_diff', description: "Read a child's branch diff", inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
  { name: 'stop_agent', description: 'Terminate a child', inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
]
