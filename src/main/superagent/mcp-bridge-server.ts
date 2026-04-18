import * as net from 'node:net'
import * as fs from 'node:fs'

export interface McpBridgeServerDeps {
  socketPath: string
  handleToolCall: (superagentId: string, name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export class McpBridgeServer {
  private server: net.Server | null = null

  constructor(private readonly deps: McpBridgeServerDeps) {}

  async start(): Promise<void> {
    try { fs.unlinkSync(this.deps.socketPath) } catch { /* not present */ }
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        let buf = ''
        socket.on('data', async (chunk) => {
          buf += chunk.toString('utf-8')
          let idx: number
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx)
            buf = buf.slice(idx + 1)
            if (!line.trim()) continue
            let reply: Record<string, unknown>
            try {
              const msg = JSON.parse(line) as { superagentId: string; name: string; args: Record<string, unknown> }
              const result = await this.deps.handleToolCall(msg.superagentId, msg.name, msg.args)
              reply = { ok: true, result }
            } catch (err) {
              reply = { ok: false, error: err instanceof Error ? err.message : String(err) }
            }
            socket.write(JSON.stringify(reply) + '\n')
          }
        })
      })
      server.once('error', reject)
      server.listen(this.deps.socketPath, () => {
        this.server = server
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    try { fs.unlinkSync(this.deps.socketPath) } catch { /* ignore */ }
    this.server = null
  }

  get socketPath(): string {
    return this.deps.socketPath
  }
}
