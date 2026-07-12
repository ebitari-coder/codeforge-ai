# CodeForge AI CLI Installer for Windows
# Usage: irm https://codeforge.ai/install.ps1 | iex

param(
    [string]$Version = "latest",
    [string]$InstallDir = "$env:USERPROFILE\.codeforge",
    [string]$BinDir = "$env:USERPROFILE\.local\bin"
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { Write-Host "ℹ $args" -ForegroundColor Blue }
function Write-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Write-Warn { Write-Host "⚠ $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "✗ $args" -ForegroundColor Red; exit 1 }

# Banner
Write-Host ""
Write-Host "  ____   ___  _____ _____ ____     ____   ___  _______  __  " -ForegroundColor Blue
Write-Host " / ____| / _ \|  ___| ____|  _ \   / ___| / _ \| ____\ \/ / " -ForegroundColor Blue
Write-Host "| |  _ / /_\\ \ |_  |  _| | |_) | | |  _ / /_\\ |  _|  \  /  " -ForegroundColor Blue
Write-Host "| |_| | |   |  _| | |___|  _ <  | |_| || |   | |___ /  \   " -ForegroundColor Blue
Write-Host " \____|_|   |_|   |_____|_| \_\  \____/|_|   |_____/_/\_\  " -ForegroundColor Blue
Write-Host "  AI-Powered Coding Assistant Installer"
Write-Host ""

# Detect architecture
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$platform = "windows-$arch"
Write-Info "Detected platform: $platform"

# Get version
if ($Version -eq "latest") {
    $apiUrl = "https://api.github.com/repos/codeforge-ai/codeforge-ai/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl
    $Version = $release.tag_name
}
Write-Info "Version: $Version"

# Create directories
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# Download
$filename = "codeforge-$Version-$platform.zip"
$url = "https://github.com/codeforge-ai/codeforge-ai/releases/download/$Version/$filename"
Write-Info "Downloading from: $url"

$zipPath = Join-Path $env:TEMP "codeforge.zip"
Invoke-WebRequest -Uri $url -OutFile $zipPath
Write-Success "Downloaded"

# Extract
Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
Remove-Item $zipPath
Write-Success "Extracted to $InstallDir"

# Add to PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$currentPath", "User")
    $env:Path = "$BinDir;$env:Path"
    Write-Success "Added $BinDir to PATH"
}

# Create wrapper script
$wrapper = @"
@echo off
node "$InstallDir\cli\index.js" %*
"@
Set-Content -Path "$BinDir\codeforge.cmd" -Value $wrapper
Write-Success "Installed to $BinDir\codeforge.cmd"

# Cleanup old version if exists
Remove-Item -Recurse -Force "$InstallDir\old" -ErrorAction SilentlyContinue

Write-Success "Installation complete!"
Write-Host ""
Write-Host "Run 'codeforge --help' to get started"
Write-Host "Run 'codeforge providers --set-key <key>' to configure"
Write-Host ""
