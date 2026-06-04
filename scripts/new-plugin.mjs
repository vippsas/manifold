// scripts/new-plugin.mjs — scaffold a new built-in Manifold plugin.
// Usage: npm run plugin:new -- <name> [--publisher manifold]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGINS = resolve(HERE, '..', 'resources', 'plugins')

const argv = process.argv.slice(2)
const name = argv.find((a) => !a.startsWith('--'))
const pubIdx = argv.indexOf('--publisher')
const publisher =
  pubIdx !== -1 && argv[pubIdx + 1] && !argv[pubIdx + 1].startsWith('--')
    ? argv[pubIdx + 1]
    : 'manifold'
const ID_SEG = /^[a-z0-9][a-z0-9-]*$/
if (!name || !ID_SEG.test(name) || !ID_SEG.test(publisher)) {
  console.error(
    'Usage: npm run plugin:new -- <name> [--publisher <publisher>]\n  name/publisher must be lowercase alphanumeric with hyphens.',
  )
  process.exit(1)
}

const dir = join(PLUGINS, `${publisher}.${name}`)
if (existsSync(dir)) {
  console.error(`already exists: ${dir}`)
  process.exit(1)
}
mkdirSync(join(dir, 'src'), { recursive: true })

const manifest = {
  name,
  publisher,
  version: '0.0.1',
  displayName: name,
  engines: { manifold: '^0.3.0' },
  main: './out/plugin.js',
  activationEvents: [`onCommand:${publisher}.${name}.hello`],
  capabilities: ['storage'],
  contributes: {
    commands: [{ command: `${publisher}.${name}.hello`, title: `${name}: Hello` }],
  },
}
writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')

const pluginTs = [
  "import type { ManifoldContext } from 'manifold'",
  '// eslint-disable-next-line @typescript-eslint/no-var-requires',
  "const manifold = require('manifold') as typeof import('manifold')",
  '',
  'export function activate(context: ManifoldContext): void {',
  `  const cmd = manifold.commands.registerCommand('${publisher}.${name}.hello', () => {`,
  `    return 'hello from ${name}'`,
  '  })',
  '  context.subscriptions.push(cmd)',
  '}',
  '',
  'export function deactivate(): void {}',
  '',
].join('\n')

writeFileSync(join(dir, 'src', 'plugin.ts'), pluginTs)
console.log(
  `Created ${dir}\nNext: edit src/plugin.ts, then \`npm run build:plugins\` (or just \`npm run dev\`).`,
)

if (import.meta.url !== pathToFileURL(process.argv[1]).href) {
  /* importable without side effects if ever needed */
}
