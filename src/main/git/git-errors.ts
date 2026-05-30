function collectErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error ?? '')
  }

  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : ''
  const stderr = 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : ''
  return `${message}\n${stderr}`.toLowerCase()
}

export function isGitRepositoryError(error: unknown): boolean {
  const text = collectErrorText(error)
  return text.includes('not a git repository')
    || text.includes('this operation must be run in a work tree')
}

export function isMissingGitError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException | undefined
  return err?.code === 'ENOENT' && (
    err.syscall === 'spawn git' ||
    typeof err.message === 'string' && err.message.includes('spawn git ENOENT')
  )
}
