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
          'plugin-host': resolve(__dirname, 'src/plugin-host/index.ts'),
        },
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
        }
      }
    }
  }
})
