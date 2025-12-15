#!/usr/bin/env bash
set -euo pipefail

#############################################
# Config
#############################################

ENTRY_FILE="src/cli.tsx"
DIST_DIR="dist"
BUNDLE_OUT="$DIST_DIR/cli.js"
APP_NAME="lab"

#############################################
# Detect platform
#############################################

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    PLATFORM="macos"
    ;;
  Linux)
    PLATFORM="linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="win"
    ;;
  *)
    echo "❌ Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  arm64|aarch64)
    ARCH="arm64"
    ;;
  x86_64|amd64)
    ARCH="x64"
    ;;
  *)
    echo "❌ Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

PKG_TARGET="node18-${PLATFORM}-${ARCH}"

if [ "$PLATFORM" = "win" ]; then
  OUTPUT="${APP_NAME}.exe"
else
  OUTPUT="${APP_NAME}"
fi

#############################################
# Helpers
#############################################

echo_step () {
  echo ""
  echo "▶ $1"
}

require_command () {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "❌ Required command not found: $1"
    exit 1
  fi
}

#############################################
# Sanity checks
#############################################

echo_step "Detected platform"
echo "OS:      $PLATFORM"
echo "ARCH:    $ARCH"
echo "Target:  $PKG_TARGET"

if [ ! -f "$ENTRY_FILE" ]; then
  echo "❌ Entry file not found: $ENTRY_FILE"
  exit 1
fi

#############################################
# Install dependencies
#############################################

if [ -f "bun.lockb" ]; then
  echo_step "Installing dependencies with Bun"
  require_command bun
  bun install
else
  echo_step "Installing dependencies with npm"
  require_command npm
  npm install
fi

#############################################
# Bundle CLI
#############################################

echo_step "Bundling CLI"

mkdir -p "$DIST_DIR"

if command -v bun >/dev/null 2>&1; then
  echo "Using Bun bundler"
  bun build "$ENTRY_FILE" \
    --bundle \
    --target=node \
    --outfile="$BUNDLE_OUT"
else
  echo "Using esbuild"
  npx esbuild "$ENTRY_FILE" \
    --bundle \
    --platform=node \
    --target=node18 \
    --outfile="$BUNDLE_OUT"
fi

#############################################
# Ensure pkg
#############################################

echo_step "Ensuring pkg is available"

if ! command -v pkg >/dev/null 2>&1; then
  npm install --save-dev pkg
  PKG_CMD="npx pkg"
else
  PKG_CMD="pkg"
fi

#############################################
# Build executable
#############################################

echo_step "Building executable"

$PKG_CMD "$BUNDLE_OUT" \
  --targets "$PKG_TARGET" \
  --output "$OUTPUT"

#############################################
# Done
#############################################

echo ""
echo "✅ Build complete"
echo "Binary: ./$OUTPUT"
