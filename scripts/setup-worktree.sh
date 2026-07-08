#!/usr/bin/env bash
# scripts/setup-worktree.sh — `npm run bootstrap`: make a fresh worktree runnable in one step.
#
# A fresh worktree has no node_modules, and symlinking one from another clone leaves Electron
# half-installed (missing node_modules/electron/path.txt), which surfaces as
# `Error: Electron uninstall` on `npm run dev`. This script runs a real install, asserts the
# Electron binary actually downloaded, rebuilds better-sqlite3 for Electron, and then runs the
# doctor to confirm the result. See CLAUDE.md §7.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -L node_modules ]; then
  echo "✗ node_modules is a symlink. The supported setup is a real install (CLAUDE.md §7)." >&2
  echo "  Remove it first:  rm node_modules" >&2
  exit 1
fi

echo "→ Installing dependencies (npm install)…"
npm install

echo "→ Verifying the Electron binary downloaded…"
PATH_TXT="node_modules/electron/path.txt"
if [ ! -f "$PATH_TXT" ]; then
  echo "✗ $PATH_TXT is missing — the Electron install is incomplete." >&2
  echo "  This is the cause of 'Error: Electron uninstall'. Delete node_modules and re-run." >&2
  exit 1
fi
BINARY="node_modules/electron/dist/$(cat "$PATH_TXT")"
if [ ! -e "$BINARY" ]; then
  echo "✗ Electron binary not found at $BINARY — the download did not complete." >&2
  exit 1
fi
echo "  ✓ Electron binary present."

echo "→ Rebuilding better-sqlite3 for Electron's ABI…"
npm run rebuild:electron

# Enable git rerere so recurring merge/rebase conflict resolutions are reused (harmless if git
# is unavailable). Scoped to this repo's local config only.
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git config rerere.enabled true
  echo "  ✓ Enabled git rerere for this repo."
fi

echo "→ Checking environment health…"
npm run doctor

echo
echo "✓ Worktree ready. Use 'npm run dev' to run the app and 'npm test' to run the suite."
