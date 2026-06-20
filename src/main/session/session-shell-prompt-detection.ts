function stripTerminalControls(text: string): string {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

export function hasShellPromptAtEnd(output: string): boolean {
  const clean = stripTerminalControls(output.slice(-2000)).replace(/\r/g, '\n')
  const lastLine = clean.split('\n').pop() ?? ''
  return /\u276f\s*$/.test(lastLine)
}

export function isAtShellPromptLine(output: string): boolean {
  const clean = stripTerminalControls(output.slice(-2000)).replace(/\r/g, '\n')
  const lastLine = clean.split('\n').pop() ?? ''
  return lastLine.includes('\u276f')
}
