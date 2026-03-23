import { createHash } from 'node:crypto'
import path from 'node:path'
import type { ProvisionerConfig } from '../../shared/provisioning-types'
import { ProvisioningError } from './provisioning-errors'

export function resolveProvisionerCommand(provisioner: ProvisionerConfig): { command: string; args: string[] } {
  if (provisioner.type === 'builtin') {
    if (provisioner.id !== 'oss-bundled') {
      throw new ProvisioningError('settings_invalid', `Unknown builtin provisioner: ${provisioner.id}`, {
        code: 'unknown_builtin_provisioner',
      })
    }
    return {
      command: process.execPath,
      args: [path.join(__dirname, 'oss-provisioner.js')],
    }
  }

  if (!provisioner.command?.trim()) {
    throw new ProvisioningError('settings_invalid', `Provisioner command is required for ${provisioner.id}`, {
      code: 'missing_provisioner_command',
    })
  }

  return {
    command: provisioner.command,
    args: provisioner.args ?? [],
  }
}

export function fingerprintProvisioner(provisioner: ProvisionerConfig): string {
  return createHash('sha1')
    .update(JSON.stringify({
      id: provisioner.id,
      type: provisioner.type,
      label: provisioner.label,
      command: provisioner.command ?? '',
      args: provisioner.args ?? [],
      enabled: provisioner.enabled,
    }))
    .digest('hex')
}
