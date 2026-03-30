import * as fs from 'node:fs'
import * as path from 'node:path'

export interface PackageManifestSnapshot {
  name?: string
  description?: string
  dependencies: string[]
  devDependencies: string[]
  scripts: string[]
}

export interface RepoStructureSummary {
  topLevelEntries: string[]
  docDirectories: string[]
  probableStack: string[]
  hasPackageJson: boolean
}

export function readPackageManifest(projectPath: string): PackageManifestSnapshot | null {
  const manifestPath = path.join(projectPath, 'package.json')
  if (!fs.existsSync(manifestPath)) return null

  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      name?: string
      description?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }
    return {
      name: parsed.name,
      description: parsed.description,
      dependencies: Object.keys(parsed.dependencies ?? {}),
      devDependencies: Object.keys(parsed.devDependencies ?? {}),
      scripts: Object.keys(parsed.scripts ?? {}),
    }
  } catch {
    return null
  }
}

export function summarizeRepoStructure(
  projectPath: string,
  packageManifest: PackageManifestSnapshot | null,
): RepoStructureSummary {
  let topLevelEntries: string[] = []
  try {
    topLevelEntries = fs.readdirSync(projectPath, { withFileTypes: true })
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
  } catch {
    topLevelEntries = []
  }

  const docDirectories = topLevelEntries.filter((entry) => entry === 'docs' || entry === 'planning')
  const candidateDeps = new Set([
    ...(packageManifest?.dependencies ?? []),
    ...(packageManifest?.devDependencies ?? []),
  ])
  const probableStack: string[] = []
  const hasSrcDirectory = topLevelEntries.includes('src')
  const hasElectronDependency = Array.from(candidateDeps).some((dependency) => (
    dependency === 'electron' ||
    dependency === 'electron-vite' ||
    dependency === 'electron-builder' ||
    dependency.startsWith('@electron/')
  ))
  const hasElectronStructure = (
    fs.existsSync(path.join(projectPath, 'src', 'main')) ||
    fs.existsSync(path.join(projectPath, 'src', 'preload')) ||
    topLevelEntries.some((entry) => /^electron\.vite\.config\./i.test(entry))
  )

  if (hasElectronDependency || hasElectronStructure) probableStack.push('electron')
  if (candidateDeps.has('react') || candidateDeps.has('react-dom')) probableStack.push('react')
  if (candidateDeps.has('vite') || candidateDeps.has('electron-vite')) probableStack.push('vite')
  if (candidateDeps.has('typescript')) probableStack.push('typescript')
  if (hasSrcDirectory) probableStack.push('node')
  if (hasSrcDirectory && topLevelEntries.includes('docs')) probableStack.push('docs-driven')

  return {
    topLevelEntries,
    docDirectories,
    probableStack: [...new Set(probableStack)],
    hasPackageJson: packageManifest !== null,
  }
}
