#!/bin/bash
set -e

BINARY_NAME="manifold"
INSTALL_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/manifold"
UNPACKED_GLOB="dist/linux-unpacked"
STAGING_DIR="$APP_DIR.staging.$$"
BACKUP_DIR="$APP_DIR.backup.$$"
WRAPPER_PATH="$INSTALL_DIR/$BINARY_NAME"
WRAPPER_STAGING="$WRAPPER_PATH.staging.$$"
WRAPPER_BACKUP="$WRAPPER_PATH.backup.$$"
APP_REPLACED=0
WRAPPER_REPLACED=0

# Best-effort rollback: every step is guarded so a failed restore can't abort
# the trap early and mask the original exit status.
cleanup() {
  status=$?
  rm -rf "$STAGING_DIR" 2>/dev/null || true
  rm -f "$WRAPPER_STAGING" 2>/dev/null || true
  if [ -f "$WRAPPER_BACKUP" ]; then
    rm -f "$WRAPPER_PATH" 2>/dev/null || true
    mv "$WRAPPER_BACKUP" "$WRAPPER_PATH" || echo "Warning: could not restore previous launcher $WRAPPER_PATH" >&2
  elif [ "$WRAPPER_REPLACED" -eq 1 ]; then
    rm -f "$WRAPPER_PATH" 2>/dev/null || true
  fi
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$APP_DIR" 2>/dev/null || true
    mv "$BACKUP_DIR" "$APP_DIR" || echo "Warning: could not restore previous install $APP_DIR" >&2
  elif [ "$APP_REPLACED" -eq 1 ]; then
    rm -rf "$APP_DIR" 2>/dev/null || true
  fi
  exit "$status"
}

echo "Building Manifold (Linux)..."
npm run dist:linux
npm run verify:linux-package

if [ ! -d "$UNPACKED_GLOB" ]; then
  echo "Error: Build failed — $UNPACKED_GLOB not found."
  exit 1
fi

mkdir -p "$INSTALL_DIR"
mkdir -p "$(dirname "$APP_DIR")"

echo "Installing to $APP_DIR..."
rm -rf "$STAGING_DIR"
rm -rf "$BACKUP_DIR"
rm -f "$WRAPPER_STAGING" "$WRAPPER_BACKUP"
trap cleanup EXIT
mkdir -p "$STAGING_DIR"
cp -r "$UNPACKED_GLOB/." "$STAGING_DIR"

if [ ! -x "$STAGING_DIR/$BINARY_NAME" ]; then
  echo "Error: Staged Manifold executable is missing or not executable."
  exit 1
fi

# Wrapper script so flags are applied before Chromium initialises.
#
# --ozone-platform=x11      Force XWayland instead of native Wayland.
#                            Wayland rendering is unstable on some WSL2 setups;
#                            XWayland is more battle-tested for Electron on WSL2.
# --disable-dev-shm-usage   WSL2 /dev/shm defaults to 64 MB. Chromium exhausts
#                            it compositing modals and segfaults. This routes
#                            shared memory writes to /tmp instead.
echo "Writing launcher wrapper $WRAPPER_PATH..."
cat > "$WRAPPER_STAGING" <<'WRAPPER'
#!/bin/bash
exec "$HOME/.local/share/manifold/manifold" \
  --ozone-platform=x11 \
  --disable-dev-shm-usage \
  "$@"
WRAPPER
chmod +x "$WRAPPER_STAGING"

if [ -d "$APP_DIR" ]; then mv "$APP_DIR" "$BACKUP_DIR"; fi
mv "$STAGING_DIR" "$APP_DIR"
APP_REPLACED=1
if [ -f "$WRAPPER_PATH" ]; then mv "$WRAPPER_PATH" "$WRAPPER_BACKUP"; fi
mv "$WRAPPER_STAGING" "$WRAPPER_PATH"
WRAPPER_REPLACED=1

# Success: disarm the rollback trap first, so a hiccup removing the backups can
# never fire cleanup() and undo a completed install. Backup removal is then
# best-effort — a leftover backup dir is harmless.
trap - EXIT
APP_REPLACED=0
WRAPPER_REPLACED=0
rm -rf "$BACKUP_DIR" 2>/dev/null || true
rm -f "$WRAPPER_BACKUP" 2>/dev/null || true

echo "Done. Run: $BINARY_NAME"
echo "Ensure $INSTALL_DIR is in your PATH."
