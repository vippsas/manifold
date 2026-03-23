#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const mode = process.argv[2] || 'good'
const PROTOCOL_VERSION = 1

function write(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

function createRepo(prefix) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  fs.writeFileSync(path.join(repoRoot, 'README.md'), `# ${prefix}\n`, 'utf8')
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: repoRoot })
  execFileSync('git', ['add', '.'], { cwd: repoRoot })
  execFileSync(
    'git',
    ['-c', 'user.email=fixture@local', '-c', 'user.name=Fixture', 'commit', '-m', 'Initial commit'],
    { cwd: repoRoot },
  )
  return repoRoot
}

async function readRequest() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return JSON.parse(chunks.join(''))
}

async function main() {
  const request = await readRequest()
  if (request.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${request.protocolVersion}`)
  }

  if (mode === 'bad-json') {
    process.stdout.write('{not-json}\n')
    return
  }

  if (mode === 'error') {
    process.stderr.write('fixture failed\n')
    process.exitCode = 1
    return
  }

  if (request.operation === 'listTemplates') {
    write({
      protocolVersion: PROTOCOL_VERSION,
      event: 'result',
      result: [
        {
          id: 'company-service',
          title: 'Company Service',
          description: 'External CLI provisioner fixture.',
          category: 'Backend',
          tags: ['fixture'],
          paramsSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', title: 'Service name' },
              description: { type: 'string', title: 'Description', multiline: true },
            },
            required: ['name', 'description'],
          },
        },
      ],
    })
    return
  }

  if (request.operation === 'health') {
    write({
      protocolVersion: PROTOCOL_VERSION,
      event: 'result',
      result: { healthy: true },
    })
    return
  }

  if (request.operation === 'create') {
    write({
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      event: 'progress',
      message: 'Fixture preparing repository...',
    })

    if (mode === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    if (mode === 'bad-repo') {
      write({
        protocolVersion: PROTOCOL_VERSION,
        requestId: request.requestId,
        event: 'result',
        result: {
          displayName: String(request.inputs.name || 'bad-repo'),
          repoUrl: '/definitely/missing/repository',
          defaultBranch: 'main',
        },
      })
      return
    }

    const repoPath = createRepo(String(request.inputs.name || 'fixture-service'))
    write({
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      event: 'result',
      result: {
        displayName: String(request.inputs.name || 'fixture-service'),
        repoUrl: repoPath,
        defaultBranch: 'main',
        metadata: {
          source: 'fixture',
        },
      },
    })
    return
  }

  throw new Error(`Unsupported operation: ${request.operation}`)
}

main().catch((err) => {
  write({
    protocolVersion: PROTOCOL_VERSION,
    event: 'error',
    error: { message: err instanceof Error ? err.message : String(err) },
  })
  process.exitCode = 1
})
