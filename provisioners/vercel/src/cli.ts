import {
  PROVISIONER_PROTOCOL_VERSION,
  type CreateProvisionerRequest,
  type ListTemplatesProvisionerRequest,
  type ProvisionerRequest,
} from '../../../src/shared/provisioning-types'
import { getTemplates, TEMPLATE_REPOS } from './templates'
import { checkGhCli, createRepoFromTemplate } from './github'

function writeEvent(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

async function handleListTemplates(_request: ListTemplatesProvisionerRequest): Promise<void> {
  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'result',
    result: getTemplates(),
  })
}

async function handleCreate(request: CreateProvisionerRequest): Promise<void> {
  const name = String(request.inputs.name).trim()
  if (!name) {
    throw new Error('Repository name is required')
  }

  const templateRepo = TEMPLATE_REPOS[request.templateId]
  if (!templateRepo) {
    throw new Error(`Unknown template: ${request.templateId}`)
  }

  const owner = request.inputs.owner ? String(request.inputs.owner).trim() : undefined

  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'progress',
    requestId: request.requestId,
    message: 'Creating repository on GitHub...',
    stage: 'provisioning',
    status: 'running',
  })

  const { repoUrl, fullName } = await createRepoFromTemplate(templateRepo, name, owner)
  const actualRepoName = fullName.split('/').pop()!

  if (actualRepoName !== name) {
    writeEvent({
      protocolVersion: PROVISIONER_PROTOCOL_VERSION,
      event: 'progress',
      requestId: request.requestId,
      message: `Repository name adjusted to "${actualRepoName}" (GitHub does not allow special characters).`,
      stage: 'provisioning',
      status: 'running',
    })
  }

  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'progress',
    requestId: request.requestId,
    message: `Repository ${fullName} ready.`,
    stage: 'provisioning',
    status: 'done',
  })

  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'result',
    requestId: request.requestId,
    result: {
      displayName: actualRepoName,
      repoUrl,
      defaultBranch: 'main',
      metadata: {
        templateRepo,
        githubFullName: fullName,
      },
    },
  })
}

async function handleHealth(): Promise<void> {
  const status = await checkGhCli()

  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'result',
    result: {
      healthy: status.authenticated,
      summary: status.authenticated
        ? `gh CLI authenticated as ${status.user}`
        : status.error,
      capabilities: ['listTemplates', 'create', 'health'],
    },
  })
}

async function main(): Promise<void> {
  const raw = await new Promise<string>((resolve, reject) => {
    let buffer = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      buffer += chunk
    })
    process.stdin.on('end', () => resolve(buffer))
    process.stdin.on('error', reject)
  })

  const request = JSON.parse(raw) as ProvisionerRequest
  if (request.protocolVersion !== PROVISIONER_PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${request.protocolVersion}`)
  }

  if (request.operation === 'listTemplates') {
    await handleListTemplates(request)
    return
  }

  if (request.operation === 'create') {
    await handleCreate(request)
    return
  }

  if (request.operation === 'health') {
    await handleHealth()
    return
  }

  throw new Error(`Unsupported operation: ${(request as { operation?: string }).operation ?? 'unknown'}`)
}

void main().catch((err) => {
  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'error',
    error: {
      message: err instanceof Error ? err.message : String(err),
    },
  })
  process.exitCode = 1
})
