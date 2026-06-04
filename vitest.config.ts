import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'provisioners/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      // Resolve `electron` to a stub so unit tests don't depend on the
      // downloaded Electron binary (its CI install step is flaky). Suites that
      // exercise Electron APIs override this with `vi.mock('electron', ...)`.
      electron: resolve(__dirname, 'test/electron-stub.cjs'),
    },
  },
})
