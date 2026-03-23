// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Project } from '../../shared/types'
import type { ProvisionerConfig } from '../../shared/provisioning-types'
import { ProvisioningDispatcher } from './provisioning-dispatcher'

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

    const templates = await dispatcher.listTemplates()
    expect(templates).toHaveLength(1)
    expect(templates[0]).toEqual(expect.objectContaining({
      qualifiedId: 'company-ok:company-service',
      provisionerLabel: 'Company Templates',
    }))
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

    const expectedPath = path.join(storageRoot, 'projects', 'ledger-service')
    expect(addProject).toHaveBeenCalledWith(expectedPath)
    expect(fs.existsSync(path.join(expectedPath, '.git'))).toBe(true)
    expect(result.project.path).toBe(expectedPath)

    const remotes = execFileSync('git', ['remote'], { cwd: expectedPath }).toString('utf8').trim()
    expect(remotes).toBe('')

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cloning repository into managed storage...' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project ready.' }))
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

    await expect(
      dispatcher.create({
        templateQualifiedId: 'company-bad-repo:company-service',
        inputs: {
          name: 'broken-app',
          description: 'Should fail to clone.',
        },
      }),
    ).rejects.toThrow()

    const managedProjectsRoot = path.join(storageRoot, 'projects')
    const entries = fs.existsSync(managedProjectsRoot) ? fs.readdirSync(managedProjectsRoot) : []
    expect(entries).toEqual([])
  })
})
