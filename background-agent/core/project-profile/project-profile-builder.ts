import type { BackgroundAgentProjectProfile } from '../../../schemas/background-agent-types'
import type { LoadedLocalProjectInput } from '../../../connectors/local-project/local-project-loader'

const WORKFLOW_HEADING_BLACKLIST = new Set([
  'installation',
  'getting started',
  'development',
  'contributing',
  'license',
  'testing',
])

export function buildProjectProfile(input: LoadedLocalProjectInput): BackgroundAgentProjectProfile {
  const readme = input.documents.find((document) => document.kind === 'readme') ?? null
  const summary = extractSummary(readme?.content ?? '') ?? input.packageManifest?.description?.trim() ?? `Project ${input.projectName}`
  const productType = inferProductType(summary, input)
  const targetUser = inferTargetUser(summary, readme?.content ?? '')
  const majorWorkflows = extractMajorWorkflows(readme?.content ?? '')
  const architectureShape = inferArchitectureShape(input)
  const dependencyStack = deriveDependencyStack(input)
  const openQuestions = deriveOpenQuestions(input)

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    projectPath: input.projectPath,
    summary,
    productType,
    targetUser,
    majorWorkflows,
    architectureShape,
    dependencyStack,
    openQuestions,
    sourcePaths: input.documents.map((document) => document.path),
    generatedAt: new Date().toISOString(),
  }
}

function extractSummary(markdown: string): string | null {
  if (!markdown.trim()) return null
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return paragraphs.find((paragraph) => paragraph.length >= 40) ?? paragraphs[0] ?? null
}

function inferProductType(summary: string, input: LoadedLocalProjectInput): string | null {
  const haystack = `${summary} ${input.packageManifest?.description ?? ''}`.toLowerCase()
  if (haystack.includes('developer') || haystack.includes('coding') || haystack.includes('cli')) {
    return 'Developer tool'
  }
  if (input.repoStructure.probableStack.includes('electron') && input.repoStructure.probableStack.includes('react')) {
    return 'Desktop application'
  }
  return input.packageManifest?.description?.trim() || null
}

function inferTargetUser(summary: string, markdown: string): string | null {
  const haystack = `${summary}\n${markdown}`.toLowerCase()
  if (haystack.includes('developers') || haystack.includes('developer')) return 'Developers'
  if (haystack.includes('engineers') || haystack.includes('engineering')) return 'Engineering teams'
  if (haystack.includes('teams')) return 'Product and engineering teams'
  return null
}

function extractMajorWorkflows(markdown: string): string[] {
  const headings = [...markdown.matchAll(/^##+\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((heading) => heading.length > 0)
    .filter((heading) => !WORKFLOW_HEADING_BLACKLIST.has(heading.toLowerCase()))

  return [...new Set(headings)].slice(0, 5)
}

function inferArchitectureShape(input: LoadedLocalProjectInput): string | null {
  const entries = new Set(input.repoStructure.topLevelEntries)
  if (entries.has('src') && input.repoStructure.probableStack.includes('electron') && input.repoStructure.probableStack.includes('react')) {
    return 'Electron desktop app with separate main and renderer layers'
  }
  if (entries.has('src') && input.repoStructure.probableStack.includes('react')) {
    return 'TypeScript application with a React UI layer'
  }
  if (entries.has('src')) {
    return 'TypeScript application with a multi-layer source tree'
  }
  return null
}

function deriveDependencyStack(input: LoadedLocalProjectInput): string[] {
  const important = [
    'electron',
    'electron-vite',
    'react',
    'react-dom',
    'vite',
    'typescript',
    'better-sqlite3',
    'dockview',
  ]
  const deps = new Set([
    ...(input.packageManifest?.dependencies ?? []),
    ...(input.packageManifest?.devDependencies ?? []),
    ...input.repoStructure.probableStack,
  ])

  return important.filter((name) => deps.has(name)).slice(0, 6)
}

function deriveOpenQuestions(input: LoadedLocalProjectInput): string[] {
  return input.documents
    .map((document) => document.path)
    .filter((documentPath) => documentPath.startsWith('docs/planning/') || documentPath.startsWith('docs/research/'))
    .map(humanizeDocumentName)
    .slice(0, 5)
}

function humanizeDocumentName(documentPath: string): string {
  const filename = documentPath.split('/').pop() ?? documentPath
  const withoutDate = filename.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  return withoutDate
    .replace(/\.mdx?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
