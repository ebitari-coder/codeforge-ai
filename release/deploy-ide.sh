#!/usr/bin/env bash
set -e

# CodeForge AI IDE Deployment Script (Linux/macOS)
# Run this script to prepare the VSCodium fork for the CodeForge AI IDE build.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(dirname "$SCRIPT_DIR")"

# Configurable paths (override via environment variables)
IDE_PATH="${CODEFORGE_IDE_PATH:-$(dirname "$EXT_DIR")/codeforge-ai-ide}"

echo "🚀 Starting CodeForge AI IDE Preparation..."
echo "   Extension: $EXT_DIR"
echo "   IDE:       $IDE_PATH"

# Validate paths
if [[ ! -d "$IDE_PATH" ]]; then
  echo "❌ IDE directory not found: $IDE_PATH"
  echo "   Set CODEFORGE_IDE_PATH environment variable to the correct path."
  exit 1
fi

if [[ ! -f "$EXT_DIR/codeforge-ai-1.0.0.vsix" ]]; then
  echo "⚠️  VSIX not found. Building extension..."
  cd "$EXT_DIR"
  npm install && npm run package
  cd - > /dev/null
fi

# 1. Copy VSIX to extensions directory
echo "📦 Copying CodeForge AI extension..."
mkdir -p "$IDE_PATH/extensions"
cp "$EXT_DIR/codeforge-ai-1.0.0.vsix" "$IDE_PATH/extensions/codeforge-ai.vsix"

# 2. Copy branding overrides
echo "🎨 Applying branding overrides..."
cp "$EXT_DIR/release/product-overrides.json" "$IDE_PATH/product-overrides.json"

# 3. Update product.json with CodeForge branding
echo "📝 Updating product.json..."
if command -v jq &> /dev/null; then
  # Merge overrides into product.json
  jq -s '.[0] * .[1]' "$IDE_PATH/product.json" "$IDE_PATH/product-overrides.json" > "$IDE_PATH/product.json.tmp"
  mv "$IDE_PATH/product.json.tmp" "$IDE_PATH/product.json"

  # Apply additional branding fields
  jq '
    .nameShort = "CodeForge AI" |
    .nameLong = "CodeForge AI - Purpose-Built IDE with Advanced AI Agents" |
    .applicationName = "codeforge-ai" |
    .linuxIconName = "codeforge-ai" |
    .quality = "stable" |
    .extensionPreload = ["codeforge-ai"]
  ' "$IDE_PATH/product.json" > "$IDE_PATH/product.json.tmp"
  mv "$IDE_PATH/product.json.tmp" "$IDE_PATH/product.json"
else
  echo "⚠️  jq not found. Please install jq or manually update product.json."
  echo "   Required fields: nameShort, nameLong, applicationName, linuxIconName"
fi

# 4. Apply icons
echo "✨ Applying CodeForge AI icons..."
if [[ -f "$EXT_DIR/icon.svg" ]]; then
  # Linux icons
  if [[ -d "$IDE_PATH/src/stable/resources/linux" ]]; then
    cp "$EXT_DIR/icon.svg" "$IDE_PATH/src/stable/resources/linux/code.svg"
    echo "   ✓ Linux SVG icon applied"
  fi

  # Workbench icon
  WORKBENCH_MEDIA="$IDE_PATH/src/stable/src/vs/workbench/browser/media"
  if [[ -d "$WORKBENCH_MEDIA" ]]; then
    cp "$EXT_DIR/icon.svg" "$WORKBENCH_MEDIA/code-icon.svg"
    echo "   ✓ Workbench SVG icon applied"
  fi

  echo "⚠️  Note: .ico and .icns files need manual conversion from SVG for full Windows/macOS branding."
else
  echo "❌ icon.svg not found in $EXT_DIR"
fi

# 5. Verify installation
echo ""
echo "✅ IDE Preparation Complete!"
echo ""
echo "Next steps:"
echo "  1. cd $IDE_PATH"
echo "  2. git submodule update --init --recursive"
echo "  3. export APP_NAME='CodeForge AI'"
echo "  4. export BINARY_NAME='codeforge-ai'"
echo "  5. export APP_NAME_LC='codeforge-ai'"
echo "  6. export RELEASE_VERSION='1.0.0'"
echo "  7. ./prepare_vscode.sh"
echo "  8. cd vscode && npm run gulp vscode-linux-x64-min-pack"
