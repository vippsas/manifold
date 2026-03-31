import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  readPackageManifest,
  summarizeRepoStructure,
  type PackageManifestSnapshot,
  type RepoStructureSummary,
} from './repo-structure-summary'

const MAX_DOCS = 16
const MAX_DOC_BYTES = 24_000

export interface LoadedProjectDocument {
  path: string
  kind: 'readme' | 'doc' | 'note'
  content: string
}

export interface LoadedLocalProjectInput {
  projectId: string
  projectName: string
  projectPath: string
  documents: LoadedProjectDocument[]
  packageManifest: PackageManifestSnapshot | null
  repoStructure: RepoStructureSummary
  recentChangeHints: string[]
}

export function loadLocalProjectInput(
  projectId: string,
  projectName: string,
  projectPath: string,
): LoadedLocalProjectInput {
  const packageManifest = readPackageManifest(projectPath)
  const repoStructure = summarizeRepoStructure(projectPath, packageManifest)
  const documents = loadProjectDocuments(projectPath)
  const recentChangeHints = loadRecentChangeHints(projectPath)

  return {
    projectId,
    projectName,
    projectPath,
    documents,
    packageManifest,
    repoStructure,
    recentChangeHints,
  }
}

function loadProjectDocuments(projectPath: string): LoadedProjectDocument[] {
  const documentPaths = [
    ...collectRootReadmes(projectPath),
    ...collectTopLevelNoteFiles(projectPath),
    ...collectTopLevelMarkdown(projectPath),
    ...collectDocsMarkdown(projectPath),
  ]

  const uniquePaths = [...new Set(documentPaths)].slice(0, MAX_DOCS)
  const documents: LoadedProjectDocument[] = []

  for (const absolutePath of uniquePaths) {
    const content = readDocument(absolutePath)
    if (!content) continue

    const relativePath = path.relative(projectPath, absolutePath) || path.basename(absolutePath)
    const isReadme = /^readme/i.test(path.basename(absolutePath))
    const isNamedNote = /^(todo|roadmap|plan|notes?|backlog|issues?)(\..+)?$/i.test(path.basename(absolutePath))
    documents.push({
      path: relativePath,
      kind: isReadme ? 'readme' : (isNamedNote ? 'note' : 'doc'),
      content,
    })
  }

  return documents
}

function collectRootReadmes(projectPath: string): string[] {
  try {
    return fs.readdirSync(projectPath)
      .filter((name) => /^README/i.test(name))
      .map((name) => path.join(projectPath, name))
  } catch {
    return []
  }
}

function collectTopLevelNoteFiles(projectPath: string): string[] {
  try {
    return fs.readdirSync(projectPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /^(todo|roadmap|plan|notes?|backlog|issues?)(\..+)?$/i.test(name))
      .map((name) => path.join(projectPath, name))
  } catch {
    return []
  }
}

function collectTopLevelMarkdown(projectPath: string): string[] {
  try {
    return fs.readdirSync(projectPath)
      .filter((name) => /\.mdx?$/i.test(name) && !/^README/i.test(name))
      .map((name) => path.join(projectPath, name))
  } catch {
    return []
  }
}

function collectDocsMarkdown(projectPath: string): string[] {
  const docsRoot = path.join(projectPath, 'docs')
  if (!fs.existsSync(docsRoot)) return []
  const matches: string[] = []
  walkMarkdownFiles(docsRoot, matches)
  return matches
}

function walkMarkdownFiles(dirPath: string, matches: string[]): void {
  if (matches.length >= MAX_DOCS) return

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (matches.length >= MAX_DOCS) return
    const absolutePath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walkMarkdownFiles(absolutePath, matches)
      continue
    }
    if (/\.mdx?$/i.test(entry.name)) {
      matches.push(absolutePath)
    }
  }
}

function readDocument(absolutePath: string): string | null {
  try {
    const stats = fs.statSync(absolutePath)
    if (stats.size > MAX_DOC_BYTES) return null
    const content = fs.readFileSync(absolutePath, 'utf-8').trim()
    return content || null
  } catch {
    return null
  }
}

function loadRecentChangeHints(projectPath: string): string[] {
  const hints = [
    ...readRecentPullRequestHints(projectPath),
    ...readGitStatusHints(projectPath),
    ...readRecentCommitHints(projectPath),
  ]

  return [...new Set(hints)].slice(0, 6)
}

function readRecentPullRequestHints(projectPath: string): string[] {
  try {
    const output = execFileSync(
      'git',
      ['log', '--format=%s', '--max-count=15'],
      { cwd: projectPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => /#\d+/.test(line) || /^merge pull request #\d+/i.test(line))
      .slice(0, 3)
      .map((line) => `Recent PR: ${line}`)
  } catch {
    return []
  }
}

function readGitStatusHints(projectPath: string): string[] {
  try {
    const output = execFileSync(
      'git',
      ['status', '--short', '--untracked-files=no'],
      { cwd: projectPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((line) => {
        const filePath = line.slice(3).trim()
        if (!filePath) return null
        return `Local changes touch ${filePath}.`
      })
      .filter((hint): hint is string => hint !== null)
  } catch {
    return []
  }
}

function readRecentCommitHints(projectPath: string): string[] {
  try {
    const output = execFileSync(
      'git',
      ['log', '--format=%s', '--max-count=4'],
      { cwd: projectPath, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `Recent work: ${line}`)
  } catch {
    return []
  }
}
