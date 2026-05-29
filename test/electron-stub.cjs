// Stub for the `electron` package in the Vitest (Node) test environment.
//
// The real package's main export is the filesystem path to the downloaded
// Electron binary, and `require('electron')` throws "Electron failed to
// install correctly" when that binary is missing (a flaky CI install step).
//
// Unit tests never need the binary: suites that actually exercise Electron
// APIs replace the module with `vi.mock('electron', ...)`, which overrides
// this alias. This empty module simply lets suites that *transitively* import
// Electron (without using it) load without depending on the binary download.
// It mirrors the real package's Node behaviour, where every named import
// resolves to `undefined`.
module.exports = {}
