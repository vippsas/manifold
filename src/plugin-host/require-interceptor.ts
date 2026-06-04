// src/plugin-host/require-interceptor.ts
import type { ManifoldApi } from '../shared/plugins/api-types'

/** Patch Node's module loader so `require('manifold')` returns our API. */
export function installManifoldRequire(api: ManifoldApi): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const Module = require('module') as any
  const originalLoad = Module._load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module._load = function (request: string, ...rest: any[]): unknown {
    if (request === 'manifold') return api
    return originalLoad.call(this, request, ...rest)
  }
}
