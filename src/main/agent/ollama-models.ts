import { execFile } from 'node:child_process'

export function listOllamaModels(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('ollama', ['list'], (error, stdout) => {
      if (error) {
        resolve([])
        return
      }

      const lines = stdout.trim().split('\n')
      // First line is the header: NAME ID SIZE MODIFIED
      const models = lines
        .slice(1)
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((name) => name && name.length > 0)

      resolve(models)
    })
  })
}
