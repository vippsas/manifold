import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readPackageManifest, summarizeRepoStructure } from '../../../background-agent/connectors/local-project/repo-structure-summary'

const tempDirs: string[] = []

describe('summarizeRepoStructure', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not infer electron from a generic src directory alone', () => {
    const projectPath = createTempProject({
      'package.json': JSON.stringify({
        name: 'web-app',
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
          vite: '^6.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
      }),
      'src/index.tsx': 'export {}',
    })

    const manifest = readPackageManifest(projectPath)
    const summary = summarizeRepoStructure(projectPath, manifest)

    expect(summary.probableStack).toContain('react')
    expect(summary.probableStack).toContain('node')
    expect(summary.probableStack).not.toContain('electron')
  })

  it('infers electron only from electron-specific dependencies or structure', () => {
    const projectPath = createTempProject({
      'package.json': JSON.stringify({
        name: 'desktop-app',
        dependencies: {
          electron: '^35.0.0',
          react: '^18.0.0',
        },
        devDependencies: {
          'electron-vite': '^5.0.0',
        },
      }),
      'electron.vite.config.ts': 'export default {}',
      'src/main/index.ts': 'export {}',
      'src/preload/index.ts': 'export {}',
    })

    const manifest = readPackageManifest(projectPath)
    const summary = summarizeRepoStructure(projectPath, manifest)

    expect(summary.probableStack).toContain('electron')
  })
})

function createTempProject(files: Record<string, string>): string {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-repo-structure-'))
  tempDirs.push(projectPath)

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(projectPath, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf-8')
  }

  return projectPath
}
