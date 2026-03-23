import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-updater'] })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/app/index.ts'),
          'oss-provisioner': resolve(__dirname, 'src/main/provisioning/oss-provisioner-cli.ts'),
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          simple: resolve(__dirname, 'src/preload/simple.ts'),
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    cacheDir: resolve(__dirname, 'node_modules/.vite/renderer'),
    optimizeDeps: {
      entries: [
        resolve(__dirname, 'src/renderer/index.html'),
        resolve(__dirname, 'src/renderer-simple/index.html'),
      ],
      include: [
        'react',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
    build: {
      outDir: 'out',
      emptyOutDir: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          simple: resolve(__dirname, 'src/renderer-simple/index.html'),
        }
      }
    }
  }
})
