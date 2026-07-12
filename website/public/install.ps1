# CodeForge AI Installer for Windows
# Usage: irm https://codeforge.ai/install.ps1 | iex

param(
    [string]$Version = "1.0.0",
    [string]$InstallDir = "$env:USERPROFILE\.codeforge",
    [string]$BinDir = "$env:USERPROFILE\.local\bin"
)

$ErrorActionPreference = "Stop"

function Write-Info { Write-Host "ℹ $args" -ForegroundColor Blue }
function Write-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Write-Warn { Write-Host "⚠ $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "✗ $args" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  ____   ___  _____ _____ ____     ____   ___  _______  __  " -ForegroundColor Blue
Write-Host " / ____| / _ \|  ___| ____|  _ \   / ___| / _ \| ____\ \/ / " -ForegroundColor Blue
Write-Host "| |  _ / /_\\ \ |_  |  _| | |_) | | |  _ / /_\\ |  _|  \  /  " -ForegroundColor Blue
Write-Host "| |_| | |   |  _| | |___|  _ <  | |_| || |   | |___ /  \   " -ForegroundColor Blue
Write-Host " \____|_|   |_|   |_____|_| \_\  \____/|_|   |_____/_/\_\  " -ForegroundColor Blue
Write-Host "  AI-Powered Coding Assistant Installer"
Write-Host ""

$Repo = $env:CODEFORGE_REPO
if (-not $Repo) { $Repo = "ebitari-coder/codeforge-ai" }

$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$platform = "windows-$arch"
Write-Info "Detected platform: $platform"

# Try to get latest version
if ($Version -eq "latest" -or -not $Version) {
    try {
        $apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
        $release = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 5
        $Version = $release.tag_name -replace '^cli-v', ''
    } catch {
        $Version = "1.0.0"
        Write-Warn "Could not fetch latest version, using $Version"
    }
}
Write-Info "Version: $Version"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$filename = "codeforge-$Version-$platform.zip"
$downloaded = $false

# Try different tag formats
foreach ($tag in @("cli-v$Version", "v$Version", $Version)) {
    $url = "https://github.com/$Repo/releases/download/$tag/$filename"
    Write-Info "Trying: $url"
    try {
        $zipPath = Join-Path $env:TEMP "codeforge.zip"
        Invoke-WebRequest -Uri $url -OutFile $zipPath -TimeoutSec 30
        $downloaded = $true
        break
    } catch {
        continue
    }
}

if (-not $downloaded) {
    Write-Error "Failed to download. Check releases at: https://github.com/$Repo/releases"
}

Write-Success "Downloaded"

Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
Remove-Item $zipPath
Write-Success "Extracted to $InstallDir"

# Create wrapper
$wrapper = @"
@echo off
node "$InstallDir\cli\index.js" %*
"@
Set-Content -Path "$BinDir\codeforge.cmd" -Value $wrapper

# Add to PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$currentPath", "User")
    $env:Path = "$BinDir;$env:Path"
    Write-Success "Added $BinDir to PATH"
}

Write-Success "Installed to $BinDir\codeforge.cmd"
Write-Host ""
Write-Host "Run 'codeforge --help' to get started"
Write-Host ""
