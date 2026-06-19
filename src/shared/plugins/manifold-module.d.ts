// Ambient typing for the runtime-injected `manifold` module (see plugin-host require interceptor).
//
// Design: we use `export =` (CommonJS default export) so that
//   const manifold = require('manifold')          → typed as ManifoldApi
// works correctly.  Named type imports also work because we re-export the
// types inside the same declaration:
//   import type { ManifoldContext } from 'manifold'
// TypeScript resolves those against the exported names below even with `export =`.
declare module 'manifold' {
  import type { ManifoldApi, ManifoldContext, Disposable, ProjectInfo, SessionInfo, WebviewView, WebviewViewProvider, TreeItem, TreeDataProvider, TreeView, AgentSession, LanguageModelChat, WorkspaceFolder, CancellationToken, TurnOutcome, WorktreeOverviewEntry, WorktreeStatus, BranchOverviewEntry, TaskPrompt, VerdictMetrics, VerdictOutcome, VerdictRecord } from './api-types'

  // Re-export named types so `import type { ManifoldContext } from 'manifold'` resolves.
  export type { ManifoldApi, ManifoldContext, Disposable, ProjectInfo, SessionInfo, WebviewView, WebviewViewProvider, TreeItem, TreeDataProvider, TreeView, AgentSession, LanguageModelChat, WorkspaceFolder, CancellationToken, TurnOutcome, WorktreeOverviewEntry, WorktreeStatus, BranchOverviewEntry, TaskPrompt, VerdictMetrics, VerdictOutcome, VerdictRecord }

  // CommonJS default: `const manifold = require('manifold')` → ManifoldApi
  const api: ManifoldApi
  export = api
}
