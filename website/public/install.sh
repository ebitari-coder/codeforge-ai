#!/usr/bin/env bash
set -e

# CodeForge AI Installer
# Usage: curl -fsSL https://codeforge.ai/install.sh | bash

REPO="${CODEFORGE_REPO:-ebitari-coder/codeforge-ai}"
VERSION="${CODEFORGE_VERSION:-1.0.0}"
INSTALL_DIR="${CODEFORGE_INSTALL_DIR:-$HOME/.codeforge}"
BIN_DIR="${CODEFORGE_BIN_DIR:-$HOME/.local/bin}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ ${NC}$1"; }
success() { echo -e "${GREEN}✓ ${NC}$1"; }
warn() { echo -e "${YELLOW}⚠ ${NC}$1"; }
error() { echo -e "${RED}✗ ${NC}$1"; exit 1; }

detect_platform() {
    local os arch
    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        *)          error "Unsupported OS: $(uname -s)"
    esac
    case "$(uname -m)" in
        x86_64|amd64)   arch="x64" ;;
        aarch64|arm64)  arch="arm64" ;;
        *)              error "Unsupported architecture: $(uname -m)"
    esac
    echo "${os}-${arch}"
}

download() {
    local url="$1" dest="$2"
    if command -v curl &> /dev/null; then
        curl -fsSL "$url" -o "$dest"
    elif command -v wget &> /dev/null; then
        wget -q "$url" -O "$dest"
    else
        error "Neither curl nor wget found."
    fi
}

try_latest_version() {
    local api_url="https://api.github.com/repos/${REPO}/releases/latest"
    local tmpfile=$(mktemp)
    if download "$api_url" "$tmpfile" 2>/dev/null; then
        local tag=$(grep '"tag_name"' "$tmpfile" | cut -d'"' -f4 | sed 's/^cli-v//')
        rm -f "$tmpfile"
        if [ -n "$tag" ]; then
            echo "$tag"
            return 0
        fi
    fi
    rm -f "$tmpfile"
    return 1
}

main() {
    echo ""
    echo -e "${BLUE}  ____   ___  _____ _____ ____     ____   ___  _______  __  ${NC}"
    echo -e "${BLUE} / ___| / _ \\|  ___| ____|  _ \\   / ___| / _ \\| ____\\ \\/ / ${NC}"
    echo -e "${BLUE}| |  _ / /_\\ \\ |_  |  _| | |_) | | |  _ / /_\\ |  _|  \\  /  ${NC}"
    echo -e "${BLUE}| |_| | |   |  _| | |___|  _ <  | |_| || |   | |___ /  \\   ${NC}"
    echo -e "${BLUE} \\____|_|   |_|   |_____|_| \\_\\  \\____/|_|   |_____/_/\\_\\  ${NC}"
    echo -e "  AI-Powered Coding Assistant Installer"
    echo ""

    local platform
    platform=$(detect_platform)
    info "Detected platform: $platform"

    # Try to get latest version, fallback to default
    local version="$VERSION"
    if [ "$VERSION" = "latest" ] || [ -z "$VERSION" ]; then
        local latest=$(try_latest_version)
        if [ -n "$latest" ]; then
            version="$latest"
            info "Latest version: $version"
        else
            version="1.0.0"
            warn "Could not fetch latest version, using $version"
        fi
    fi

    mkdir -p "$INSTALL_DIR" "$BIN_DIR"

    local filename="codeforge-${version}-${platform}"
    local url="https://github.com/${REPO}/releases/download/cli-v${version}/${filename}.tar.gz"
    info "Downloading: $url"

    if ! download "$url" "/tmp/codeforge.tar.gz" 2>/dev/null; then
        # Try with v prefix
        url="https://github.com/${REPO}/releases/download/v${version}/${filename}.tar.gz"
        info "Trying: $url"
        if ! download "$url" "/tmp/codeforge.tar.gz" 2>/dev/null; then
            error "Failed to download. Check if release exists at:\n  https://github.com/${REPO}/releases"
        fi
    fi
    success "Downloaded"

    tar -xzf /tmp/codeforge.tar.gz -C "$INSTALL_DIR" --strip-components=1
    rm /tmp/codeforge.tar.gz
    success "Extracted to $INSTALL_DIR"

    # Create wrapper script
    if [ -f "$INSTALL_DIR/index.js" ]; then
        cat > "$BIN_DIR/codeforge" << WEOF
#!/usr/bin/env bash
exec node "$INSTALL_DIR/index.js" "\$@"
WEOF
        chmod +x "$BIN_DIR/codeforge"
    elif [ -f "$INSTALL_DIR/codeforge" ]; then
        cp "$INSTALL_DIR/codeforge" "$BIN_DIR/codeforge"
        chmod +x "$BIN_DIR/codeforge"
    fi
    success "Installed to $BIN_DIR/codeforge"

    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        warn "$BIN_DIR is not in your PATH"
        echo ""
        echo "Add to your ~/.bashrc or ~/.zshrc:"
        echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo ""
    fi

    success "Installation complete!"
    echo "Run 'codeforge --help' to get started"
    echo ""
}

main "$@"
