import { describe, it, expect, afterEach } from 'vitest'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { startLocalRendererServer } from './local-renderer-server'

let tmpDir: string

function makeRoot(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-server-'))
  return tmpDir
}

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  }
})

// agent: false forces a fresh, non-pooled socket per request. The server uses a
// fixed PREFERRED_PORT and is recreated for each test; with Node's default
// keepAlive agent, a pooled socket from a prior test points at the now-closed
// server and the reused connection fails with ECONNRESET / socket hang up.
function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, { agent: false }, (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      })
      .on('error', reject)
  })
}

describe('local-renderer-server', () => {
  it('returns 400 for malformed percent-encoding (issue #504)', async () => {
    const root = makeRoot()
    const srv = await startLocalRendererServer(root)
    try {
      // /%  is an invalid percent sequence — decodeURIComponent would throw
      // without the fix, crashing the main process.
      const res = await get(`${srv.url}/%`)
      expect(res.status).toBe(400)
    } finally {
      await srv.close()
    }
  })

  it('serves a valid static file', async () => {
    const root = makeRoot()
    fs.writeFileSync(path.join(root, 'index.html'), '<html></html>')
    const srv = await startLocalRendererServer(root)
    try {
      const res = await get(`${srv.url}/`)
      expect(res.status).toBe(200)
      expect(res.body).toContain('<html>')
    } finally {
      await srv.close()
    }
  })

  it('returns 404 for missing files', async () => {
    const root = makeRoot()
    const srv = await startLocalRendererServer(root)
    try {
      const res = await get(`${srv.url}/not-here.js`)
      expect(res.status).toBe(404)
    } finally {
      await srv.close()
    }
  })

  it('returns 405 for non-GET/HEAD methods', async () => {
    const root = makeRoot()
    const srv = await startLocalRendererServer(root)
    try {
      const res = await new Promise<{ status: number }>((resolve, reject) => {
        const req = http.request(srv.url, { method: 'POST', agent: false }, (r) => {
          resolve({ status: r.statusCode ?? 0 })
        })
        req.on('error', reject)
        req.end()
      })
      expect(res.status).toBe(405)
    } finally {
      await srv.close()
    }
  })
})
