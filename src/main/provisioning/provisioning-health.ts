import type {
  ProvisionerConfig,
  ProvisionerHealthResult,
  ProvisionerStatus,
} from '../../shared/provisioning-types'
import { PROVISIONER_PROTOCOL_VERSION } from '../../shared/provisioning-types'
import { runProvisionerRequest } from './provisioner-process'
import { resolveProvisionerCommand } from './provisioner-command'
import { ProvisioningError, toProvisioningErrorDescriptor } from './provisioning-errors'

function toState(result: ProvisionerHealthResult): ProvisionerStatus['state'] {
  if (!result.healthy) return 'degraded'
  return 'healthy'
}

export async function checkProvisionerHealth(provisioner: ProvisionerConfig): Promise<ProvisionerStatus> {
  try {
    const { command, args } = resolveProvisionerCommand(provisioner)
    const result = await runProvisionerRequest<ProvisionerHealthResult>(
      command,
      args,
      { protocolVersion: PROVISIONER_PROTOCOL_VERSION, operation: 'health' },
      undefined,
      { timeoutMs: 15_000 },
    )
    const checkedAt = result.checkedAt ?? new Date().toISOString()
    return {
      provisionerId: provisioner.id,
      provisionerLabel: provisioner.label,
      enabled: provisioner.enabled,
      source: 'none',
      state: toState(result),
      templateCount: 0,
      checkedAt,
      summary: result.summary ?? (result.healthy ? 'Healthy' : 'Degraded'),
      version: result.version,
      capabilities: result.capabilities,
    }
  } catch (error) {
    const descriptor = toProvisioningErrorDescriptor(
      error instanceof ProvisioningError ? error : new ProvisioningError('health_check_failed', error instanceof Error ? error.message : String(error)),
      'health_check_failed',
    )
    return {
      provisionerId: provisioner.id,
      provisionerLabel: provisioner.label,
      enabled: provisioner.enabled,
      source: 'none',
      state: descriptor.category === 'settings_invalid' ? 'misconfigured' : 'unreachable',
      templateCount: 0,
      checkedAt: new Date().toISOString(),
      summary: descriptor.message,
      error: descriptor,
    }
  }
}
