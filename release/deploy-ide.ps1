# CodeForge AI IDE Deployment Script
# Run this script to prepare the VSCodium fork for the CodeForge AI IDE build.

$IDE_PATH = "C:\Users\brave\codeforge-ai-ide"
$EXT_PATH = "C:\Users\brave\codeforge-ai-extension"

Write-Host "🚀 Starting CodeForge AI IDE Preparation..." -ForegroundColor Cyan

# 1. Create extensions directory and copy VSIX
Write-Host "📦 Copying CodeForge AI extension..."
If (!(Test-Path "$IDE_PATH\extensions")) { New-Item -ItemType Directory -Path "$IDE_PATH\extensions" -Force }
Copy-Item "$EXT_PATH\codeforge-ai-1.0.0.vsix" "$IDE_PATH\extensions\codeforge-ai.vsix" -Force

# 2. Copy Branding Overrides
Write-Host "🎨 Applying branding overrides..."
Copy-Item "$EXT_PATH\release\product-overrides.json" "$IDE_PATH\product-overrides.json" -Force

# 3. Update product.json
Write-Host "📝 Updating product.json..."
$productJsonPath = "$IDE_PATH\product.json"
$product = Get-Content $productJsonPath -Raw | ConvertFrom-Json

# Use Add-Member to ensure properties are added if they don't exist
$props = @{
    nameShort = "CodeForge AI"
    nameLong = "CodeForge AI"
    applicationName = "codeforge-ai"
    extensionPreload = @("codeforge-ai")
}

foreach ($name in $props.Keys) {
    If (!(Get-Member -InputObject $product -Name $name)) {
        Add-Member -InputObject $product -Type NoteProperty -Name $name -Value $props[$name]
    } Else {
        $product.$name = $props[$name]
    }
}

$product | ConvertTo-Json -Depth 10 | Set-Content $productJsonPath

# 4. Handle Icons
Write-Host "✨ Applying CodeForge AI icons..."
Copy-Item "$EXT_PATH\icon.svg" "$IDE_PATH\src\stable\resources\linux\code.svg" -Force
Copy-Item "$EXT_PATH\icon.svg" "$IDE_PATH\src\stable\src\vs\workbench\browser\media\code-icon.svg" -Force
Write-Host "⚠️  Note: .ico and .icns files still need manual conversion from SVG if required for full branding."

Write-Host "✅ IDE Preparation Complete!" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "1. cd $IDE_PATH"
Write-Host "2. yarn install"
Write-Host "3. yarn gulp vscode-win32-x64 (for Windows)"
