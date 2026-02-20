#!/bin/bash
set -e

APP_NAME="Manifold.app"
SOURCE="dist/mac-arm64/$APP_NAME"
DEST="/Applications/$APP_NAME"

echo "Building Manifold..."
npm run dist

if [ ! -d "$SOURCE" ]; then
  echo "Error: Build failed — $SOURCE not found."
  exit 1
fi

if [ -d "$DEST" ]; then
  echo "Removing existing $DEST..."
  rm -rf "$DEST"
fi

echo "Copying $APP_NAME to /Applications..."
cp -R "$SOURCE" "$DEST"
echo "Done. Manifold is installed at $DEST"
