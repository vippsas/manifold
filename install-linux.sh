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

echo "Linking $INSTALL_DIR/$BINARY_NAME..."
ln -sf "$APP_DIR/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"

echo "Done. Run: $BINARY_NAME"
echo "Ensure $INSTALL_DIR is in your PATH."
