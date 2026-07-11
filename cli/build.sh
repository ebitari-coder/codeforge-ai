#!/usr/bin/env bash
set -e

# CodeForge AI CLI Build Script
# Creates release packages for Linux, macOS, and Windows

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$SCRIPT_DIR"
RELEASE_DIR="$CLI_DIR/../release/cli"

VERSION="${VERSION:-1.0.0}"

echo "Building CodeForge AI CLI v${VERSION}..."

# Clean
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Build for each platform
PLATFORMS=(
    "linux-x64"
    "linux-arm64"
    "darwin-x64"
    "darwin-arm64"
    "windows-x64"
    "windows-arm64"
)

for platform in "${PLATFORMS[@]}"; do
    echo ""
    echo "Building for $platform..."

    BUILD_DIR="$RELEASE_DIR/codeforge-${VERSION}-${platform}"
    mkdir -p "$BUILD_DIR"

    # Copy files
    cp "$CLI_DIR/index.js" "$BUILD_DIR/"
    cp "$CLI_DIR/package.json" "$BUILD_DIR/"
    cp "$CLI_DIR/README.md" "$BUILD_DIR/"
    cp "$CLI_DIR/install/install.sh" "$BUILD_DIR/"
    cp "$CLI_DIR/install/install.ps1" "$BUILD_DIR/"

    # Install production dependencies only
    cd "$BUILD_DIR"
    npm install --production --quiet 2>/dev/null || true
    cd "$CLI_DIR"

    # Create platform-specific wrapper
    case "$platform" in
        windows-*)
            cat > "$BUILD_DIR/codeforge.cmd" << 'EOF'
@echo off
node "%~dp0\index.js" %*
EOF
            cat > "$BUILD_DIR/codeforge.ps1" << 'EOF'
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
& node "$ScriptPath\index.js" @args
EOF
            ;;
        *)
            cat > "$BUILD_DIR/codeforge" << 'EOF'
#!/usr/bin/env bash
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
exec node "$DIR/index.js" "$@"
EOF
            chmod +x "$BUILD_DIR/codeforge"
            ;;
    esac

    # Create archive
    cd "$RELEASE_DIR"
    if [[ "$platform" == windows-* ]]; then
        zip -r "codeforge-${VERSION}-${platform}.zip" "codeforge-${VERSION}-${platform}/"
    else
        tar -czf "codeforge-${VERSION}-${platform}.tar.gz" "codeforge-${VERSION}-${platform}/"
    fi

    rm -rf "$BUILD_DIR"
    echo "✓ Built codeforge-${VERSION}-${platform}"
done

# Generate checksums
cd "$RELEASE_DIR"
echo ""
echo "Generating checksums..."
sha256sum codeforge-${VERSION}-* > checksums-${VERSION}.txt 2>/dev/null || shasum -a 256 codeforge-${VERSION}-* > checksums-${VERSION}.txt

echo ""
echo "✓ All packages built in $RELEASE_DIR"
echo ""
ls -la codeforge-${VERSION}-*
