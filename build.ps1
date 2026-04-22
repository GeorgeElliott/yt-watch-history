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
}
else {
    Write-Host "Using version: $Version" -ForegroundColor Yellow
}

$zipName = "yt-watch-history-$Browser-v$Version.zip"
$zipPath = Join-Path $distDir $zipName

# Clean previous build (build dir only, keep dist dir to accumulate multiple browser builds)
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }

# Create directories
New-Item -ItemType Directory -Path $buildDir -ErrorAction SilentlyContinue | Out-Null
New-Item -ItemType Directory -Path $distDir -ErrorAction SilentlyContinue | Out-Null

# Copy src files into build
Write-Host "Copying source files..."
Copy-Item -Path "$srcDir\*" -Destination $buildDir -Recurse

# Remove icon.svg for Firefox builds
if ($Browser -eq "firefox") {
    $iconPath = Join-Path $buildDir "icons\icon.svg"
    if (Test-Path $iconPath) {
        Remove-Item -Path $iconPath -Force
        Write-Host "Removed icon.svg for Firefox build."
    }
}

# Swap manifest files based on browser
if ($Browser -eq "firefox") {
    # Use manifest.firefox.json as the main manifest
    $firefoxManifestPath = Join-Path $buildDir "manifest.firefox.json"
    $chromeManifestPath = Join-Path $buildDir "manifest.json"
    if (Test-Path $firefoxManifestPath) {
        Remove-Item -Path $chromeManifestPath -Force
        Rename-Item -Path $firefoxManifestPath -NewName "manifest.json"
        Write-Host "Using Firefox manifest."
    }
    else {
        Write-Host "Error: manifest.firefox.json not found." -ForegroundColor Red
        exit 1
    }
}
else {
    # Chrome/Edge: remove Firefox manifest
    $firefoxManifestPath = Join-Path $buildDir "manifest.firefox.json"
    if (Test-Path $firefoxManifestPath) {
        Remove-Item -Path $firefoxManifestPath -Force
        Write-Host "Removed manifest.firefox.json for Chrome build."
    }
}

# Read the manifest and update version
$manifestPath = Join-Path $buildDir "manifest.json"

# Update version in manifest using string replacement to preserve formatting
try {
    $manifestContent = Get-Content $manifestPath -Raw
    $replacement = '"version": "' + $Version + '"'
    $updatedContent = $manifestContent -replace '"version":\s*"[^"]*"', $replacement
    $updatedContent | Set-Content $manifestPath -Encoding UTF8
    Write-Host "Manifest updated with version $Version."
}
catch {
    Write-Host "ERROR: Failed to modify manifest: $_" -ForegroundColor Red
    exit 1
}

# Verify manifest file exists
if (-not (Test-Path $manifestPath)) {
    Write-Host "ERROR: Manifest file not found at $manifestPath" -ForegroundColor Red
    exit 1
}

# Create the zip
try {
    Compress-Archive -Path "$buildDir\*" -DestinationPath $zipPath -Force -ErrorAction Stop
}
catch {
    Write-Host "ERROR: Compress-Archive failed: $_" -ForegroundColor Red
    exit 1
}

# Verify file exists
if (-not (Test-Path $zipPath)) {
    Write-Host "ERROR: Failed to create $zipPath" -ForegroundColor Red
    exit 1
}

# Clean up build dir
Remove-Item -Recurse -Force $buildDir

Write-Host "Done! Package created:" -ForegroundColor Green
Write-Host "  $zipPath" -ForegroundColor Yellow
Write-Host ""

if ($browser -eq "firefox") {
    Write-Host "Submit at: https://addons.mozilla.org/developers/" -ForegroundColor Cyan
}
else {
    Write-Host "Submit at: https://chrome.google.com/webstore/devconsole" -ForegroundColor Cyan
    Write-Host "      or:  https://microsoftedge.microsoft.com/addons/" -ForegroundColor Cyan
}
Write-Host ""
