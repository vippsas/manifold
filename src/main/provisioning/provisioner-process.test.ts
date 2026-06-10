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

  it('kills the child after it settles and does not call onProgress for late events', async () => {
    // The 'linger' fixture emits result then keeps emitting progress; child must be reaped.
    const progress = vi.fn()
    const result = await runProvisionerRequest<{ displayName: string; repoUrl: string }>(
      process.execPath,
      [fixturePath, 'linger'],
      {
        protocolVersion: PROVISIONER_PROTOCOL_VERSION,
        operation: 'create',
        requestId: 'req-linger',
        templateId: 'company-service',
        inputs: { name: 'linger-app', description: 'Linger test.' },
      },
      progress,
    )
    expect(result.displayName).toBe('linger-app')
    // Allow a brief moment for any late progress events to arrive if they were not suppressed.
    await new Promise((r) => setTimeout(r, 30))
    // Only the single pre-result progress call should have been recorded.
    const lateCalls = progress.mock.calls.filter(([p]) => p.message === 'late-progress-should-be-ignored')
    expect(lateCalls).toHaveLength(0)
  })

  it('ignores post-settle events (settled guard)', async () => {
    // 'late-progress' fixture emits result then a stray progress event; onProgress must not fire for it.
    const progress = vi.fn()
    await runProvisionerRequest<{ displayName: string; repoUrl: string }>(
      process.execPath,
      [fixturePath, 'late-progress'],
      {
        protocolVersion: PROVISIONER_PROTOCOL_VERSION,
        operation: 'create',
        requestId: 'req-late',
        templateId: 'company-service',
        inputs: { name: 'late-app', description: 'Late progress test.' },
      },
      progress,
    )
    await new Promise((r) => setTimeout(r, 20))
    const lateCalls = progress.mock.calls.filter(([p]) => p.message === 'this-should-never-be-seen')
    expect(lateCalls).toHaveLength(0)
  })
})
