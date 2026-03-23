import * as fs from 'node:fs'
import path from 'node:path'
import type {
  ProvisionerConfig,
  ProvisionerStatus,
  ProvisionerTemplate,
} from '../../shared/provisioning-types'
import { fingerprintProvisioner } from './provisioner-command'

const CATALOG_TTL_MS = 15 * 60 * 1000

interface CachedProvisionerEntry {
  fingerprint: string
  templates: ProvisionerTemplate[]
  fetchedAt: string
  staleAt: string
  status?: ProvisionerStatus
}

interface CatalogCacheFile {
  version: 1
  entries: Record<string, CachedProvisionerEntry>
}

export class ProvisioningCatalogCache {
  constructor(private readonly cacheFile: string) {}

  get(provisioner: ProvisionerConfig): CachedProvisionerEntry | null {
    const file = this.read()
    const entry = file.entries[provisioner.id]
    if (!entry) return null
    return entry.fingerprint === fingerprintProvisioner(provisioner) ? entry : null
  }

  write(
    provisioner: ProvisionerConfig,
    templates: ProvisionerTemplate[],
    status?: ProvisionerStatus,
    fetchedAt = new Date(),
  ): CachedProvisionerEntry {
    const file = this.read()
    const entry: CachedProvisionerEntry = {
      fingerprint: fingerprintProvisioner(provisioner),
      templates,
      fetchedAt: fetchedAt.toISOString(),
      staleAt: new Date(fetchedAt.getTime() + CATALOG_TTL_MS).toISOString(),
      status,
    }
    file.entries[provisioner.id] = entry
    this.writeFile(file)
    return entry
  }

  updateStatus(provisioner: ProvisionerConfig, status: ProvisionerStatus): void {
    const file = this.read()
    const entry = file.entries[provisioner.id]
    if (!entry || entry.fingerprint !== fingerprintProvisioner(provisioner)) return
    entry.status = status
    this.writeFile(file)
  }

  isStale(entry: CachedProvisionerEntry): boolean {
    return Date.now() > new Date(entry.staleAt).getTime()
  }

  private read(): CatalogCacheFile {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        return { version: 1, entries: {} }
      }
      const parsed = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8')) as CatalogCacheFile
      return parsed?.version === 1 && parsed.entries ? parsed : { version: 1, entries: {} }
    } catch {
      return { version: 1, entries: {} }
    }
  }

  private writeFile(file: CatalogCacheFile): void {
    fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true })
    fs.writeFileSync(this.cacheFile, JSON.stringify(file, null, 2), 'utf-8')
  }
}
