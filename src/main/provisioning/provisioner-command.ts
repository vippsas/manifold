import { createHash } from 'node:crypto'
import path from 'node:path'
import { app } from 'electron'
import type { ProvisionerConfig } from '../../shared/provisioning-types'
import { ProvisioningError } from './provisioning-errors'

const BUILTIN_PROVISIONERS: Record<string, string> = {
  'vercel-bundled': 'vercel-provisioner.js',
}

export function resolveProvisionerCommand(provisioner: ProvisionerConfig): { command: string; args: string[] } {
  if (provisioner.type === 'builtin') {
    const filename = BUILTIN_PROVISIONERS[provisioner.id]
    if (!filename) {
      throw new ProvisioningError('settings_invalid', `Unknown builtin provisioner: ${provisioner.id}`, {
        code: 'unknown_builtin_provisioner',
      })
    }
    return {
      command: process.execPath,
      args: [path.join(__dirname, filename)],
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
  const appVersion = provisioner.type === 'builtin' ? safeAppVersion() : ''
  return createHash('sha1')
    .update(JSON.stringify({
      id: provisioner.id,
      type: provisioner.type,
      label: provisioner.label,
      command: provisioner.command ?? '',
      args: provisioner.args ?? [],
      enabled: provisioner.enabled,
      appVersion,
    }))
    .digest('hex')
}

function safeAppVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return ''
  }
}
