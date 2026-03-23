import {
  PROVISIONER_PROTOCOL_VERSION,
  type CreateProvisionerRequest,
  type ListTemplatesProvisionerRequest,
  type ProvisionerRequest,
} from '../../shared/provisioning-types'
import { createBundledTemplateSource, getBundledTemplates } from './oss-provisioner-core'

function writeEvent(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

async function handleListTemplates(_request: ListTemplatesProvisionerRequest): Promise<void> {
  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'result',
    result: getBundledTemplates(),
  })
}

async function handleCreate(request: CreateProvisionerRequest): Promise<void> {
  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'progress',
    requestId: request.requestId,
    message: 'Preparing template source...',
  })

  const result = await createBundledTemplateSource(request.templateId, request.inputs)

  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'progress',
    requestId: request.requestId,
    message: 'Template source is ready.',
  })

  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'result',
    requestId: request.requestId,
    result,
  })
}

async function handleHealth(): Promise<void> {
  writeEvent({
    protocolVersion: PROVISIONER_PROTOCOL_VERSION,
    event: 'result',
    result: { healthy: true },
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
