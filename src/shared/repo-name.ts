const MAX_REPO_NAME_LENGTH = 60
// The boundary after the repo name treats `.` as a delimiter only when it is not
// followed by another name char, so name-internal dots (e.g. `next.js`) are kept
// while a trailing sentence period (`next.js. `) is excluded. A literal `.git`
// suffix is still stripped explicitly.
const REPO_BOUNDARY = String.raw`(?:[\s#?)/,;:]|\.(?![a-z0-9_-])|$)`
const GITHUB_REPO_PATTERN = new RegExp(
  String.raw`((?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z0-9_.-]+)\/([a-z0-9_-][a-z0-9_.-]*?))(?:\.git)?(?=${REPO_BOUNDARY})`,
  'i',
)

// GitHub CLI shorthand, e.g. `gh repo clone owner/repo`, which has no host.
const GH_CLI_CLONE_PATTERN = new RegExp(
  String.raw`\bgh\s+repo\s+clone\s+([a-z0-9_.-]+)\/([a-z0-9_-][a-z0-9_.-]*?)(?:\.git)?(?=${REPO_BOUNDARY})`,
  'i',
)

export function extractGitHubRepoUrlFromText(value: string): string | null {
  const match = value.match(GITHUB_REPO_PATTERN)
  if (!match) return null
  return `${match[1]}.git`
}

function repoNameFromText(value: string): string {
  const match = value.match(GITHUB_REPO_PATTERN)
  if (match) return match[3]

  const cli = value.match(GH_CLI_CLONE_PATTERN)
  if (cli) return cli[2]

  return ''
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
