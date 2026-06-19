/** Whether a URL is safe to hand to the OS browser. http(s) only, so a plugin
 *  can't reach the shell, local files, or custom handlers (file:, javascript:,
 *  vscode:, …) through the `window.openExternal` channel. */
export function isExternallyOpenable(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
