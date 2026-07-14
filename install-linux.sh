#!/bin/bash
set -e

BINARY_NAME="manifold"
INSTALL_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/manifold"
UNPACKED_GLOB="dist/linux-unpacked"

echo "Building Manifold (Linux)..."
npm run dist:linux

if [ ! -d "$UNPACKED_GLOB" ]; then
  echo "Error: Build failed — $UNPACKED_GLOB not found."
  exit 1
fi

mkdir -p "$INSTALL_DIR"
mkdir -p "$(dirname "$APP_DIR")"

echo "Installing to $APP_DIR..."
rm -rf "$APP_DIR"
cp -r "$UNPACKED_GLOB" "$APP_DIR"

# Wrapper script so flags are applied before Chromium initialises.
#
# --ozone-platform=x11      Force XWayland instead of native Wayland.
#                            Wayland rendering is unstable on some WSL2 setups;
#                            XWayland is more battle-tested for Electron on WSL2.
# --disable-dev-shm-usage   WSL2 /dev/shm defaults to 64 MB. Chromium exhausts
#                            it compositing modals and segfaults. This routes
#                            shared memory writes to /tmp instead.
echo "Writing launcher wrapper $INSTALL_DIR/$BINARY_NAME..."
cat > "$INSTALL_DIR/$BINARY_NAME" <<'WRAPPER'
#!/bin/bash
exec "$HOME/.local/share/manifold/manifold" \
  --ozone-platform=x11 \
  --disable-dev-shm-usage \
  "$@"
WRAPPER
chmod +x "$INSTALL_DIR/$BINARY_NAME"

echo "Done. Run: $BINARY_NAME"
echo "Ensure $INSTALL_DIR is in your PATH."
