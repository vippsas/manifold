import type { ProvisionerConfig } from '../../../../shared/provisioning-types'

export function parseProvisionerArgs(text: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of text) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (escaping) current += '\\'
  if (current || quote) args.push(current)
  return args
}

export function stringifyProvisionerArgs(args?: string[]): string {
  return (args ?? [])
    .map((arg) => {
      if (arg === '') return '""'
      if (/^[^\s"'\\]+$/.test(arg)) return arg
      return `"${arg.replace(/([\\"])/g, '\\$1')}"`
    })
    .join(' ')
}

export function createExternalProvisioner(existing: ProvisionerConfig[]): ProvisionerConfig {
  let suffix = existing.length + 1
  let id = `external-cli-${suffix}`
  while (existing.some((entry) => entry.id === id)) {
    suffix += 1
    id = `external-cli-${suffix}`
  }
  return {
    id,
    label: `External Provisioner ${suffix}`,
    type: 'cli',
    enabled: true,
    command: '',
    args: [],
  }
}

export function validateProvisioners(provisioners: ProvisionerConfig[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  const ids = new Map<string, number>()

  for (const provisioner of provisioners) {
    const nextErrors: string[] = []
    const trimmedId = provisioner.id.trim()

    if (!trimmedId) nextErrors.push('Provisioner id is required.')
    if (!provisioner.label.trim()) nextErrors.push('Provisioner label is required.')
    if (provisioner.type === 'cli' && !provisioner.command?.trim()) nextErrors.push('CLI provisioners require a command.')

    ids.set(trimmedId, (ids.get(trimmedId) ?? 0) + 1)
    errors[provisioner.id] = nextErrors
  }

  for (const provisioner of provisioners) {
    const trimmedId = provisioner.id.trim()
    if (trimmedId && (ids.get(trimmedId) ?? 0) > 1) {
      errors[provisioner.id] = [...errors[provisioner.id], 'Provisioner ids must be unique.']
    }
  }

  return errors
}
