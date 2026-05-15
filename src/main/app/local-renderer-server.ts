import { createReadStream, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

const HOST = '127.0.0.1'
// Arbitrary high port chosen to avoid common dev/preview ports (5173, 5174,
// 3000, …) while staying within the safe ephemeral range. Falls back to an
// OS-assigned port if this one is in use, at the cost of localStorage not
// persisting across restarts (origin = `http://127.0.0.1:<port>`).
const PREFERRED_PORT = 41776

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

export interface LocalRendererServer {
  url: string
  port: number
  close: () => Promise<void>
}

export async function startLocalRendererServer(rootDir: string): Promise<LocalRendererServer> {
  const root = normalize(rootDir)
  const server = createServer((req, res) => handleRequest(req, res, root))
  const port = await listen(server, PREFERRED_PORT).catch(() => listen(server, 0))
  return {
    url: `http://${HOST}:${port}`,
    port,
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve())
    }),
  }
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening)
      reject(err)
    }
    const onListening = (): void => {
      server.removeListener('error', onError)
      const addr = server.address()
      if (addr && typeof addr === 'object') resolve(addr.port)
      else reject(new Error('renderer server bound but address() returned non-AddressInfo'))
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, HOST)
  })
}

function handleRequest(req: IncomingMessage, res: ServerResponse, root: string): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  let url: URL
  try {
    url = new URL(req.url ?? '/', `http://${HOST}`)
  } catch {
    res.writeHead(400).end()
    return
  }
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  const resolved = normalize(join(root, rel))
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    res.writeHead(403).end()
    return
  }
  let size: number
  try {
    const stat = statSync(resolved)
    if (stat.isDirectory()) {
      res.writeHead(404).end()
      return
    }
    size = stat.size
  } catch {
    res.writeHead(404).end()
    return
  }
  const mime = MIME[extname(resolved).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, {
    'content-type': mime,
    'content-length': String(size),
    'cache-control': 'no-cache',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(resolved).pipe(res)
}
