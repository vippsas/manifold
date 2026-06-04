// src/plugin-host/require-interceptor.ts

/** Patch Node's module loader so `require('manifold')` returns our API. */
export function installManifoldRequire(getApi: () => unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const Module = require('module') as any
  const originalLoad = Module._load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module._load = function (request: string, ...rest: any[]): unknown {
    if (request === 'manifold') return getApi()
    return originalLoad.call(this, request, ...rest)
  }
}
