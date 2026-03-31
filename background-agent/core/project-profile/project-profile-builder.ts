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
  const recentChanges = input.recentChangeHints.slice(0, 4)

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
    recentChanges,
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
  const extracted = input.documents
    .filter((document) => (
      document.kind === 'note' ||
      document.path.startsWith('docs/planning/') ||
      document.path.startsWith('docs/research/') ||
      /todo|roadmap|notes|architecture/i.test(document.path)
    ))
    .flatMap((document) => extractOpenQuestionCandidates(document.content))

  if (extracted.length > 0) {
    return [...new Set(extracted)].slice(0, 5)
  }

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

function extractOpenQuestionCandidates(markdown: string): string[] {
  const candidates: string[] = []
  const lines = markdown.split('\n')
  let inQuestionSection = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (/^#+\s+/.test(line)) {
      inQuestionSection = /open questions?|questions?|risks?|next steps?|follow[- ]ups?/i.test(line)
      continue
    }

    const uncheckedTask = line.match(/^[-*]\s+\[\s\]\s+(.+)$/)
    if (uncheckedTask) {
      const normalized = normalizeCandidate(uncheckedTask[1])
      if (normalized) candidates.push(normalized)
      continue
    }

    const todoLine = line.match(/^(todo|fixme|next|open question)\s*:\s*(.+)$/i)
    if (todoLine) {
      const normalized = normalizeCandidate(todoLine[2])
      if (normalized) candidates.push(normalized)
      continue
    }

    const numberedItem = line.match(/^\d+\.\s+(.+)$/)
    if (inQuestionSection && numberedItem) {
      const normalized = normalizeCandidate(numberedItem[1])
      if (normalized) candidates.push(normalized)
      continue
    }

    const bulletItem = line.match(/^[-*]\s+(.+)$/)
    if (bulletItem && (inQuestionSection || bulletItem[1].includes('?'))) {
      const normalized = normalizeCandidate(bulletItem[1])
      if (normalized) candidates.push(normalized)
      continue
    }

    if (line.endsWith('?')) {
      const normalized = normalizeCandidate(line)
      if (normalized) candidates.push(normalized)
    }
  }

  return candidates
}

function normalizeCandidate(value: string): string | null {
  const normalized = value
    .replace(/`+/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length < 12) return null
  return normalized.replace(/[.:;]+$/, '')
}
