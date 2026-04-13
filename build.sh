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
        echo "Version from manifest: $VERSION"
    else
        echo "Error: node is required to read version from manifest."
        exit 1
    fi
else
    echo "Using version: $VERSION"
fi

ZIP_NAME="yt-watch-history-${BROWSER}-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

# Clean previous build
rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

# Copy src files into build
echo "Copying source files..."
cp -r "$SRC_DIR"/* "$BUILD_DIR/"

# Modify manifest for target browser
MANIFEST="$BUILD_DIR/manifest.json"

if [ "$BROWSER" = "firefox" ]; then
    # Replace service_worker with scripts for Firefox
    if command -v python3 &>/dev/null; then
        python3 -c "
import json
with open('$MANIFEST', 'r') as f:
    m = json.load(f)
m['version'] = '$VERSION'
m['background'] = {'scripts': ['background.js']}
if 'browser_specific_settings' not in m:
    m['browser_specific_settings'] = {'gecko': {'id': 'yt-watch-history', 'strict_min_version': '109.0'}}
with open('$MANIFEST', 'w') as f:
    json.dump(m, f, indent=2)
"
    elif command -v node &>/dev/null; then
        node -e "
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
m.version = '$VERSION';
m.background = { scripts: ['background.js'] };
if (!m.browser_specific_settings) {
    m.browser_specific_settings = { gecko: { id: 'yt-watch-history', strict_min_version: '109.0' } };
}
fs.writeFileSync('$MANIFEST', JSON.stringify(m, null, 2));
"
    else
        echo "Error: python3 or node is required to modify the manifest."
        exit 1
    fi
else
    # Chrome/Edge: ensure service_worker, remove browser_specific_settings
    if command -v python3 &>/dev/null; then
        python3 -c "
import json
with open('$MANIFEST', 'r') as f:
    m = json.load(f)
m['version'] = '$VERSION'
m['background'] = {'service_worker': 'background.js'}
m.pop('browser_specific_settings', None)
with open('$MANIFEST', 'w') as f:
    json.dump(m, f, indent=2)
"
    elif command -v node &>/dev/null; then
        node -e "
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
m.version = '$VERSION';
m.background = { service_worker: 'background.js' };
delete m.browser_specific_settings;
fs.writeFileSync('$MANIFEST', JSON.stringify(m, null, 2));
"
    else
        echo "Error: python3 or node is required to modify the manifest."
        exit 1
    fi
fi

echo "Manifest configured for $BROWSER with version $VERSION."

# Create zip
echo "Creating $ZIP_NAME..."
cd "$BUILD_DIR"
zip -r "$ZIP_PATH" . -q
cd "$SCRIPT_DIR"

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
