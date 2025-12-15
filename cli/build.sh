#!/usr/bin/env bash
set -euo pipefail

#############################################
# Config
#############################################

APP_NAME="lab"
ENTRY_FILE="src/cli.tsx"
DIST_DIR="dist"
BUNDLE_OUT="$DIST_DIR/cli.js"

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
# Info
#############################################

echo ""
echo "▶ Building ${APP_NAME}"
echo "  Platform: ${PLATFORM}"
echo "  Arch:     ${ARCH}"
echo "  Target:   ${PKG_TARGET}"
echo ""

#############################################
# Sanity checks
#############################################

if [ ! -f "$ENTRY_FILE" ]; then
  echo "❌ Entry file not found: $ENTRY_FILE"
  exit 1
fi

#############################################
# Install dependencies
#############################################

if [ -f "bun.lockb" ]; then
  echo "▶ Installing dependencies (bun)"
  command -v bun >/dev/null 2>&1 || {
    echo "❌ bun.lockb present but bun is not installed"
    exit 1
  }
  bun install
else
  echo "▶ Installing dependencies (npm)"
  command -v npm >/dev/null 2>&1 || {
    echo "❌ npm not found"
    exit 1
  }
  npm install
fi

#############################################
# Bundle (Node 18 safe)
#############################################

echo ""
echo "▶ Bundling CLI (Node 18 target)"

mkdir -p "$DIST_DIR"

npx esbuild "$ENTRY_FILE" \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile="$BUNDLE_OUT"

#############################################
# Ensure pkg
#############################################

echo ""
echo "▶ Ensuring pkg is available"

if ! command -v pkg >/dev/null 2>&1; then
  npm install --save-dev pkg
  PKG_CMD="npx pkg"
else
  PKG_CMD="pkg"
fi

#############################################
# Build executable
#############################################

echo ""
echo "▶ Building executable"

$PKG_CMD "$BUNDLE_OUT" \
  --targets "$PKG_TARGET" \
  --output "$OUTPUT"

#############################################
# Done
#############################################

echo ""
echo "✅ Build complete"
echo "Binary: ./$OUTPUT"
echo ""
echo "⚠️  Runtime constraints:"
echo "   - Node 18 embedded (pkg)"
echo "   - Do NOT use global fetch"
echo "   - Do NOT use node:sqlite"
