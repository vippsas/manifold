const MAX_REPO_NAME_LENGTH = 60

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
  return slugifyRepoName(description) || 'new-project'
}
