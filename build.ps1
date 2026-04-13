# WatchHistory for YouTube - Build Script
# Packages the extension for Chrome/Edge or Firefox

param(
    [string]$Browser,
    [string]$Version
)

Write-Host ""
Write-Host "=== WatchHistory for YouTube - Build ===" -ForegroundColor Cyan
Write-Host ""

# Prompt for browser if not provided
if (-not $Browser) {
    Write-Host "Which browser are you building for?"
    Write-Host "  1) Chrome / Edge"
    Write-Host "  2) Firefox"
    Write-Host ""
    $choice = Read-Host "Enter 1 or 2"

    if ($choice -eq "1") {
        $Browser = "chrome"
    }
    elseif ($choice -eq "2") {
        $Browser = "firefox"
    }
    else {
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
}

# Validate browser parameter
if ($Browser -ne "chrome" -and $Browser -ne "firefox") {
    Write-Host "Invalid browser. Use 'chrome' or 'firefox'." -ForegroundColor Red
    exit 1
}

Write-Host "Building for $Browser..." -ForegroundColor Green

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcDir = Join-Path $root "src"
$distDir = Join-Path $root "dist"
$buildDir = Join-Path $root "build"

# Get version from manifest if not provided
if (-not $Version) {
    $manifest = Get-Content (Join-Path $srcDir "manifest.json") -Raw | ConvertFrom-Json
    $Version = $manifest.version
    Write-Host "Version from manifest: $Version" -ForegroundColor Yellow
}
else {
    Write-Host "Using version: $Version" -ForegroundColor Yellow
}

$zipName = "yt-watch-history-$Browser-v$Version.zip"
$zipPath = Join-Path $distDir $zipName

# Clean previous build
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }

# Create directories
New-Item -ItemType Directory -Path $buildDir | Out-Null
New-Item -ItemType Directory -Path $distDir | Out-Null

# Copy src files into build
Write-Host "Copying source files..."
Copy-Item -Path "$srcDir\*" -Destination $buildDir -Recurse

# Read the manifest and modify for the target browser
$manifestPath = Join-Path $buildDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

# Update version
$manifest.version = $Version

if ($Browser -eq "firefox") {
    # Firefox needs background.scripts instead of service_worker
    $manifest.background = @{ scripts = @("background.js") }

    # Ensure browser_specific_settings exists
    if (-not $manifest.browser_specific_settings) {
        $manifest | Add-Member -NotePropertyName "browser_specific_settings" -NotePropertyValue @{
            gecko = @{
                id = "yt-watch-history"
                strict_min_version = "109.0"
            }
        }
    }
}
else {
    # Chrome/Edge needs service_worker, remove browser_specific_settings
    $manifest.background = @{ service_worker = "background.js" }
    $manifest.PSObject.Properties.Remove("browser_specific_settings")
}

# Write the updated manifest
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8

Write-Host "Manifest configured for $Browser with version $Version."

# Create the zip
Write-Host "Creating $zipName..."
Compress-Archive -Path "$buildDir\*" -DestinationPath $zipPath -Force

# Verify file exists
if (-not (Test-Path $zipPath)) {
    Write-Host "Error: Failed to create $zipPath" -ForegroundColor Red
    exit 1
}

# Clean up build dir
Remove-Item -Recurse -Force $buildDir

Write-Host ""
Write-Host "Done! Package created:" -ForegroundColor Green
Write-Host "  $zipPath" -ForegroundColor Yellow
Get-Item $zipPath | Format-List Length, FullName
Write-Host ""
Write-Host ""

if ($browser -eq "firefox") {
    Write-Host "Submit at: https://addons.mozilla.org/developers/" -ForegroundColor Cyan
}
else {
    Write-Host "Submit at: https://chrome.google.com/webstore/devconsole" -ForegroundColor Cyan
    Write-Host "      or:  https://microsoftedge.microsoft.com/addons/" -ForegroundColor Cyan
}
Write-Host ""
