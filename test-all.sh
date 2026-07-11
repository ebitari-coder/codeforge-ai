#!/usr/bin/env bash
set -e

echo "=== Testing CodeForge AI ==="

echo ""
echo "1. Extension build..."
cd /home/brave-dimaro/source/repos/codeforge-ai-extension
npm run esbuild 2>&1 && echo "✓ Extension builds" || echo "✗ Extension failed"

echo ""
echo "2. CLI test..."
cd cli
node index.js --version 2>&1 && echo "✓ CLI works" || echo "✗ CLI failed"

echo ""
echo "3. Website build..."
cd ../website
npm run build 2>&1 | tail -5 && echo "✓ Website builds" || echo "✗ Website failed"

echo ""
echo "4. VSIX package..."
cd /home/brave-dimaro/source/repos/codeforge-ai-extension
npm run package 2>&1 | tail -3 && echo "✓ VSIX packaged" || echo "✗ VSIX failed"

echo ""
echo "5. CLI packages..."
cd cli
VERSION=1.0.0 ./build.sh 2>&1 | grep -E "^✓|ERROR" && echo "✓ CLI packages built" || echo "✗ CLI packages failed"

echo ""
echo "6. File checks..."
cd /home/brave-dimaro/source/repos/codeforge-ai-extension
[ -f codeforge-ai-1.0.0.vsix ] && echo "✓ VSIX exists" || echo "✗ VSIX missing"
[ -f cli/index.js ] && echo "✓ CLI entry point exists" || echo "✗ CLI missing"
[ -f website/out/index.html ] && echo "✓ Website output exists" || echo "✗ Website output missing"
[ -f website/public/install.sh ] && echo "✓ Install script exists" || echo "✗ Install script missing"
[ -f release/cli/codeforge-1.0.0-linux-x64.tar.gz ] && echo "✓ Linux x64 package exists" || echo "✗ Linux package missing"
[ -f release/cli/codeforge-1.0.0-darwin-x64.tar.gz ] && echo "✓ macOS x64 package exists" || echo "✗ macOS package missing"
[ -f release/cli/codeforge-1.0.0-windows-x64.zip ] && echo "✓ Windows x64 package exists" || echo "✗ Windows package missing"

echo ""
echo "=== All tests complete ==="
