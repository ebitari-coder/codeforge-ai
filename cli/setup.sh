#!/usr/bin/env bash

# CodeForge AI CLI Setup Script
# Adds the CLI to your PATH

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"

# Create bin directory if it doesn't exist
mkdir -p "$BIN_DIR"

# Create symlink
ln -sf "$SCRIPT_DIR/codeforge" "$BIN_DIR/codeforge"

echo "✓ CodeForge AI CLI installed to $BIN_DIR/codeforge"
echo ""
echo "Add this to your ~/.bashrc or ~/.zshrc:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo ""
echo "Then run:"
echo "  source ~/.bashrc  # or source ~/.zshrc"
echo "  codeforge --help"
