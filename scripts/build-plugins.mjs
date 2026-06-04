// scripts/build-plugins.mjs — compiles each built-in plugin's src/ → its manifest `main` path.
// `manifold` and `vscode` are marked EXTERNAL: they are injected at runtime by the
// plugin host's require interceptor, never bundled.
import { build } from 'esbuild'
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PLUGINS_DIR = resolve(HERE, '..', 'resources', 'plugins')

/** Build every plugin under `pluginsDir` that has a `src/` directory.
 *  Returns the list of plugin folder names that were built. */
export async function buildPlugins(pluginsDir = DEFAULT_PLUGINS_DIR) {
  if (!existsSync(pluginsDir)) return []
  const built = []
  for (const entry of readdirSync(pluginsDir)) {
    const root = join(pluginsDir, entry)
    if (!statSync(root).isDirectory()) continue
    const srcDir = join(root, 'src')
    const manifestPath = join(root, 'package.json')
    if (!existsSync(srcDir) || !existsSync(manifestPath)) continue

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const main = typeof manifest.main === 'string' ? manifest.main : './out/extension.js'
    const outfile = resolve(root, main)
    const entryTs = join(srcDir, basename(main).replace(/\.js$/, '.ts'))
    if (!existsSync(entryTs)) {
      throw new Error(`[build-plugins] ${entry}: expected source entry ${entryTs} (derived from manifest main "${main}")`)
    }

    await build({
      entryPoints: [entryTs],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      external: ['manifold', 'vscode'],
      logLevel: 'warning',
    })
    built.push(entry)
  }
  return built
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildPlugins()
    .then((b) => { console.log(`[build-plugins] built ${b.length} plugin(s): ${b.join(', ') || '(none)'}`) })
    .catch((err) => { console.error('[build-plugins] failed:', err); process.exit(1) })
}
