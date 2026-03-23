// @vitest-environment node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { PROVISIONER_PROTOCOL_VERSION } from '../../shared/provisioning-types'
import { runProvisionerRequest } from './provisioner-process'

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'cli-provisioner-fixture.js')

describe('runProvisionerRequest', () => {
  it('streams progress and resolves the final result', async () => {
    const progress = vi.fn()
    const result = await runProvisionerRequest<{ displayName: string; repoUrl: string }>(
      process.execPath,
      [fixturePath, 'good'],
      {
        protocolVersion: PROVISIONER_PROTOCOL_VERSION,
        operation: 'create',
        requestId: 'req-1',
        templateId: 'company-service',
        inputs: {
          name: 'fixture-app',
          description: 'Provisioned from a fixture.',
        },
      },
      progress,
    )

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Fixture preparing repository...' }))
    expect(result.displayName).toBe('fixture-app')
    expect(result.repoUrl).toContain('fixture-app')
  })

  it('rejects on malformed JSON output', async () => {
    await expect(
      runProvisionerRequest(
        process.execPath,
        [fixturePath, 'bad-json'],
        {
          protocolVersion: PROVISIONER_PROTOCOL_VERSION,
          operation: 'listTemplates',
        },
      ),
    ).rejects.toThrow('Invalid provisioner JSON output')
  })

  it('rejects when the provisioner times out', async () => {
    await expect(
      runProvisionerRequest(
        process.execPath,
        [fixturePath, 'slow'],
        {
          protocolVersion: PROVISIONER_PROTOCOL_VERSION,
          operation: 'create',
          requestId: 'req-timeout',
          templateId: 'company-service',
          inputs: {
            name: 'timeout-app',
            description: 'This request should time out.',
          },
        },
        undefined,
        { timeoutMs: 10 },
      ),
    ).rejects.toThrow('Provisioner timed out')
  })
})
