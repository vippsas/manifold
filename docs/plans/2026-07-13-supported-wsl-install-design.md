# Supported WSL Install Design

## Scope

Manifold will support source builds and local installation on x64 WSL2 with WSLg. Native Windows, ARM64, general Linux distribution packages, downloadable Linux release artifacts, and Linux automatic updates remain out of scope.

## Runtime

The existing Linux shell, PTY, PATH, and WSLg launch paths remain unchanged. The file-tree "Open in Terminal" action will move behind a tested platform helper: macOS retains `open -a Terminal`, while Linux invokes the system `x-terminal-emulator` with the selected directory as its working directory. Unsupported platforms and failed launches return a controlled error instead of silently spawning a macOS command.

## Packaging And Installation

The Linux electron-builder target remains `dir`. WSL commonly cannot mount AppImages through FUSE, and the existing unpacked directory already contains the required Electron and native-module files.

`install-linux.sh` will build into `dist/linux-unpacked`, validate that output, stage it under the user's local data directory, and only then replace the current installation. A package-verification script will assert that the executable and required native modules are present. The launcher will retain the XWayland and shared-memory flags required by the current WSLg path.

## Updates

The updater will not initialize on Linux. The supported Linux installation is an unpacked directory with no published Linux update artifact, so attempting AppImage updates is misleading and emits runtime warnings. macOS updater behavior remains unchanged.

## CI

An Ubuntu CI job will install from the committed lockfile, type-check, test, package with `--publish never`, and run package verification. It will not access release secrets, publish GitHub releases, or change the macOS release workflow.

## Documentation

README, CONTRIBUTING, and covering architecture pages will describe the actual support boundary, required native build tools, x64 limitation, WSLg requirement, unpacked-directory installation, and canonical repository URL. Frozen planning/spec documents will not be refreshed.

## Verification

Behavior changes use test-first unit tests. Final verification consists of the full test suite, type-check, Linux package build, package verification, wiki lint, and a WSLg launch smoke test.
