const MAX_REPO_NAME_LENGTH = 60
const GITHUB_REPO_PATTERN =
  /((?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z0-9_.-]+)\/([a-z0-9_.-]+?))(?:\.git)?(?=[\s#?)/.,;:]|$)/i

export function extractGitHubRepoUrlFromText(value: string): string | null {
  const match = value.match(GITHUB_REPO_PATTERN)
  if (!match) return null
  return `${match[1]}.git`
}

function repoNameFromText(value: string): string {
  const match = value.match(GITHUB_REPO_PATTERN)
  return match?.[3] ?? ''
}

export function slugifyRepoName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_REPO_NAME_LENGTH)
    .replace(/-+$/g, '')
}

export function suggestRepoName(description: string): string {
  return slugifyRepoName(repoNameFromText(description) || description) || 'new-project'
}
