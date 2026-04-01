// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Project } from '../../shared/types'
import type { ProvisionerTemplate, ProvisioningReadyResult } from '../../shared/provisioning-types'
import type { ProvisionerConfig } from '../../shared/provisioning-types'
import { encodeProvisioningTemplateQualifiedId } from '../../shared/provisioning-qualified-id'
import { ProvisioningDispatcher } from './provisioning-dispatcher'
import * as materializer from './provisioning-materializer'
import * as provisionerProcess from './provisioner-process'

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'cli-provisioner-fixture.js')
const tempRoots = new Set<string>()

function createStorageRoot(): string {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-provisioning-test-'))
  tempRoots.add(storageRoot)
  return storageRoot
}

function createDispatcher(provisioners: ProvisionerConfig[], storagePath: string) {
  const addProject = vi.fn(async (projectPath: string): Promise<Project> => ({
    id: 'project-1',
    name: path.basename(projectPath),
    path: projectPath,
    baseBranch: 'main',
    addedAt: new Date().toISOString(),
  }))

  const settingsStore = {
    getSettings: () => ({
      storagePath,
      provisioning: { provisioners },
    }),
  }

  const projectRegistry = {
    addProject,
  }

  const dispatcher = new ProvisioningDispatcher(
    settingsStore as never,
    projectRegistry as never,
  )

  return { dispatcher, addProject }
}

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true })
  }
  tempRoots.clear()
  vi.restoreAllMocks()
})

describe('ProvisioningDispatcher', () => {
  it('aggregates templates and ignores failing provisioners', async () => {
    const storageRoot = createStorageRoot()
    const { dispatcher } = createDispatcher([
      {
        id: 'company-ok',
        label: 'Company Templates',
        type: 'cli',
        enabled: true,
        command: process.execPath,
        args: [fixturePath, 'good'],
      },
      {
        id: 'company-broken',
        label: 'Broken Templates',
        type: 'cli',
        enabled: true,
        command: process.execPath,
        args: [fixturePath, 'error'],
      },
    ], storageRoot)

    const catalog = await dispatcher.listTemplates()
    expect(catalog.templates).toHaveLength(1)
    expect(catalog.templates[0]).toEqual(expect.objectContaining({
      qualifiedId: 'company-ok:company-service',
      provisionerLabel: 'Company Templates',
      catalogSource: 'live',
    }))
    expect(catalog.provisioners).toHaveLength(2)
  })

  it('creates a project from an external CLI provisioner and clones into managed storage', async () => {
    const storageRoot = createStorageRoot()
    const { dispatcher, addProject } = createDispatcher([
      {
        id: 'company-ok',
        label: 'Company Templates',
        type: 'cli',
        enabled: true,
        command: process.execPath,
        args: [fixturePath, 'good'],
      },
    ], storageRoot)

    const progress = vi.fn()
    const result = await dispatcher.create({
      templateQualifiedId: 'company-ok:company-service',
      inputs: {
        name: 'ledger-service',
        description: 'Track company ledger entries.',
      },
    }, progress)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected create to succeed')

    const expectedPath = path.join(storageRoot, 'projects', 'ledger-service')
    expect(addProject).toHaveBeenCalledWith(expectedPath)
    expect(fs.existsSync(path.join(expectedPath, '.git'))).toBe(true)
    expect(result.value.project.path).toBe(expectedPath)

    const remotes = execFileSync('git', ['remote'], { cwd: expectedPath }).toString('utf8').trim()
    expect(remotes).toBe('')

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cloning repository into managed storage...' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project ready.' }))
  })

  it('supports provisioner ids that contain colons', async () => {
    const storageRoot = createStorageRoot()
    const provisionerId = 'company:backstage'
    const { dispatcher } = createDispatcher([
      {
        id: provisionerId,
        label: 'Company Templates',
        type: 'cli',
        enabled: true,
        command: process.execPath,
        args: [fixturePath, 'good'],
      },
    ], storageRoot)
    const templateQualifiedId = encodeProvisioningTemplateQualifiedId(provisionerId, 'company-service')

    vi.spyOn(provisionerProcess, 'runProvisionerRequest').mockImplementation(async (_command, _args, request) => {
      if (request.operation === 'listTemplates') {
        return [{
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
        }] as ProvisionerTemplate[] as never
      }

      if (request.operation === 'create') {
        expect(request.templateId).toBe('company-service')
        return {
          displayName: 'ledger-service',
          repoUrl: '/tmp/fake-repo',
          defaultBranch: 'main',
          metadata: { source: 'fixture' },
        } as ProvisioningReadyResult as never
      }

      throw new Error(`Unexpected request operation: ${request.operation}`)
    })

    vi.spyOn(materializer, 'materializeProvisionedProject').mockResolvedValue({
      id: 'project-1',
      name: 'ledger-service',
      path: path.join(storageRoot, 'projects', 'ledger-service'),
      baseBranch: 'main',
      addedAt: new Date().toISOString(),
    })

    const catalog = await dispatcher.listTemplates()
    expect(catalog.templates[0]?.qualifiedId).toBe(templateQualifiedId)

    const result = await dispatcher.create({
      templateQualifiedId,
      inputs: { name: 'ledger-service', description: 'Track company ledger entries.' },
    })

    expect(result.ok).toBe(true)
  })

  it('cleans up the managed directory when clone fails', async () => {
    const storageRoot = createStorageRoot()
    const { dispatcher } = createDispatcher([
      {
        id: 'company-bad-repo',
        label: 'Broken Repo Templates',
        type: 'cli',
        enabled: true,
        command: process.execPath,
        args: [fixturePath, 'bad-repo'],
      },
    ], storageRoot)

    const result = await dispatcher.create({
      templateQualifiedId: 'company-bad-repo:company-service',
      inputs: {
        name: 'broken-app',
        description: 'Should fail to clone.',
      },
    })

    expect(result.ok).toBe(false)

    const managedProjectsRoot = path.join(storageRoot, 'projects')
    const entries = fs.existsSync(managedProjectsRoot) ? fs.readdirSync(managedProjectsRoot) : []
    expect(entries).toEqual([])
  })

  it('returns cached templates when the catalog is already available', async () => {
    const storageRoot = createStorageRoot()
    const { dispatcher } = createDispatcher([
      {
        id: 'company-ok',
        label: 'Company Templates',
        type: 'cli',
        enabled: true,
        command: process.execPath,
        args: [fixturePath, 'good'],
      },
    ], storageRoot)

    const first = await dispatcher.listTemplates()
    const second = await dispatcher.listTemplates()

    expect(first.templates[0]?.catalogSource).toBe('live')
    expect(second.templates[0]?.catalogSource).toBe('cache')
  })

  it('checks health for configured provisioners', async () => {
    const storageRoot = createStorageRoot()
    const { dispatcher } = createDispatcher([
      {
        id: 'company-ok',
        label: 'Company Templates',
        type: 'cli',
        enabled: true,
        command: process.execPath,
        args: [fixturePath, 'good'],
      },
    ], storageRoot)

    const statuses = await dispatcher.checkHealth()
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toEqual(expect.objectContaining({
      provisionerId: 'company-ok',
      state: 'healthy',
    }))
  })

  it('falls back to cached templates when a refresh fails', async () => {
    const storageRoot = createStorageRoot()
    const stateFile = path.join(storageRoot, 'fixture-state.txt')
    fs.writeFileSync(stateFile, 'good', 'utf8')

    const { dispatcher } = createDispatcher([
      {
        id: 'company-stateful',
        label: 'Stateful Templates',
        type: 'cli',
        enabled: true,
        command: process.execPath,
        args: [fixturePath, 'stateful', stateFile],
      },
    ], storageRoot)

    const first = await dispatcher.listTemplates()
    expect(first.templates[0]?.catalogSource).toBe('live')

    fs.writeFileSync(stateFile, 'error', 'utf8')
    const refreshed = await dispatcher.listTemplates(true)

    expect(refreshed.templates[0]).toEqual(expect.objectContaining({
      qualifiedId: 'company-stateful:company-service',
      catalogSource: 'cache',
      isStale: true,
    }))
    expect(refreshed.provisioners[0]).toEqual(expect.objectContaining({
      source: 'cache',
      state: 'unreachable',
    }))
  })
})
