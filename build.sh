#!/bin/bash

# WatchHistory for YouTube - Build Script
# Packages the extension for Chrome/Edge or Firefox
# Usage: ./build.sh [chrome|firefox] [version]

set -e

BROWSER="${1:-}"
VERSION="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
BUILD_DIR="$SCRIPT_DIR/build"
DIST_DIR="$SCRIPT_DIR/dist"

echo ""
echo "=== WatchHistory for YouTube - Build ==="
echo ""

# Prompt for browser if not provided
if [ -z "$BROWSER" ]; then
    echo "Which browser are you building for?"
    echo "  1) Chrome / Edge"
    echo "  2) Firefox"
    echo ""
    read -p "Enter 1 or 2: " choice

    case "$choice" in
        1) BROWSER="chrome" ;;
        2) BROWSER="firefox" ;;
        *)
            echo "Invalid choice. Exiting."
            exit 1
            ;;
    esac
fi

# Validate browser parameter
if [ "$BROWSER" != "chrome" ] && [ "$BROWSER" != "firefox" ]; then
    echo "Invalid browser. Use 'chrome' or 'firefox'."
    exit 1
fi

echo "Building for $BROWSER..."

# Get version from manifest if not provided
if [ -z "$VERSION" ]; then
    if command -v node &>/dev/null; then
        VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SRC_DIR/manifest.json', 'utf8')).version)")
    else
        echo "Error: node is required to read version from manifest."
        exit 1
    fi
fi

ZIP_NAME="yt-watch-history-${BROWSER}-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

# Clean previous build (build dir only, keep dist dir to accumulate multiple browser builds)
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

# Copy src files into build
echo "Copying source files..."
cp -r "$SRC_DIR"/* "$BUILD_DIR/"

# Remove icon.svg for Firefox builds
if [ "$BROWSER" = "firefox" ]; then
    if [ -f "$BUILD_DIR/icons/icon.svg" ]; then
        rm "$BUILD_DIR/icons/icon.svg"
        echo "Removed icon.svg for Firefox build."
    fi
fi

# Modify manifest for target browser
MANIFEST="build/manifest.json"

if [ "$BROWSER" = "firefox" ]; then
    # Replace service_worker with scripts for Firefox
    if command -v node &>/dev/null; then
        node -e "
const fs = require('fs');
const path = require('path');
try {
    const manifestPath = path.join(process.cwd(), '$MANIFEST');
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.version = '$VERSION';
    m.background = { scripts: ['background.js'] };
    if (!m.browser_specific_settings) {
        m.browser_specific_settings = { gecko: { id: 'yt-watch-history', strict_min_version: '109.0' } };
    }
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
} catch (e) {
    console.error('ERROR: Failed to modify manifest:', e.message);
    process.exit(1);
}
" || { echo "Error: Manifest modification failed for Firefox"; exit 1; }
    elif command -v python3 &>/dev/null; then
        python3 -c "
import json
try:
    with open('$MANIFEST', 'r') as f:
        m = json.load(f)
    m['version'] = '$VERSION'
    m['background'] = {'scripts': ['background.js']}
    if 'browser_specific_settings' not in m:
        m['browser_specific_settings'] = {'gecko': {'id': 'yt-watch-history', 'strict_min_version': '109.0'}}
    with open('$MANIFEST', 'w') as f:
        json.dump(m, f, indent=2)
except Exception as e:
    print(f'ERROR: Failed to modify manifest: {e}')
    exit(1)
" || { echo "Error: Manifest modification failed for Firefox"; exit 1; }
    else
        echo "Error: node or python3 is required to modify the manifest."
        exit 1
    fi
else
    # Chrome/Edge: ensure service_worker, remove browser_specific_settings
    if command -v node &>/dev/null; then
        node -e "
const fs = require('fs');
const path = require('path');
try {
    const manifestPath = path.join(process.cwd(), '$MANIFEST');
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.version = '$VERSION';
    m.background = { service_worker: 'background.js' };
    delete m.browser_specific_settings;
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
} catch (e) {
    console.error('ERROR: Failed to modify manifest:', e.message);
    process.exit(1);
}
" || { echo "Error: Manifest modification failed for Chrome"; exit 1; }
    elif command -v python3 &>/dev/null; then
        python3 -c "
import json
try:
    with open('$MANIFEST', 'r') as f:
        m = json.load(f)
    m['version'] = '$VERSION'
    m['background'] = {'service_worker': 'background.js'}
    m.pop('browser_specific_settings', None)
    with open('$MANIFEST', 'w') as f:
        json.dump(m, f, indent=2)
except Exception as e:
    print(f'ERROR: Failed to modify manifest: {e}')
    exit(1)
" || { echo "Error: Manifest modification failed for Chrome"; exit 1; }
    else
        echo "Error: node or python3 is required to modify the manifest."
        exit 1
    fi
fi

echo "Manifest configured for $BROWSER with version $VERSION."
echo "Verifying manifest was created..."
if [ ! -f "$BUILD_DIR/manifest.json" ]; then
    echo "Error: Manifest file not found at $BUILD_DIR/manifest.json"
    exit 1
fi

# Create zip
echo "Creating $ZIP_NAME..."

if [ ! -d "$BUILD_DIR" ]; then
    echo "Error: Build directory not found at $BUILD_DIR"
    exit 1
fi

# Create ZIP from build directory
cd "$BUILD_DIR" || exit 1
zip -r "$ZIP_PATH" . -q
ZIP_RESULT=$?
cd "$SCRIPT_DIR" || exit 1

if [ $ZIP_RESULT -ne 0 ]; then
    echo "Error: zip command failed with code $ZIP_RESULT"
    exit 1
fi

# Verify file exists
if [ ! -f "$ZIP_PATH" ]; then
    echo ""
    echo "ERROR: Failed to create $ZIP_PATH"
    exit 1
fi

# Clean up
rm -rf "$BUILD_DIR"

echo ""
echo "Done! Package created:"
echo "  $ZIP_PATH"
echo ""

if [ "$BROWSER" = "firefox" ]; then
    echo "Submit at: https://addons.mozilla.org/developers/"
else
    echo "Submit at: https://chrome.google.com/webstore/devconsole"
    echo "      or:  https://microsoftedge.microsoft.com/addons/"
fi
echo ""
