#!/bin/bash
set -e

BINARY_NAME="manifold"
INSTALL_DIR="$HOME/.local/bin"
APP_IMAGE_GLOB="dist/Manifold-*.AppImage"

echo "Building Manifold (Linux AppImage)..."
npm run dist:linux

APP_IMAGE=$(ls "$APP_IMAGE_GLOB" 2>/dev/null | head -1)
if [ -z "$APP_IMAGE" ]; then
  echo "Error: Build failed — no AppImage found in dist/"
  exit 1
fi

mkdir -p "$INSTALL_DIR"

echo "Installing to $INSTALL_DIR/$BINARY_NAME..."
cp "$APP_IMAGE" "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"

echo "Done. Run: $BINARY_NAME"
echo "Ensure $INSTALL_DIR is in your PATH."
