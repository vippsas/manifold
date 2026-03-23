import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ProvisioningReadyResult } from '../../shared/provisioning-types'
import { getBundledTemplates, slugify, templateFiles, templateVersion } from './oss-provisioner-template'

const execFileAsync = promisify(execFile)
const CACHE_ROOT = path.join(os.tmpdir(), 'manifold-oss-provisioner-cache')
const TEMPLATE_ROOT = path.join(CACHE_ROOT, 'templates')
const GENERATED_ROOT = path.join(CACHE_ROOT, 'generated')
const GENERATED_RETENTION_MS = 24 * 60 * 60 * 1000
const VERSION_FILE = '.manifold-template-version'

async function gitCommitAll(cwd: string, message: string): Promise<void> {
  await execFileAsync('git', ['add', '.'], { cwd })
  await execFileAsync('git', ['-c', 'user.email=manifold@local', '-c', 'user.name=Manifold', 'commit', '-m', message], { cwd })
}

function writeFiles(baseDir: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(baseDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf-8')
  }
}

function pruneGeneratedRepos(): void {
  if (!fs.existsSync(GENERATED_ROOT)) return
  for (const entry of fs.readdirSync(GENERATED_ROOT)) {
    const absolutePath = path.join(GENERATED_ROOT, entry)
    try {
      if (Date.now() - fs.statSync(absolutePath).mtimeMs > GENERATED_RETENTION_MS) {
        fs.rmSync(absolutePath, { recursive: true, force: true })
      }
    } catch {
      // Ignore prune failures.
    }
  }
}

function readTemplateVersion(templateDir: string): string | null {
  try {
    return fs.readFileSync(path.join(templateDir, VERSION_FILE), 'utf-8').trim() || null
  } catch {
    return null
  }
}

function writeTemplateVersion(templateDir: string, version: string): void {
  fs.writeFileSync(path.join(templateDir, VERSION_FILE), `${version}\n`, 'utf-8')
}

async function rebuildSharedTemplateRepo(templateId: string): Promise<string> {
  const template = getBundledTemplates().find((entry) => entry.id === templateId)
  if (!template) throw new Error(`Unknown bundled template: ${templateId}`)

  const templateDir = path.join(TEMPLATE_ROOT, templateId)
  fs.rmSync(templateDir, { recursive: true, force: true })
  fs.mkdirSync(templateDir, { recursive: true })
  writeFiles(templateDir, templateFiles(template.title, template.description))
  writeTemplateVersion(templateDir, templateVersion(template))
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: templateDir })
  await gitCommitAll(templateDir, `Template: ${template.title}`)
  return templateDir
}

export { getBundledTemplates }

export async function ensureSharedTemplateRepo(templateId: string): Promise<string> {
  const template = getBundledTemplates().find((entry) => entry.id === templateId)
  if (!template) throw new Error(`Unknown bundled template: ${templateId}`)

  const templateDir = path.join(TEMPLATE_ROOT, templateId)
  const gitDir = path.join(templateDir, '.git')
  const expectedVersion = templateVersion(template)

  if (fs.existsSync(gitDir) && readTemplateVersion(templateDir) === expectedVersion) {
    return templateDir
  }

  return rebuildSharedTemplateRepo(templateId)
}

export async function createBundledTemplateSource(
  templateId: string,
  inputs: Record<string, string | boolean>,
): Promise<ProvisioningReadyResult> {
  pruneGeneratedRepos()

  const sharedTemplateRepo = await ensureSharedTemplateRepo(templateId)
  fs.mkdirSync(GENERATED_ROOT, { recursive: true })

  const requestedName = String(inputs.name ?? templateId).trim()
  const requestedDescription = String(inputs.description ?? '').trim()
  const displayName = slugify(requestedName || templateId)
  const sourceDir = fs.mkdtempSync(path.join(GENERATED_ROOT, `${displayName}-`))

  await execFileAsync('git', ['clone', '--', sharedTemplateRepo, sourceDir])
  await execFileAsync('git', ['remote', 'remove', 'origin'], { cwd: sourceDir }).catch(() => {})
  writeFiles(sourceDir, templateFiles(requestedName || displayName, requestedDescription))
  await gitCommitAll(sourceDir, 'Customize starter app')

  return {
    displayName,
    repoUrl: sourceDir,
    defaultBranch: 'main',
    metadata: { templateId, requestedName },
  }
}
